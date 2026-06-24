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

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      permissions:     true,
      isSuperAdmin:    true,
      role:            true,
      fullName:        true,
      accessExpiresAt: true,
      twoFaMethod:     true,
    },
  })

  // Fetch user-level fields needed by the login 2FA flow
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, phone: true, twoFactorEnabled: true },
  })

  return NextResponse.json({
    ...profile,
    userId: session.user.id,
    email: user?.email,
    phone: user?.phone,
    twoFactorEnabled: user?.twoFactorEnabled ?? false,
    twoFaMethod: profile?.twoFaMethod ?? 'totp',
  })
}
