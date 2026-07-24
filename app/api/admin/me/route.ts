import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/** GET /api/admin/me — returns the current admin's profile and permissions. */
export async function GET(req: NextRequest) {
  await connection()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch user-level fields needed by the login 2FA flow
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, phone: true, twoFactorEnabled: true, mustChangePassword: true, role: true },
  })

  // A client session must never read admin data from this route — matches
  // AdminGuard's own role check (app/admin/(protected)/layout.tsx).
  if (user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      permissions:     true,
      isSuperAdmin:    true,
      role:            true,
      fullName:        true,
      accessExpiresAt: true,
      twoFaMethod:     true,
      branchId:        true,
      branch:          { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    ...profile,
    userId: session.user.id,
    email: user?.email,
    phone: user?.phone,
    twoFactorEnabled: user?.twoFactorEnabled ?? false,
    twoFaMethod: profile?.twoFaMethod ?? 'totp',
    branchId: profile?.branchId ?? null,
    branchName: profile?.branch?.name ?? null,
    mustChangePassword: user?.mustChangePassword ?? false,
  })
}
