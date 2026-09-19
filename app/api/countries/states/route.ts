import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest, NextResponse } from "next/server"
import { reportError } from "@/lib/observability"

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const { country } = await req.json().catch(() => ({}))
  if (!country) return NextResponse.json([], { status: 400 })

  try {
    const res = await fetch(
      "https://countriesnow.space/api/v0.1/countries/states",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
        next: { revalidate: 3600 }, // 1h cache
      }
    )

    if (!res.ok) return NextResponse.json([], { status: 502 })

    const data = await res.json()
    const states: string[] = (data?.data?.states ?? []).map((s: any) => s.name).sort()

    return NextResponse.json(states)
  } catch (e) {
    reportError(e, { route: "POST /api/countries/states" });
    console.error("[countries/states] POST error", e);
    return NextResponse.json([], { status: 500 })
  }
}
