/**
 * Executors for approved requests — the actual mutation each gated route
 * would have performed immediately for an admin/super_admin. Registered
 * here under "resource:action" so app/api/admin/approvals/[id]/decide can
 * re-run the original intent generically once an admin approves it, instead
 * of every gated route needing its own bespoke "apply this approval" branch.
 *
 * Each gated route calls the same function directly for its own
 * admin/super_admin fast path — this file is the single source of truth for
 * "what does approving X actually do", never duplicated.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { invalidateProductCache, invalidateTestimonialCache } from "@/lib/cache-tags";
import { createNotification } from "@/lib/notify";
import { publishQstashJSON } from "@/lib/qstash";
import { runCampaignSend, markCampaignFailed } from "@/lib/campaigns/send-campaign";
import type { CampaignStatus } from "@prisma/client";
import { syncProductVariants, type VariantInput } from "@/lib/products/sync-variants";
import { runZohoSync } from "@/lib/zoho-sync";
import { resolveZohoOrganizationId } from "@/lib/zoho/resolve-org";
import { r2Client } from "@/lib/r2";
import { generateExportFile } from "@/lib/reports/generate-export";
import type { ExportFilters } from "@/lib/reports/types";
import { sendSms, hasSmsConfig } from "@/lib/sms";

/** Shared by the promotions create/update executors and the routes that queue them. */
type PromotionPayload = {
  id?: string;
  name?: string;
  type?: string;
  value?: number;
  code?: string | null;
  minOrder?: number | null;
  maxUses?: number | null;
  maxUsesPerUser?: number;
  maxDiscountKes?: number | null;
  pointsAward?: number;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
};
import { combineLegacyPhone, normalizePhoneE164 } from "@/lib/phone";
import { sendOrderContactEmail } from "@/lib/email";
import { buildContactMessage, buildContactEmailHtml } from "@/lib/orders/build-contact-message";

export type ContactChannel = "SMS" | "INBOX" | "EMAIL";
export type ContactChannelResult = { channel: ContactChannel; ok: boolean; error?: string };
export type ContactPayload = {
  channels: ContactChannel[];
  greeting: string;
  body: string;
  ctaLink?: string;
  /** Which table `orderId` belongs to — defaults to "order" (online) for
   * backward compat with existing approvalRequest rows that predate the
   * in-store contact feature. */
  kind?: "order" | "instore";
};

/**
 * Shared by the contact route's fast path (allowed roles send immediately)
 * and the approval executor below (queued roles' request, once approved) —
 * single source of truth for what "send this customer-contact message"
 * actually does, per lib/approval-executors.ts's own file-level convention.
 */
export async function sendOrderContactMessage(
  orderId: string,
  { channels, greeting, body, ctaLink, kind = "order" }: ContactPayload,
): Promise<{ results: ContactChannelResult[]; orderRef: string } | null> {
  if (kind === "instore") return sendInStoreContactMessage(orderId, { channels, greeting, body, ctaLink });

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, phoneCode: true } },
      branch: { select: { id: true, phone: true } },
    },
  });
  if (!order) return null;

  const customerName = order.user?.name ?? null;
  const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;
  const messageBody = buildContactMessage({ greeting, customerName, body, branchPhone: order.branch?.phone ?? null, ctaLink });

  const results: ContactChannelResult[] = [];

  for (const channel of channels) {
    try {
      if (channel === "SMS") {
        const phone = order.user?.phone
          ? combineLegacyPhone(order.user.phone, order.user.phoneCode ?? null)
          : order.deliveryPhone
          ? normalizePhoneE164(order.deliveryPhone)
          : null;
        if (!hasSmsConfig() || !phone) throw new Error("SMS not available for this order");
        await sendSms(phone, messageBody);
        results.push({ channel, ok: true });
      } else if (channel === "INBOX") {
        if (!order.userId) throw new Error("Guest order has no inbox");
        await db.inboxMessage.create({
          data: { userId: order.userId, type: "ORDER_UPDATE", title: `Message about order ${orderRef}`, body: messageBody, orderId: order.id },
        });
        results.push({ channel, ok: true });
      } else {
        const email = order.user?.email ?? order.guestEmail;
        if (!email) throw new Error("No email on file");
        const html = buildContactEmailHtml({ greeting, customerName, body, branchPhone: order.branch?.phone ?? null, orderRef, ctaLink });
        await sendOrderContactEmail(email, `Order ${orderRef} — Fechi Organics`, html);
        results.push({ channel, ok: true });
      }
    } catch (e) {
      console.error("[order-contact] channel failed:", channel, e);
      results.push({ channel, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  return { results, orderRef };
}

/**
 * In-store variant — customer identity lives directly on inStoreOrder
 * (customerName/Phone/Email, no join needed), and customerUserId is set by
 * lib/customers/find-or-create-walkin.ts when the walk-in was resolved to a
 * real customer record, which is what makes INBOX possible here at all.
 */
async function sendInStoreContactMessage(
  orderId: string,
  { channels, greeting, body, ctaLink }: Omit<ContactPayload, "kind">,
): Promise<{ results: ContactChannelResult[]; orderRef: string } | null> {
  const order = await db.inStoreOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      customerUserId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      branch: { select: { phone: true } },
    },
  });
  if (!order) return null;

  const customerName = order.customerName ?? null;
  const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;
  const messageBody = buildContactMessage({ greeting, customerName, body, branchPhone: order.branch?.phone ?? null, ctaLink });

  const results: ContactChannelResult[] = [];

  for (const channel of channels) {
    try {
      if (channel === "SMS") {
        const phone = order.customerPhone ? normalizePhoneE164(order.customerPhone) : null;
        if (!hasSmsConfig() || !phone) throw new Error("SMS not available for this order");
        await sendSms(phone, messageBody);
        results.push({ channel, ok: true });
      } else if (channel === "INBOX") {
        if (!order.customerUserId) throw new Error("This walk-in has no linked account inbox");
        await db.inboxMessage.create({
          data: { userId: order.customerUserId, type: "ORDER_UPDATE", title: `Message about order ${orderRef}`, body: messageBody, orderId: order.id },
        });
        results.push({ channel, ok: true });
      } else {
        const email = order.customerEmail;
        if (!email || email.endsWith("@instore.local")) throw new Error("No email on file");
        const html = buildContactEmailHtml({ greeting, customerName, body, branchPhone: order.branch?.phone ?? null, orderRef, ctaLink });
        await sendOrderContactEmail(email, `Order ${orderRef} — Fechi Organics`, html);
        results.push({ channel, ok: true });
      }
    } catch (e) {
      console.error("[instore-order-contact] channel failed:", channel, e);
      results.push({ channel, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  return { results, orderRef };
}

type Executor = (payload: Record<string, unknown>, resourceId: string | null) => Promise<unknown>;

// Each gated route calls its own executor directly for the admin/super_admin
// fast path (so the response shape it already returns — { product }, etc. —
// stays intact), and the same function is what app/api/admin/approvals/[id]/
// decide/route.ts calls once an admin approves a queued request.
export const approvalExecutors: Record<string, Executor> = {
  "products:create": async (payload) => {
    const { imageObjectKeys, variants, ...productData } = payload as
      { imageObjectKeys?: string[]; variants?: VariantInput[] } & Record<string, unknown>;
    const product = await db.product.create({
      data: {
        ...(productData as Prisma.productCreateInput),
        ...(imageObjectKeys?.length
          ? { images: { create: imageObjectKeys.map((objectKey, idx) => ({ objectKey, isPrimary: idx === 0, sortOrder: idx })) } }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { objectKey: true, isPrimary: true } },
      },
    });
    await syncProductVariants(product.id, variants);
    invalidateProductCache(product.slug);
    createNotification({
      type: "PRODUCT_ADDED",
      title: `New product added: ${product.name}`,
      body: `"${product.name}" has been published to the store.`,
      link: `/admin/products`,
    }).catch(() => {});
    return product;
  },

  "products:update": async (payload, resourceId) => {
    if (!resourceId) return null;
    const { imageObjectKeys, variants, id: _id, ...data } = payload as
      { imageObjectKeys?: string[]; variants?: VariantInput[]; id?: string } & Record<string, unknown>;
    const existing = await db.product.findUnique({ where: { id: resourceId }, select: { slug: true } });
    const product = await db.product.update({ where: { id: resourceId }, data: data as Prisma.productUpdateInput });
    if (imageObjectKeys !== undefined) {
      await db.productImage.deleteMany({ where: { productId: resourceId } });
      if (imageObjectKeys.length > 0) {
        await db.productImage.createMany({
          data: imageObjectKeys.map((objectKey, idx) => ({ productId: resourceId, objectKey, isPrimary: idx === 0, sortOrder: idx })),
        });
      }
    }
    await syncProductVariants(resourceId, variants);
    invalidateProductCache(existing?.slug, product.slug);
    return product;
  },

  "products:delete": async (payload, resourceId) => {
    if (!resourceId) return null;
    await db.$transaction([
      db.cartItem.deleteMany({ where: { productId: resourceId } }),
      db.product.delete({ where: { id: resourceId } }),
    ]);
    const slug = (payload as { slug?: string }).slug;
    if (slug) invalidateProductCache(slug);
    return { id: resourceId };
  },

  // Soft delete (isActive: false) — distinct from "products:delete" (the
  // permanent, hard delete). Reason is required by the route and stored in
  // the approvalRequest payload / audit log details, not used here.
  "products:archive": async (payload, resourceId) => {
    if (!resourceId) return null;
    const product = await db.product.update({ where: { id: resourceId }, data: { isActive: false } });
    const slug = (payload as { slug?: string }).slug ?? product.slug;
    invalidateProductCache(slug);
    createNotification({
      type: "PRODUCT_DELETED",
      title: `Product removed: ${product.name}`,
      body: `"${product.name}" has been unpublished from the store.`,
      link: "/admin/products",
    }).catch(() => {});
    return { id: resourceId };
  },

  "branches:update": async (payload, resourceId) => {
    if (!resourceId) return null;
    const { zohoOrganizationId, zohoLocationId, zohoWarehouseId } = payload as {
      zohoOrganizationId?: string; zohoLocationId?: string; zohoWarehouseId?: string;
    };
    const data: { zohoOrganizationId?: string | null; zohoLocationId?: string | null; zohoWarehouseId?: string | null } = {};
    if (zohoOrganizationId !== undefined) data.zohoOrganizationId = zohoOrganizationId || null;
    if (zohoLocationId !== undefined) data.zohoLocationId = zohoLocationId || null;
    if (zohoWarehouseId !== undefined) data.zohoWarehouseId = zohoWarehouseId || null;
    if (Object.keys(data).length > 0) {
      await db.branch.update({ where: { id: resourceId }, data });
    }
    return { saved: true };
  },

  "staff:assign_roles": async (payload, resourceId) => {
    if (!resourceId) return null;
    const { role, permissions, isSuperAdmin } = payload as { role?: string; permissions?: { deny?: string[] }; isSuperAdmin?: boolean };
    const profileUpdate: Record<string, unknown> = {};
    if (role) profileUpdate.role = role;
    if (permissions) profileUpdate.permissions = permissions;
    if (typeof isSuperAdmin === "boolean") profileUpdate.isSuperAdmin = isSuperAdmin;
    if (Object.keys(profileUpdate).length > 0) {
      return db.user.update({ where: { id: resourceId }, data: { adminProfile: { update: profileUpdate } } });
    }
    return null;
  },

  "staff:delete": async (_payload, resourceId) => {
    if (!resourceId) return null;
    await db.user.delete({ where: { id: resourceId } });
    return { deleted: resourceId };
  },

  "content:publish": async (payload, resourceId) => {
    if (!resourceId) return null;
    const { publishedAt, scheduledAt } = payload as { publishedAt?: string; scheduledAt?: string };
    if (scheduledAt) {
      const targetDate = new Date(scheduledAt);
      await publishQstashJSON("/api/admin/workers/publish-blog-post", { postId: resourceId }, {
        notBefore: Math.floor(targetDate.getTime() / 1000),
      });
      return db.blogPost.update({ where: { id: resourceId }, data: { status: "SCHEDULED", publishedAt: targetDate } });
    }
    return db.blogPost.update({
      where: { id: resourceId },
      data: { status: "PUBLISHED", publishedAt: publishedAt ? new Date(publishedAt) : new Date() },
    });
  },

  // Mirrors POST /api/admin/campaigns' shaping (app/api/admin/campaigns/route.ts).
  "campaigns:create": async (payload) => {
    const body = payload as {
      name: string; type: string; audienceType?: string; subject?: string; heading?: string;
      previewText?: string; content?: string; audienceCustomerIds?: string[];
      status?: string; scheduledAt?: string;
    };
    return db.campaign.create({
      data: {
        name: body.name.trim(),
        type: body.type as Prisma.campaignCreateInput["type"],
        audienceType: body.audienceType ?? "ALL",
        subject: body.subject ?? null,
        heading: body.heading ?? null,
        previewText: body.previewText ?? null,
        content: body.content ?? null,
        audienceCustomerIds: body.audienceCustomerIds ?? [],
        status: (body.status ?? "DRAFT") as Prisma.campaignCreateInput["status"],
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      },
    });
  },

  // Mirrors POST /api/admin/campaigns/[id]/send (app/api/admin/campaigns/[id]/send/route.ts).
  "campaigns:send": async (payload, resourceId) => {
    if (!resourceId) return null;
    const { mode, scheduledAt } = payload as { mode?: "now" | "schedule" | "later"; scheduledAt?: string };
    const campaign = await db.campaign.findUnique({ where: { id: resourceId } });
    if (!campaign) return null;

    const SEND_LATER_DELAY_SECONDS = 5 * 60;
    let notBefore: number | undefined;
    let data: { status: CampaignStatus; scheduledAt?: Date; sentAt?: Date };

    if (mode === "schedule") {
      const targetDate = new Date(scheduledAt!);
      notBefore = Math.floor(targetDate.getTime() / 1000);
      data = { status: "SCHEDULED", scheduledAt: targetDate };
    } else if (mode === "later") {
      const targetDate = new Date(Date.now() + SEND_LATER_DELAY_SECONDS * 1000);
      notBefore = Math.floor(targetDate.getTime() / 1000);
      data = { status: "SENDING", scheduledAt: targetDate };
    } else {
      data = { status: "SENDING", sentAt: new Date() };
    }

    const published = await publishQstashJSON(
      "/api/admin/workers/send-campaign", { campaignId: resourceId }, notBefore ? { notBefore } : undefined
    );
    const updated = await db.campaign.update({ where: { id: resourceId }, data });

    if (!published && (mode ?? "now") === "now") {
      runCampaignSend(resourceId, updated).catch((err) => markCampaignFailed(resourceId, err));
    }
    return updated;
  },

  // "kind" tags which content sub-type this is — see app/api/admin/testimonials
  // and app/api/admin/faqs' route.ts for the shapes this mirrors.
  "content:create": async (payload) => {
    const kind = (payload as { kind?: string }).kind;
    if (kind === "testimonial") {
      const { authorName, location, quote, rating, beforeKey, afterKey, source, sortOrder } = payload as Record<string, unknown>;
      const t = await db.testimonial.create({
        data: { authorName, location, quote, rating, beforeKey, afterKey, source, sortOrder } as unknown as Prisma.testimonialCreateInput,
      });
      invalidateTestimonialCache();
      return t;
    } else if (kind === "faq") {
      const { question, answer, group, order, status } = payload as Record<string, unknown>;
      return db.faq.create({ data: { question, answer, group, order, status } as unknown as Prisma.faqCreateInput });
    }
    return null;
  },

  "content:update": async (payload, resourceId) => {
    if (!resourceId) return null;
    const { kind, ...data } = payload as { kind?: string } & Record<string, unknown>;
    if (kind === "faq") {
      return db.faq.update({ where: { id: resourceId }, data: data as Prisma.faqUpdateInput });
    }
    const t = await db.testimonial.update({ where: { id: resourceId }, data: data as Prisma.testimonialUpdateInput });
    invalidateTestimonialCache();
    return t;
  },

  "content:delete": async (payload, resourceId) => {
    if (!resourceId) return null;
    const kind = (payload as { kind?: string }).kind;
    if (kind === "faq") {
      await db.faq.delete({ where: { id: resourceId } });
      return { id: resourceId };
    }
    await db.testimonial.delete({ where: { id: resourceId } });
    invalidateTestimonialCache();
    return { id: resourceId };
  },

  // Mirrors POST /api/admin/promotions' shaping (app/api/admin/promotions/route.ts).
  //
  // Fields are enumerated, not spread — anything added to the promotion model
  // and not listed here is silently dropped when a queued request is approved.
  // maxDiscountKes was missing for exactly that reason.
  "promotions:create": async (payload) => {
    const body = payload as PromotionPayload;
    return db.promotion.create({
      data: {
        name: (body.name ?? "").trim(),
        type: body.type,
        value: body.value,
        code: body.code ?? null,
        minOrder: body.minOrder ?? null,
        maxUses: body.maxUses ?? null,
        maxUsesPerUser: body.maxUsesPerUser ?? 1,
        maxDiscountKes: body.maxDiscountKes ?? null,
        pointsAward: body.pointsAward ?? 0,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: body.status ?? "active",
        // Reaching this executor means the request was approved (or the caller
        // bypassed the queue), so the coupon is live either way.
        approvalStatus: "APPROVED",
      } as unknown as Prisma.promotionCreateInput,
    });
  },

  // Without this, PATCH wrote straight to the database and any role holding
  // promotions:update could create a 0-point coupon then edit points onto it,
  // bypassing approval entirely.
  "promotions:update": async (payload, resourceId) => {
    const body = payload as PromotionPayload;
    const id = resourceId ?? body.id;
    if (!id) throw new Error("promotions:update requires a promotion id");

    return db.promotion.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.type !== undefined && { type: String(body.type) }),
        ...(body.value !== undefined && { value: Number(body.value) }),
        ...(body.code !== undefined && { code: body.code ? String(body.code) : null }),
        // `?? null` rather than a truthiness check — a minOrder of 0 is a real
        // value and must not be silently turned into "no minimum".
        ...(body.minOrder !== undefined && { minOrder: body.minOrder ?? null }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses ?? null }),
        ...(body.maxUsesPerUser !== undefined && { maxUsesPerUser: Number(body.maxUsesPerUser) }),
        ...(body.maxDiscountKes !== undefined && { maxDiscountKes: body.maxDiscountKes ?? null }),
        ...(body.pointsAward !== undefined && { pointsAward: Number(body.pointsAward) }),
        ...(body.startDate !== undefined && {
          startDate: body.startDate ? new Date(body.startDate) : null,
        }),
        ...(body.endDate !== undefined && {
          endDate: body.endDate ? new Date(body.endDate) : null,
        }),
        ...(body.status !== undefined && { status: String(body.status) }),
        approvalStatus: "APPROVED",
      },
    });
  },

  "inventory:sync": async (payload, resourceId) => {
    const branchId = resourceId ?? (payload as { branchId?: string }).branchId;
    if (!branchId) return null;
    const organizationId = await resolveZohoOrganizationId(branchId);
    if (!organizationId) return null;
    return runZohoSync(organizationId);
  },

  "settings:update": async (payload) => {
    const { key, value } = payload as { key: string; value: unknown };
    return db.systemConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  },

  "orders:export": async (payload, resourceId) => runExportExecutor("orders", payload, resourceId),
  "finance:export": async (payload, resourceId) => runExportExecutor("finance", payload, resourceId),

  "order:contact": async (payload, resourceId) => {
    if (!resourceId) return null;
    return sendOrderContactMessage(resourceId, payload as unknown as ContactPayload);
  },
};

// Shared body for the two export executors above — generates the file
// (same lib/reports/generate-export.ts call the admin fast-path routes use
// directly), uploads it to R2, and flips the exportRequest row from
// PENDING/GENERATING to READY (or FAILED on error) so the header's polling
// endpoint (GET /api/admin/exports/mine) can pick it up for the original
// requester.
async function runExportExecutor(
  resource: "orders" | "finance",
  payload: Record<string, unknown>,
  resourceId: string | null,
): Promise<unknown> {
  if (!resourceId) return null;
  const exportRequest = await db.exportRequest.findUnique({
    where: { id: resourceId },
    include: { requestedBy: { select: { branchId: true, role: true } } },
  });
  if (!exportRequest) return null;

  await db.exportRequest.update({ where: { id: resourceId }, data: { status: "GENERATING" } });

  try {
    const { buffer, fileName, contentType } = await generateExportFile(resource, payload as ExportFilters);
    const fileKey = `exports/${resource}/${exportRequest.id}.${fileName.split(".").pop()}`;
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    }));

    await db.exportRequest.update({
      where: { id: resourceId },
      data: { status: "READY", fileKey, fileName, fileSizeBytes: buffer.byteLength },
    });

    createNotification({
      type: "EXPORT_READY",
      title: "Your export is ready",
      body: `Your ${resource} report (${fileName}) has finished generating and is ready to download.`,
      link: "/admin",
      branchId: exportRequest.requestedBy.branchId,
      targetRoles: [exportRequest.requestedBy.role],
    }).catch(() => {});

    return { exportRequestId: exportRequest.id, fileKey };
  } catch (e) {
    console.error("[approval-executors] export generation failed", e);
    await db.exportRequest.update({
      where: { id: resourceId },
      data: { status: "FAILED", errorMessage: e instanceof Error ? e.message : "Generation failed" },
    });
    return null;
  }
}
