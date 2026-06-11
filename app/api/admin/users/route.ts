import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { headers } from "next/headers";

// ---------------------------------------------------------------------------
// Auth guard — confirms the caller is a signed-in admin.
// Returns the user record on success, null otherwise.
// ---------------------------------------------------------------------------
async function requireAdmin(req?: NextRequest) {
  const h = req ? req.headers : await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  return user?.role === "admin" ? user : null;
}
 
// ---------------------------------------------------------------------------
// GET /api/admin/users
// Returns all users with query filtering: role, search (name/email), status.
// Pagination: limit + offset via query params (default 50 per page).
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role") as "admin" | "client" | null;
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status"); // "active" | "inactive" | "banned"
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Build the where clause incrementally so it stays readable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "banned") {
      where.banned = true;
    } else if (status === "active") {
      where.banned = false;
    } else if (status === "inactive") {
      // Inactive = adminProfile.isActive false (admin users only)
      where.adminProfile = { isActive: false };
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
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
          // Include last session to derive "last login"
          sessions: {
            orderBy: { createdAt: "desc" },
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
        },
      }),
      db.user.count({ where }),
    ]);

    console.info("[admin/users] GET — returned", users.length, "of", total);
    return ok({ users, total });
  } catch (e) {
    console.error("[admin/users] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/users
// Creates a new admin or client user via Better Auth admin plugin.
// On success: the databaseHooks in lib/auth.ts auto-create the matching profile.
// ---------------------------------------------------------------------------
const CreateUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "client"]),
  phone: z.string().optional(),
  department: z.string().optional(),
  permissions: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin(req);
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const { firstName, lastName, email, password, role, phone, department, permissions } =
      parsed.data;

    const name = `${firstName} ${lastName}`.trim();

    // Use Better Auth admin plugin to create the user so hashing and
    // account row creation are handled consistently.
    const result = await auth.api.createUser({
      body: {
        name,
        email,
        password,
        role: role as "user" | "admin",
        data: { firstName, lastName, ...(phone ? { phone } : {}) },
      },
    });

    if (!result?.user) {
      return Err.internal("User creation failed");
    }

    const userId = result.user.id;

    // Update the auto-created profile with any extra fields passed in the
    // request. The databaseHooks already created the base profile row.
    if (role === "admin" && (department || permissions)) {
      await db.adminProfile.update({
        where: { userId },
        data: {
          ...(department ? { department } : {}),
          ...(permissions ? { permissions: JSON.parse(JSON.stringify(permissions)) } : {}),
        },
      });
    }

    // Re-fetch the user with profile so the response shape matches GET
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        banned: true,
        createdAt: true,
        adminProfile: {
          select: { id: true, fullName: true, department: true, permissions: true, isActive: true },
        },
        clientProfile: {
          select: { id: true, phone: true, country: true, city: true, loginCount: true },
        },
      },
    });

    console.info("[admin/users] POST — created user", userId, role);
    return created({ user });
  } catch (e: unknown) {
    console.error("[admin/users] POST error", e);
    // P2002 = unique constraint (email already exists)
    if ((e as { code?: string }).code === "P2002") {
      return Err.validation("A user with this email already exists");
    }
    return Err.internal();
  }
}
