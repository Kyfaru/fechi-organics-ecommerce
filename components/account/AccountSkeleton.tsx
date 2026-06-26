function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-200 rounded-lg ${className}`} />
}

export function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <Sk className="h-3 w-24" />
          <Sk className="h-8 w-48" />
          <Sk className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-4">
          <Sk className="w-20 h-20 rounded-full" />
          <Sk className="h-8 w-32" />
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Sk className="h-3 w-20" /><Sk className="h-10" /></div>
            <div className="space-y-2"><Sk className="h-3 w-20" /><Sk className="h-10" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Sk className="h-3 w-20" /><Sk className="h-10" /></div>
            <div className="space-y-2"><Sk className="h-3 w-20" /><Sk className="h-10" /></div>
          </div>
          <div className="space-y-2"><Sk className="h-3 w-20" /><Sk className="h-10" /></div>
          <div className="flex justify-end gap-3 pt-2"><Sk className="h-10 w-36" /><Sk className="h-10 w-36" /></div>
        </div>
      </div>
      <div className="space-y-4">
        <Sk className="h-48 rounded-xl" />
        <Sk className="h-24 rounded-xl" />
        <Sk className="h-32 rounded-xl" />
      </div>
    </div>
  )
}

export function OrdersSkeleton() {
  return (
    <div className="space-y-4 max-w-3xl">
      <Sk className="h-8 w-48" />
      <Sk className="h-10 w-64 rounded-xl" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 bg-white border border-neutral-200 rounded-xl p-4">
          <Sk className="w-14 h-14 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Sk className="h-4 w-32" />
            <Sk className="h-3 w-48" />
          </div>
          <Sk className="h-6 w-24 rounded-full" />
          <Sk className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <div className="space-y-6">
        <div className="space-y-2"><Sk className="h-3 w-24" /><Sk className="h-8 w-32" /></div>
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <Sk className="h-12 rounded-none" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between p-4 border-t border-neutral-100">
              <div className="space-y-1.5"><Sk className="h-4 w-36" /><Sk className="h-3 w-56" /></div>
              <Sk className="h-6 w-11 rounded-full shrink-0" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
          <Sk className="h-4 w-32" />
          <div className="grid grid-cols-2 gap-4">
            <Sk className="h-10" /><Sk className="h-10" />
          </div>
          <div className="flex justify-end"><Sk className="h-10 w-40" /></div>
        </div>
      </div>
      <div className="space-y-4">
        <Sk className="h-48 rounded-xl" /><Sk className="h-24 rounded-xl" /><Sk className="h-32 rounded-xl" />
      </div>
    </div>
  )
}

export function GenericSkeleton() {
  return (
    <div className="space-y-4">
      <Sk className="h-8 w-48" />
      <Sk className="h-4 w-64" />
      {[1, 2, 3].map((i) => <Sk key={i} className="h-24 rounded-xl" />)}
    </div>
  )
}
