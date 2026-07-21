import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

async function callerId(req: NextRequest): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Shared user-with-profile selector
// ---------------------------------------------------------------------------
const userSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  banned: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
  sessions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { createdAt: true },
  },
  adminProfile: {
    select: {
      id: true,
      fullName: true,
      department: true,
      permissions: true,
      isActive: true,
    },
  },
  clientProfile: {
    select: {
      id: true,
      phone: true,
      country: true,
      city: true,
      loginCount: true,
    },
  },
};

// ---------------------------------------------------------------------------
// GET /api/admin/users/[id]
// Returns a single user with their role-specific profile included.
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["view"] });
    if (denied) return denied;

    const { id } = await params;

    const user = await db.user.findUnique({ where: { id }, select: userSelect });
    if (!user) return Err.notFound("User");

    return ok({ user });
  } catch (e) {
    console.error("[admin/users/:id] GET error", e);
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// Password generator — 12 chars, readable charset (no O/0/I/l ambiguity)
// ---------------------------------------------------------------------------
function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => chars[b % chars.length])
    .join("");
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[id]
// Partial update: profile fields, role change, ban/unban, password reset.
// ---------------------------------------------------------------------------
const PatchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "client"]).optional(),
  banned: z.boolean().optional(),
  department: z.string().optional(),
  permissions: z.record(z.string(), z.unknown()).optional(),
  resetPassword: z.boolean().optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["update"] });
    if (denied) return denied;

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    // Confirm target user exists
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return Err.notFound("User");

    const { firstName, lastName, name, email, role, banned, department, permissions, resetPassword } =
      parsed.data;

    let newPassword: string | undefined;

    // --- Role change via Better Auth admin plugin ---
    if (role && role !== target.role) {
      // Prevent an admin from demoting themselves
      const callerUserId = await callerId(req);
      if (id === callerUserId && role !== "admin") {
        return Err.validation("You cannot change your own role");
      }
      // See the matching comment in app/api/admin/users/route.ts — this
      // toggles the coarse Prisma UserRole, not the fine-grained
      // admin-panel roles that admin()'s `roles` config actually types this
      // param against.
      await auth.api.setRole({
        headers: req.headers,
        body: { userId: id, role: role as unknown as NonNullable<Parameters<typeof auth.api.setRole>[0]>["body"]["role"] },
      });
    }

    // --- Ban / unban via Better Auth admin plugin ---
    if (banned === true && !target.banned) {
      await auth.api.banUser({ headers: req.headers, body: { userId: id } });
    } else if (banned === false && target.banned) {
      await auth.api.unbanUser({ headers: req.headers, body: { userId: id } });
    }

    // --- Password reset ---
    if (resetPassword) {
      newPassword = generatePassword();
      // Update the credential directly on the account row — Better Auth
      // stores bcrypt-hashed passwords in the account table (providerId="credential").
      // We call setPassword which handles hashing.
      await auth.api.setUserPassword({ headers: req.headers, body: { userId: id, newPassword } });
    }

    // --- Core user fields ---
    const userUpdateData: Record<string, unknown> = {};
    if (firstName) userUpdateData.firstName = firstName;
    if (lastName) userUpdateData.lastName = lastName;
    if (name) userUpdateData.name = name;
    // Derive name from first+last if both provided but name not explicitly set
    if (firstName && lastName && !name) {
      userUpdateData.name = `${firstName} ${lastName}`.trim();
    }
    if (email) userUpdateData.email = email;

    if (Object.keys(userUpdateData).length > 0) {
      await db.user.update({ where: { id }, data: userUpdateData });
    }

    // --- Profile fields ---
    const newRole = role ?? target.role;

    if (newRole === "admin" && (department !== undefined || permissions !== undefined)) {
      await db.adminProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          fullName: userUpdateData.name as string ?? target.name,
          ...(department ? { department } : {}),
          ...(permissions ? { permissions: JSON.parse(JSON.stringify(permissions)) } : {}),
        },
        update: {
          ...(department !== undefined ? { department } : {}),
          ...(permissions !== undefined ? { permissions: JSON.parse(JSON.stringify(permissions)) } : {}),
        },
      });
    }

    // Re-fetch fresh user with profile for the response
    const user = await db.user.findUnique({ where: { id }, select: userSelect });

    console.info("[admin/users/:id] PATCH — updated user", id);
    return ok({ user, ...(newPassword ? { newPassword } : {}) });
  } catch (e: unknown) {
    console.error("[admin/users/:id] PATCH error", e);
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("Email already in use by another account");
    }
    return Err.internal(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/[id]
// Soft delete: ban the user + mark adminProfile.isActive = false.
// Does NOT remove the row — preserves audit history.
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const denied = await requirePermission(req, { customers: ["update"] });
    if (denied) return denied;

    const { id } = await params;

    // Prevent self-deletion
    const callerUserId = await callerId(req);
    if (id === callerUserId) {
      return Err.validation("You cannot deactivate your own account");
    }

    const target = await db.user.findUnique({
      where: { id },
      include: { adminProfile: true },
    });
    if (!target) return Err.notFound("User");

    // Ban via Better Auth so all active sessions are invalidated
    if (!target.banned) {
      await auth.api.banUser({ body: { userId: id } });
    }

    // Mark adminProfile inactive if this is an admin user
    if (target.role === "admin" && target.adminProfile) {
      await db.adminProfile.update({
        where: { userId: id },
        data: { isActive: false },
      });
    }

    console.info("[admin/users/:id] DELETE (soft) — deactivated user", id);
    return ok({ id, deactivated: true });
  } catch (e) {
    console.error("[admin/users/:id] DELETE error", e);
    return Err.internal(e);
  }
}
