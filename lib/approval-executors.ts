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
import { invalidateProductCache, invalidateTestimonialCache } from "@/lib/cache-tags";
import { createNotification } from "@/lib/notify";
import { publishQstashJSON } from "@/lib/qstash";
import { runCampaignSend, markCampaignFailed } from "@/lib/campaigns/send-campaign";
import type { CampaignStatus } from "@prisma/client";
import { syncProductVariants, type VariantInput } from "@/lib/products/sync-variants";

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
  "promotions:create": async (payload) => {
    const body = payload as {
      name: string; type: string; value: number; code?: string; minOrder?: number;
      maxUses?: number; maxUsesPerUser?: number; startDate?: string; endDate?: string; status?: string;
    };
    return db.promotion.create({
      data: {
        name: body.name.trim(),
        type: body.type,
        value: body.value,
        code: body.code ?? null,
        minOrder: body.minOrder ?? null,
        maxUses: body.maxUses ?? null,
        maxUsesPerUser: body.maxUsesPerUser ?? 1,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: body.status ?? "active",
      } as unknown as Prisma.promotionCreateInput,
    });
  },

  "settings:update": async (payload) => {
    const { key, value } = payload as { key: string; value: unknown };
    return db.systemConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  },
};
