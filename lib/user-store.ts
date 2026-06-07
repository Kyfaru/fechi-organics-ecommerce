"use client";

const USER_KEY = "fechi_user";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | null;
  image?: string | null;
}

export function storeUser(user: StoredUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // localStorage may be unavailable (SSR, private browsing with storage blocked)
  }
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}
