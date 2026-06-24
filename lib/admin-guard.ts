import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { canAccess, type AdminPage } from '@/lib/permissions'

/**
 * Guards an admin API route by page permission.
 *
 * Returns null when access is granted (caller should continue).
 * Returns a NextResponse with an appropriate error when access is denied.
 *
 * Super-admins bypass the page permission check but are still subject to
 * the active and expiry checks.
 */
export async function requireAdminPage(
  _req: NextRequest,
  page: AdminPage,
): Promise<NextResponse | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await db.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      permissions:     true,
      isSuperAdmin:    true,
      isActive:        true,
      accessExpiresAt: true,
    },
  })

  if (!profile?.isActive) {
    return NextResponse.json({ error: 'Account inactive' }, { status: 403 })
  }

  if (profile.accessExpiresAt && profile.accessExpiresAt < new Date()) {
    return NextResponse.json({ error: 'Staff access has expired' }, { status: 403 })
  }

  // Super-admins have unrestricted access to all pages
  if (profile.isSuperAdmin) return null

  const perms = (profile.permissions ?? {}) as Record<string, unknown>
  if (!canAccess(perms, page)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  return null
}
