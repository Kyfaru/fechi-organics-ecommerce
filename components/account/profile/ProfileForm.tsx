"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import type { AccountUser } from "@/types/account"
import { updateProfile } from "@/lib/account/actions"
import { authClient } from "@/lib/auth-client"
import { PROFILE_QUERY_KEY, fetchProfile } from "@/lib/account/profile-query"
import { BotanicalDashboardCard } from "@/components/account/AccountRightPanel"
import AvatarUpload from "./AvatarUpload"
import CountrySelect, { type CountryItem } from "./CountrySelect"
import CitySelect from "./CitySelect"
import PhoneInput from "./PhoneInput"
import UsernameField from "./UsernameField"
import DangerZone from "./DangerZone"

function inputClass(extra = "") {
  return `w-full px-4 py-3 border border-neutral-300 dark:border-neutral-700 rounded-lg text-[15px] bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D] ${extra}`
}

const SOCIAL_LABEL: Record<string, string> = { google: "Google", facebook: "Facebook" }

export default function ProfileForm({
  user: initialUser,
  socialProvider,
}: {
  user: AccountUser
  /** "google" | "facebook" | null — which social account (if any) is linked,
   *  so the email-change note only shows when it's actually relevant. */
  socialProvider: string | null
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const [countries, setCountries] = useState<CountryItem[]>([])

  // Kept in sync with AccountSidebar/BotanicalDashboardCard via the same
  // query key — initialData is the server-rendered prop for first paint.
  const { data: user } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    initialData: initialUser,
  })

  // Form state
  const [firstName, setFirstName] = useState(user.firstName ?? "")
  const [lastName, setLastName] = useState(user.lastName ?? "")
  const [phone, setPhone] = useState(user.phone ?? "")
  const [phoneCode, setPhoneCode] = useState(user.phoneCode ?? "+254")
  const [country, setCountry] = useState(user.country ?? "")
  const [city, setCity] = useState(user.city ?? "")
  const [username, setUsername] = useState(user.username ?? "")
  const [avatarUrl, setAvatarUrl] = useState(user.image)
  const [email, setEmail] = useState(user.email)

  // Snapshot for discard
  const original = {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
    phoneCode: user.phoneCode ?? "+254",
    country: user.country ?? "",
    city: user.city ?? "",
    username: user.username ?? "",
  }

  useEffect(() => {
    fetch("/api/countries")
      .then((r) => r.json())
      .then((data) => {
        // Existing route wraps in { ok, data: { countries } }
        const list: CountryItem[] = data?.data?.countries ?? data ?? []
        setCountries(list)
      })
      .catch(() => {})
  }, [])

  function handleDiscard() {
    setFirstName(original.firstName)
    setLastName(original.lastName)
    setPhone(original.phone)
    setPhoneCode(original.phoneCode)
    setCountry(original.country)
    setCity(original.city)
    setUsername(original.username)
  }

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      updateProfile({ firstName, lastName, phone, phoneCode, country, city, username }),
    onSuccess: (result) => {
      toast.success("Profile updated")
      // Instant update everywhere the ["profile"] query is read (sidebar,
      // dashboard card) — no need to wait on a route refresh for this.
      qc.setQueryData(PROFILE_QUERY_KEY, (old: AccountUser | undefined) => ({
        ...(old ?? user),
        ...result.user,
      }))
      qc.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
      router.refresh()
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Update failed")
    },
  })

  const changeEmailMutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await authClient.changeEmail({
        newEmail,
        callbackURL: "/account/profile",
      })
      if (error) throw new Error(error.message ?? "Could not change email")
    },
    onSuccess: () => {
      toast.success("Check your inbox to confirm the new email address")
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Could not change email")
      setEmail(user.email)
    },
  })

  function handleSave() {
    updateProfileMutation.mutate()
  }

  function handleEmailBlur() {
    const trimmed = email.trim()
    if (trimmed && trimmed !== user.email) changeEmailMutation.mutate(trimmed)
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Icon icon="lucide:settings" width={15} className="text-[#15803D]" />
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            Profile Settings
          </span>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Personal Details</h1>
        <p className="text-base text-neutral-500 dark:text-neutral-400 mt-1.5">
          Update your name, email, phone, country, city and username.
        </p>
      </div>

      <div className="tablet:hidden">
        <BotanicalDashboardCard user={user} />
      </div>

      {/* Avatar */}
      <AvatarUpload
        currentUrl={avatarUrl}
        name={`${firstName} ${lastName}`.trim() || user.name}
        onUploaded={setAvatarUrl}
      />

      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-7 space-y-6">
        {/* Name row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-neutral-600 dark:text-neutral-300 mb-2">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Joe"
              className={inputClass()}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-neutral-600 dark:text-neutral-300 mb-2">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Mwangi"
              className={inputClass()}
            />
          </div>
        </div>

        {/* Email + Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-neutral-600 dark:text-neutral-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={handleEmailBlur}
              disabled={changeEmailMutation.isPending}
              className={inputClass("disabled:opacity-60")}
            />
            {socialProvider ? (
              <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1.5">
                Changing your email won't affect signing in with {SOCIAL_LABEL[socialProvider] ?? socialProvider} —
                that's linked to your account directly, not your email address.
              </p>
            ) : (
              <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1.5">
                You'll get a confirmation link at your new address before this takes effect.
              </p>
            )}
          </div>
          <PhoneInput
            phone={phone}
            phoneCode={phoneCode}
            onPhoneChange={setPhone}
            onPhoneCodeChange={setPhoneCode}
            countries={countries}
          />
        </div>

        {/* Country + City */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <CountrySelect
            value={country}
            onChange={(name) => { setCountry(name); setCity("") }}
            countries={countries}
          />
          <CitySelect value={city} onChange={setCity} country={country} />
        </div>

        {/* Username */}
        <UsernameField
          value={username}
          onChange={setUsername}
          usernameChanges={user.usernameChanges}
          lastUsernameChange={user.lastUsernameChange}
        />

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={updateProfileMutation.isPending}
            className="px-6 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-[15px] font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateProfileMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-[15px] font-semibold transition-colors disabled:opacity-50"
          >
            {updateProfileMutation.isPending && (
              <Icon icon="lucide:loader-2" width={14} className="animate-spin" />
            )}
            Update Profile
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <DangerZone userName={`${firstName} ${lastName}`.trim() || user.name} />
    </div>
  )
}
