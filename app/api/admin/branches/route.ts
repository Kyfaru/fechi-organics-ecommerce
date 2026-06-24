import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/** GET /api/admin/branches — returns all active branches for staff assignment. */
export async function GET(_req: NextRequest) {
  await connection()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const branches = await db.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ branches })
}
