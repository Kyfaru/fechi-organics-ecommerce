'use client'

import { create } from 'zustand'

export type SessionUser = {
  id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
}

type SessionStore = {
  user: SessionUser | null
  isLoaded: boolean
  setSession: (user: SessionUser) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  user: null,
  isLoaded: false,
  setSession: (user) => set({ user, isLoaded: true }),
  clearSession: () => set({ user: null, isLoaded: true }),
}))
