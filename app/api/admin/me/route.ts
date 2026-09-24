import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { reportError } from '@/lib/observability'
import { computeBackSoon } from '@/lib/admin-welcome'

/** GET /api/admin/me — returns the current admin's profile and permissions. */
export async function GET(req: NextRequest) {
  await connection()

  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user-level fields needed by the login 2FA flow
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        phone: true,
        phoneCode: true,
        twoFactorEnabled: true,
        twoFaEmail: true,
        twoFaPhone: true,
        mustChangePassword: true,
        role: true,
      },
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
        lastLogoutAt:    true,
        branchId:        true,
        branch:          { select: { id: true, name: true } },
      },
    })

    // "Back so soon" — logged out within the last 3h. Computed server-side
    // (lib/admin-welcome.ts, shared with /api/admin/welcome/start) so the
    // login page doesn't need its own clock/timezone math.
    const backSoon = computeBackSoon(profile?.lastLogoutAt ?? null)

    return NextResponse.json({
      ...profile,
      userId: session.user.id,
      email: user?.email,
      phone: user?.phone,
      phoneCode: user?.phoneCode,
      twoFactorEnabled: user?.twoFactorEnabled ?? false,
      twoFaEmail: user?.twoFaEmail ?? false,
      twoFaPhone: user?.twoFaPhone ?? false,
      twoFaMethod: profile?.twoFaMethod ?? 'totp',
      backSoon,
      branchId: profile?.branchId ?? null,
      branchName: profile?.branch?.name ?? null,
      mustChangePassword: user?.mustChangePassword ?? false,
    })
  } catch (err) {
    reportError(err, { route: 'GET /api/admin/me', tags: { domain: 'me' } })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
