export const ALL_PAGES = [
  'dashboard','products','inventory','orders','customers',
  'analytics','finance','marketing','campaigns','promotions',
  'content','suppliers','delivery','staff','settings','profile',
] as const

export type AdminPage = typeof ALL_PAGES[number]

export const ROLE_TEMPLATES: Record<string, AdminPage[]> = {
  super_admin:   [...ALL_PAGES],
  admin:         [...ALL_PAGES],
  manager:       ['dashboard','products','inventory','orders','customers','analytics','finance','marketing','campaigns','promotions','content','suppliers','delivery'],
  finance:       ['dashboard','finance','analytics'],
  marketing:     ['dashboard','marketing','campaigns','promotions','content'],
  inventory:     ['dashboard','products','inventory','orders','suppliers','delivery'],
  customer_care: ['dashboard','customers','orders','content'],
  viewer:        ['dashboard'],
}

/** Returns true if the given permissions object grants access to the requested page. */
export function canAccess(permissions: Record<string, unknown>, page: AdminPage): boolean {
  const pages = permissions?.pages as string[] | undefined
  if (!pages) return false
  return pages.includes(page)
}

/** Builds a permissions object for a given role using the role template. */
export function permissionsFromRole(role: string): { pages: AdminPage[] } {
  return { pages: ROLE_TEMPLATES[role] ?? ROLE_TEMPLATES.viewer }
}
