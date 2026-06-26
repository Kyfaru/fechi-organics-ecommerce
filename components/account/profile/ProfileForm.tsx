"use client"

import { useEffect, useState, useTransition } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import type { AccountUser } from "@/types/account"
import { updateProfile } from "@/lib/account/actions"
import AvatarUpload from "./AvatarUpload"
import CountrySelect, { type CountryItem } from "./CountrySelect"
import CitySelect from "./CitySelect"
import PhoneInput from "./PhoneInput"
import UsernameField from "./UsernameField"
import DangerZone from "./DangerZone"

function inputClass(extra = "") {
  return `w-full px-4 py-3 border border-neutral-300 rounded-lg text-[15px] bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#15803D] focus:ring-1 focus:ring-[#15803D] ${extra}`
}

export default function ProfileForm({ user }: { user: AccountUser }) {
  const [countries, setCountries] = useState<CountryItem[]>([])
  const [pending, startTransition] = useTransition()

  // Form state
  const [firstName, setFirstName] = useState(user.firstName ?? "")
  const [lastName, setLastName] = useState(user.lastName ?? "")
  const [phone, setPhone] = useState(user.phone ?? "")
  const [phoneCode, setPhoneCode] = useState(user.phoneCode ?? "+254")
  const [country, setCountry] = useState(user.country ?? "")
  const [city, setCity] = useState(user.city ?? "")
  const [username, setUsername] = useState(user.username ?? "")
  const [avatarUrl, setAvatarUrl] = useState(user.image)

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

  function handleSave() {
    startTransition(async () => {
      try {
        await updateProfile({ firstName, lastName, phone, phoneCode, country, city, username })
        toast.success("Profile updated")
      } catch (e: any) {
        toast.error(e?.message ?? "Update failed")
      }
    })
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Icon icon="lucide:settings" width={15} className="text-[#15803D]" />
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Profile Settings
          </span>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900">Personal Details</h1>
        <p className="text-base text-neutral-500 mt-1.5">
          Update your name, email, phone, country, city and username.
        </p>
      </div>

      {/* Avatar */}
      <AvatarUpload
        currentUrl={avatarUrl}
        name={`${firstName} ${lastName}`.trim() || user.name}
        onUploaded={setAvatarUrl}
      />

      <div className="bg-white rounded-xl border border-neutral-200 p-7 space-y-6">
        {/* Name row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-2">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jefferson"
              className={inputClass()}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-2">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Kimotho"
              className={inputClass()}
            />
          </div>
        </div>

        {/* Email + Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-neutral-600 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className={inputClass("disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed")}
            />
            <p className="text-sm text-neutral-400 mt-1.5">Email cannot be changed here.</p>
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
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={pending}
            className="px-6 py-3 rounded-lg border border-neutral-300 text-neutral-700 text-[15px] font-medium hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#15803D] hover:bg-[#16A34A] text-white text-[15px] font-semibold transition-colors disabled:opacity-50"
          >
            {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
            Update Profile
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <DangerZone userName={`${firstName} ${lastName}`.trim() || user.name} />
    </div>
  )
}
