"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  orderBasePoints,
  VALUE_TIERS,
  SIGNUP_BONUS_POINTS,
  REFERRED_BONUS_POINTS,
  REFERRAL_REWARD_POINTS,
  MAX_REWARDED_REFERRALS,
  STREAK_4W_POINTS,
  STREAK_4W_MAX_AWARDS,
  STREAK_6M_WEEKLY_POINTS,
  STREAK_6M_MONTHLY_POINTS,
  // Everything comes from rules.ts, which imports nothing. Importing any of
  // these from ledger.ts or referral-discount.ts pulls @/lib/db — and with it
  // the Postgres driver — into the browser bundle, which breaks the build.
  CENTS_PER_POINT,
  REFERRAL_DISCOUNT_PERCENT,
} from "@/lib/points/rules";

/**
 * The customer-facing explanation of Fechi Points.
 *
 * Every number on this page is imported from the code that awards the points,
 * not typed in — a page that drifts from the engine is worse than no page,
 * because it becomes a promise the checkout does not keep.
 */

const TOC_ITEMS = [
  { id: "what-are-points", label: "What Fechi Points Are" },
  { id: "what-worth", label: "What a Point Is Worth" },
  { id: "how-it-works", label: "How It Works" },
  { id: "joining", label: "Joining & Welcome Points" },
  { id: "every-order", label: "Points on Every Order" },
  { id: "big-orders", label: "Big-Order Bonuses & VIP" },
  { id: "streaks", label: "Shopping Streaks" },
  { id: "referrals", label: "Inviting Friends" },
  { id: "achievements", label: "Achievements & Levels" },
  { id: "leaderboard", label: "The Leaderboard" },
  { id: "spending", label: "Spending Your Points" },
  { id: "limits", label: "Limits & Fair Use" },
  { id: "refunds", label: "Refunds & Cancellations" },
  { id: "safety", label: "How We Keep Points Safe" },
  { id: "changes", label: "Changes & Contact" },
];

const POINT_VALUE_KES = CENTS_PER_POINT / 100;

function kes(n: number) {
  return `KSh ${n.toLocaleString("en-KE")}`;
}

// ─── Shared pieces (mirrors components/legal/TermsContent.tsx) ────────────────

function SectionHeading({ number, title, id }: { number: string; title: string; id: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <span
        className="flex-shrink-0 w-9 h-9 rounded-full bg-[#e8fce3] flex items-center justify-center text-[#27731e] text-[13px] font-semibold mt-0.5"
        style={{ fontFamily: "var(--font-stagnan)" }}
        aria-hidden
      >
        {number}
      </span>
      <h2
        id={id}
        className="text-[22px] md:text-[26px] font-semibold text-[#1a1c1c] leading-tight scroll-mt-[100px]"
        style={{ fontFamily: "var(--font-stagnan)" }}
      >
        {title}
      </h2>
    </div>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-0 md:pl-[52px] space-y-4 text-[16px] leading-[1.8] text-[#40493c] font-body">
      {children}
    </div>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="flex-shrink-0 w-[6px] h-[6px] rounded-full bg-[#27731e] mt-[10px]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function HighlightBox({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] bg-[#f4fff3] border border-[#c8e8c5] p-5 flex gap-3">
      <Icon icon={icon} width={20} className="text-[#27731e] flex-shrink-0 mt-0.5" />
      <div className="text-[15px] leading-[1.75] text-[#40493c] font-body">{children}</div>
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#d4ebd0]">
      <table className="w-full min-w-[420px] text-[14px] font-body border-collapse">
        <thead>
          <tr className="bg-[#f4fff3]">
            {head.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-3 text-[13px] font-semibold text-[#1a1c1c] border-b border-[#d4ebd0]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-[#fafffa]" : "bg-white"}>
              {r.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-[#40493c] border-b border-[#eef6ec] last:border-b-0">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── The journey diagram ──────────────────────────────────────────────────────

/**
 * Inline SVG rather than an uploaded image: it stays sharp at any size, the
 * text is real text (so it is searchable and screen-reader accessible), and
 * there is no asset to keep in sync with the copy.
 */
function JourneyDiagram() {
  const steps = [
    { icon: "mdi:account-plus-outline", title: "Join", detail: `${SIGNUP_BONUS_POINTS.toLocaleString()} welcome points, held` },
    { icon: "mdi:shopping-outline", title: "Shop", detail: "Order as normal" },
    { icon: "mdi:cash-check", title: "Pay", detail: "Points land, welcome points unlock" },
    { icon: "mdi:trophy-outline", title: "Unlock", detail: "Achievements and levels" },
    { icon: "mdi:tag-heart-outline", title: "Spend", detail: "Points off your next order" },
  ];

  return (
    <figure className="my-6">
      <div className="rounded-[16px] border border-[#d4ebd0] bg-[#fafffa] p-5 md:p-7">
        <ol className="flex flex-col md:flex-row md:items-start gap-4 md:gap-2 list-none">
          {steps.map((s, i) => (
            <li key={s.title} className="contents md:block md:flex-1">
              <div className="flex md:flex-col items-center gap-3 md:gap-0 md:text-center">
                {/* Connector sits above the icon on desktop, so it never needs
                    a negative margin to line up with anything. */}
                <div className="hidden md:flex items-center w-full mb-3" aria-hidden>
                  <span className={`h-px flex-1 ${i === 0 ? "bg-transparent" : "bg-[#c8e8c5]"}`} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c8e8c5] mx-1" />
                  <span
                    className={`h-px flex-1 ${i === steps.length - 1 ? "bg-transparent" : "bg-[#c8e8c5]"}`}
                  />
                </div>

                <span className="flex-shrink-0 w-12 h-12 rounded-full bg-[#27731e] flex items-center justify-center md:mx-auto">
                  <Icon icon={s.icon} width={22} className="text-white" />
                </span>

                <div className="md:mt-3">
                  <p
                    className="text-[15px] font-semibold text-[#1a1c1c]"
                    style={{ fontFamily: "var(--font-stagnan)" }}
                  >
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-[13px] text-[#40493c]/80 font-body leading-snug">{s.detail}</p>
                </div>
              </div>

              {i < steps.length - 1 && (
                <Icon
                  icon="mdi:arrow-down"
                  width={18}
                  className="text-[#27731e]/40 md:hidden mx-auto"
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-2 text-[13px] text-[#40493c]/70 font-body text-center">
        Your points journey, from joining to spending.
      </figcaption>
    </figure>
  );
}

// ─── Table of contents ────────────────────────────────────────────────────────

function MobileTOC({ activeId }: { activeId: string }) {
  const [open, setOpen] = useState(false);
  const activeItem = TOC_ITEMS.find((t) => t.id === activeId) ?? TOC_ITEMS[0];

  function handleClick(id: string) {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  return (
    <div className="md:hidden mb-8 rounded-[16px] border border-[#d4ebd0] bg-[#f4fff3] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon icon="mdi:format-list-bulleted" width={18} className="text-[#27731e]" />
          <span className="text-[14px] font-semibold text-[#1a1c1c]" style={{ fontFamily: "var(--font-stagnan)" }}>
            {open ? "Table of Contents" : `Contents: ${activeItem.label}`}
          </span>
        </div>
        <Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} width={20} className="text-[#27731e]" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="toc-mobile-loyalty"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#d4ebd0] px-5 py-3">
              {TOC_ITEMS.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => handleClick(item.id)}
                  className={[
                    "w-full flex items-center gap-3 py-2.5 text-left text-[14px] font-body transition-colors",
                    activeId === item.id ? "text-[#27731e] font-semibold" : "text-[#40493c] hover:text-[#27731e]",
                  ].join(" ")}
                >
                  <span className="w-5 text-center text-[12px] text-[#27731e]/60 flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DesktopTOC({ activeId }: { activeId: string }) {
  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  }

  return (
    <aside className="hidden md:block">
      <div className="sticky top-[100px] w-[220px]">
        <p
          className="text-[11px] uppercase tracking-[1.5px] text-[#27731e] font-semibold mb-4"
          style={{ fontFamily: "var(--font-stagnan)" }}
        >
          Contents
        </p>
        <nav className="flex flex-col">
          {TOC_ITEMS.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={[
                "group flex items-center gap-3 py-2 text-left text-[13px] font-body transition-all duration-200 border-l-2",
                activeId === item.id
                  ? "border-[#27731e] text-[#27731e] font-semibold pl-3"
                  : "border-transparent text-[#40493c]/70 hover:text-[#27731e] hover:border-[#a4f690] pl-3",
              ].join(" ")}
            >
              <span
                className={[
                  "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors",
                  activeId === item.id ? "bg-[#27731e] text-white" : "bg-[#e8fce3] text-[#27731e]/70",
                ].join(" ")}
              >
                {i + 1}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-[12px] bg-[#f4fff3] border border-[#d4ebd0] p-4">
          <p className="text-[12px] text-[#40493c] font-body leading-relaxed">
            See your own points and achievements.
          </p>
          <Link
            href="/account/achievements"
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#27731e] hover:text-[#045a03] font-body transition-colors"
          >
            My rewards
            <Icon icon="mdi:arrow-right" width={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoyaltyPointsContent() {
  const [activeId, setActiveId] = useState(TOC_ITEMS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headings = TOC_ITEMS.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActiveId(entry.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    headings.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const maxFreePoints =
    SIGNUP_BONUS_POINTS + REFERRED_BONUS_POINTS + REFERRAL_REWARD_POINTS * MAX_REWARDED_REFERRALS;

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1a1c1c 0%, #2d3028 50%, #27731e 100%)" }}
      >
        <div className="absolute -right-16 -top-16 w-[380px] h-[380px] rounded-full bg-[#27731e]/10 pointer-events-none" />
        <div className="absolute -left-8 bottom-0 w-[220px] h-[220px] rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 max-w-[1100px] mx-auto px-6 py-16 md:py-20">
          <nav className="flex items-center gap-2 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="text-white/60 text-[13px] font-body hover:text-white transition-colors">
              Home
            </Link>
            <Icon icon="mdi:chevron-right" width={14} className="text-white/40" />
            <span className="text-white/80 text-[13px] font-body">Fechi Points</span>
          </nav>

          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 mb-5">
                <Icon icon="mdi:trophy-outline" width={15} className="text-[#a4f690]" />
                <span className="text-white/90 text-[12px] font-body tracking-wide">
                  Free to join · Points never expire
                </span>
              </div>
              <h1
                className="text-[40px] md:text-[54px] font-bold text-white leading-[1.1] mb-3"
                style={{ fontFamily: "var(--font-stagnan)" }}
              >
                Fechi Points
              </h1>
              <p className="text-white/70 text-[16px] font-body max-w-[520px] leading-relaxed">
                Earn points every time you shop with us, unlock achievements as you go, and spend
                those points straight off the price of a future order.
              </p>
            </div>

            <div className="flex flex-col gap-2 self-end pb-1">
              <div className="bg-white/15 border border-white/25 rounded-[12px] px-5 py-3 text-right">
                <p className="text-white/50 text-[11px] font-body uppercase tracking-wider mb-0.5">
                  1 point is worth
                </p>
                <p className="text-white text-[15px] font-semibold" style={{ fontFamily: "var(--font-stagnan)" }}>
                  KSh {POINT_VALUE_KES.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-[#f4fff3] border-b border-[#d4ebd0]">
        <div className="max-w-[1100px] mx-auto px-6 py-3.5 flex items-center gap-3">
          <Icon icon="mdi:information-outline" width={18} className="text-[#27731e] flex-shrink-0" />
          <p className="text-[14px] text-[#40493c] font-body">
            <strong className="text-[#1a1c1c]">In short:</strong> shop, earn points automatically,
            then use them to knock money off a later order. Nothing to sign up for beyond having an
            account.
          </p>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6 py-14">
        <MobileTOC activeId={activeId} />

        <div className="flex gap-16 items-start">
          <DesktopTOC activeId={activeId} />

          <article className="flex-1 min-w-0 space-y-14">
            {/* 01 */}
            <section>
              <SectionHeading number="01" title="What Fechi Points Are" id="what-are-points" />
              <SectionBody>
                <p>
                  Fechi Points are our way of thanking you for shopping with us. Every order you pay
                  for earns points automatically — there is no card to carry, no form to fill in and
                  nothing to activate. If you have a Fechi Organics account, you are already earning.
                </p>
                <p>
                  Points sit in your account until you choose to use them. They do not expire, and
                  they are not affected by how long you go between orders.
                </p>
                <HighlightBox icon="mdi:eye-outline">
                  You can see your balance any time on your{" "}
                  <Link href="/account/achievements" className="text-[#27731e] font-semibold hover:underline">
                    rewards page
                  </Link>
                  , along with every achievement you have unlocked and every point you have ever
                  earned or spent.
                </HighlightBox>
              </SectionBody>
            </section>

            {/* 02 */}
            <section>
              <SectionHeading number="02" title="What a Point Is Worth" id="what-worth" />
              <SectionBody>
                <p>
                  <strong className="text-[#1a1c1c]">1 point = KSh {POINT_VALUE_KES.toFixed(2)}</strong>{" "}
                  when you spend it at checkout. That rate is fixed and applies to every order.
                </p>
                <DataTable
                  head={["Points", "Money off your order"]}
                  rows={[100, 500, 1_000, 2_500, 5_000, 10_000].map((p) => [
                    p.toLocaleString(),
                    kes(p * POINT_VALUE_KES),
                  ])}
                />
                <p className="text-[14px] text-[#40493c]/80">
                  Points have no cash value on their own — they can only be used against an order on
                  this website. They cannot be withdrawn, sold or exchanged for money.
                </p>
              </SectionBody>
            </section>

            {/* 03 */}
            <section>
              <SectionHeading number="03" title="How It Works" id="how-it-works" />
              <SectionBody>
                <p>The whole programme in five steps:</p>
                <JourneyDiagram />
                <p>
                  The only step that needs anything from you is the last one — deciding when to spend
                  what you have built up. Everything before it happens on its own.
                </p>
              </SectionBody>
            </section>

            {/* 04 */}
            <section>
              <SectionHeading number="04" title="Joining & Welcome Points" id="joining" />
              <SectionBody>
                <p>
                  Creating an account earns you{" "}
                  <strong className="text-[#1a1c1c]">
                    {SIGNUP_BONUS_POINTS.toLocaleString()} welcome points
                  </strong>{" "}
                  straight away. You will see them on your rewards page immediately, marked as{" "}
                  <em>held</em>.
                </p>
                <p>
                  Held points become spendable the moment your first order is paid for. This is the
                  one condition attached to them, and it exists so that the welcome bonus rewards
                  real customers rather than people opening accounts in bulk.
                </p>
                <HighlightBox icon="mdi:lock-open-outline">
                  Your welcome points unlock automatically. There is nothing to claim — pay for your
                  first order and they are yours to spend on the next one.
                </HighlightBox>
              </SectionBody>
            </section>

            {/* 05 */}
            <section>
              <SectionHeading number="05" title="Points on Every Order" id="every-order" />
              <SectionBody>
                <p>
                  Every paid order earns points. Your earliest orders earn the most, because that is
                  when we most want to say thank you for giving us a try.
                </p>
                <DataTable
                  head={["Your order number", "Points earned"]}
                  rows={[
                    ...[1, 2, 3, 4, 5].map((n) => [
                      `Order ${n}`,
                      orderBasePoints(n).toLocaleString(),
                    ]),
                    ["Orders 6 – 10", `${orderBasePoints(10).toLocaleString()} – ${orderBasePoints(6).toLocaleString()}, falling by 50 each time`],
                    ["Orders 11 – 49", orderBasePoints(11).toLocaleString()],
                    ["Order 50 onwards", `${orderBasePoints(50).toLocaleString()} — it goes back up for our longest-standing customers`],
                  ]}
                />
                <p>
                  These points are worked out on what you actually pay in money. If you pay for part
                  of an order using points, that part does not earn points again — otherwise points
                  would quietly reproduce themselves.
                </p>
              </SectionBody>
            </section>

            {/* 06 */}
            <section>
              <SectionHeading number="06" title="Big-Order Bonuses & VIP" id="big-orders" />
              <SectionBody>
                <p>
                  Larger orders earn a bonus on top of the points above. Only the highest band you
                  reach applies — the bands are not added together.
                </p>
                <DataTable
                  head={["Order value", "Bonus points", "Also unlocks"]}
                  rows={[...VALUE_TIERS]
                    .reverse()
                    .map((t) => [
                      `${kes(t.minCents / 100)} and over`,
                      t.points.toLocaleString(),
                      t.perk === "VIP_1"
                        ? "VIP status and a discount code for your next orders"
                        : t.perk === "VIP_2"
                          ? "Everything above, plus invitations, a masterclass and a personal thank-you from Wangeci"
                          : "—",
                    ])}
                />
                <p className="text-[14px] text-[#40493c]/80">
                  Order value here means the value of the products themselves, after any discount and
                  before delivery. VIP benefits beyond the points and discount code are arranged by
                  our team, who will contact you directly.
                </p>
              </SectionBody>
            </section>

            {/* 07 */}
            <section>
              <SectionHeading number="07" title="Shopping Streaks" id="streaks" />
              <SectionBody>
                <p>Shopping with us regularly earns extra points on top of everything else.</p>
                <DataTable
                  head={["Streak", "Bonus", "How often"]}
                  rows={[
                    [
                      "An order in four weeks running",
                      `${STREAK_4W_POINTS.toLocaleString()} points`,
                      `Up to ${STREAK_4W_MAX_AWARDS} times (${(STREAK_4W_POINTS * STREAK_4W_MAX_AWARDS).toLocaleString()} points in total)`,
                    ],
                    [
                      "An order every week for six months",
                      `${STREAK_6M_WEEKLY_POINTS.toLocaleString()} points`,
                      "Once",
                    ],
                    [
                      "An order in each of six months running",
                      `${STREAK_6M_MONTHLY_POINTS.toLocaleString()} points`,
                      "Once",
                    ],
                  ]}
                />
                <p className="text-[14px] text-[#40493c]/80">
                  Weeks run Monday to Sunday, Kenyan time. The six-month rewards are alternatives to
                  one another — if you shop every week for six months you receive the larger of the
                  two, not both. The bonus lands on the order that completes the streak.
                </p>
              </SectionBody>
            </section>

            {/* 08 */}
            <section>
              <SectionHeading number="08" title="Inviting Friends" id="referrals" />
              <SectionBody>
                <p>
                  Your rewards page has a personal invite code. Share it and both of you benefit:
                </p>
                <BulletList
                  items={[
                    <>
                      They get{" "}
                      <strong className="text-[#1a1c1c]">{REFERRAL_DISCOUNT_PERCENT}% off</strong>{" "}
                      their first order when they enter your code at checkout, plus{" "}
                      {REFERRED_BONUS_POINTS.toLocaleString()} points of their own.
                    </>,
                    <>
                      You earn{" "}
                      <strong className="text-[#1a1c1c]">
                        {REFERRAL_REWARD_POINTS.toLocaleString()} points
                      </strong>{" "}
                      once they have paid for that order.
                    </>,
                    <>
                      You can be rewarded for up to {MAX_REWARDED_REFERRALS} friends. We will let you
                      know by message and email each time one of them orders.
                    </>,
                  ]}
                />
                <p>
                  Invite codes are for people new to Fechi Organics — they cannot be used on an
                  account that has already ordered, and you cannot use your own.
                </p>
                <HighlightBox icon="mdi:calculator-variant-outline">
                  Adding it up, the most anyone can receive without ever spending money is{" "}
                  <strong className="text-[#1a1c1c]">{maxFreePoints.toLocaleString()} points</strong>{" "}
                  ({kes(maxFreePoints * POINT_VALUE_KES)}): the welcome bonus, the invited-friend
                  bonus, and {MAX_REWARDED_REFERRALS} successful invitations. Beyond that, points come
                  from shopping.
                </HighlightBox>
              </SectionBody>
            </section>

            {/* 09 */}
            <section>
              <SectionHeading number="09" title="Achievements & Levels" id="achievements" />
              <SectionBody>
                <p>
                  Alongside points, you collect achievements — over a thousand of them, covering
                  everything from how many orders you have placed to how many different products you
                  have tried, how long you have been with us, and quieter things you may stumble
                  across on your own.
                </p>
                <BulletList
                  items={[
                    "Most achievements award points when you unlock them.",
                    "Your level is set by how many you have unlocked, not by your balance — so spending your points never costs you your level.",
                    "Each one shows how close you are, so you always know what is within reach.",
                    "A few are given by hand for things like attending an event. Those are recognition rather than points.",
                  ]}
                />
                <p className="text-[14px] text-[#40493c]/80">
                  The full set is deliberately far more than any one person could finish. It is meant
                  to be something to keep discovering, not a checklist to complete.
                </p>
              </SectionBody>
            </section>

            {/* 10 */}
            <section>
              <SectionHeading number="10" title="The Leaderboard" id="leaderboard" />
              <SectionBody>
                <p>
                  The leaderboard ranks customers by the points they have earned over time. Because
                  it counts points <em>earned</em> rather than points held, spending your points never
                  moves you down it.
                </p>
                <HighlightBox icon="mdi:shield-account-outline">
                  <strong className="text-[#1a1c1c]">Your name is private by default.</strong> Unless
                  you choose otherwise, other customers see only an anonymous code — never your name
                  or photo. You can reveal or re-hide yourself at any time from the leaderboard page,
                  and you always see your own true position either way.
                </HighlightBox>
              </SectionBody>
            </section>

            {/* 11 */}
            <section>
              <SectionHeading number="11" title="Spending Your Points" id="spending" />
              <SectionBody>
                <p>Points are spent at the payment step, in the order summary:</p>
                <BulletList
                  items={[
                    "Add what you want to your basket and go through to payment as usual.",
                    "In the order summary you will see your available balance and a box to enter points.",
                    'Type in how many you want to use, or tap "Use max", and apply them.',
                    "The total drops immediately. Pay the remainder however you normally would.",
                  ]}
                />
                <p>
                  Points come off <strong className="text-[#1a1c1c]">after</strong> any discount code,
                  so you can use both on the same order. If you have enough points to cover the whole
                  amount, there is nothing left to pay.
                </p>
                <HighlightBox icon="mdi:cart-check">
                  Example: a {kes(10_000)} order with a 10% discount code comes to {kes(9_000)}.
                  Spending 1,000 points takes another {kes(1_000 * POINT_VALUE_KES)} off, leaving{" "}
                  {kes(9_000 - 1_000 * POINT_VALUE_KES)} to pay.
                </HighlightBox>
                <p className="text-[14px] text-[#40493c]/80">
                  You can spend any number of points up to your balance — there is no minimum, and no
                  cap on how much of an order they may cover.
                </p>
              </SectionBody>
            </section>

            {/* 12 */}
            <section>
              <SectionHeading number="12" title="Limits & Fair Use" id="limits" />
              <SectionBody>
                <p>A short list of things points cannot do, so there are no surprises:</p>
                <BulletList
                  items={[
                    "Points belong to one account and cannot be transferred, shared, gifted or combined with someone else's.",
                    "Points cannot be exchanged for cash, and have no value away from this website.",
                    "The welcome bonus is once per person, not once per email address. Opening additional accounts to claim it again will void the bonus on those accounts.",
                    "Households often share a device or an internet connection, and that alone is never treated as a problem.",
                    "Invite codes only work for genuinely new customers.",
                    "We may withhold points where an order is fraudulent or a payment is reversed.",
                  ]}
                />
                <p className="text-[14px] text-[#40493c]/80">
                  If you think something has been applied to your account in error, please get in
                  touch — a person will look at it.
                </p>
              </SectionBody>
            </section>

            {/* 13 */}
            <section>
              <SectionHeading number="13" title="Refunds & Cancellations" id="refunds" />
              <SectionBody>
                <BulletList
                  items={[
                    "If an order is not paid for, cancelled or times out, any points you applied to it are returned to your balance automatically.",
                    "If a paid order is refunded, points you spent on it come back, and points it earned are removed.",
                    "Every one of these movements is recorded on your history, so you can always see what happened and why.",
                  ]}
                />
              </SectionBody>
            </section>

            {/* 14 */}
            <section>
              <SectionHeading number="14" title="How We Keep Points Safe" id="safety" />
              <SectionBody>
                <p>
                  Your balance is not a number we can quietly edit. Every movement — earned, spent,
                  returned — is written to a permanent, tamper-evident record that can only be added
                  to, never rewritten. Corrections are made by adding a new entry that explains
                  itself, so the history always tells the truth.
                </p>
                <BulletList
                  items={[
                    "Our staff can see your balance and history, but cannot change either.",
                    "Points can only be added by hand in exceptional cases, and only when every one of our most senior administrators agrees to it. Each such addition is recorded permanently.",
                    "The record is checked automatically every night, and any inconsistency is flagged immediately.",
                  ]}
                />
              </SectionBody>
            </section>

            {/* 15 */}
            <section>
              <SectionHeading number="15" title="Changes & Contact" id="changes" />
              <SectionBody>
                <p>
                  We may change how points are earned in future — for example by adjusting a bonus or
                  adding new achievements. Points you have already earned stay yours at the rate
                  described here.
                </p>
                <p>
                  This page sits alongside our{" "}
                  <Link href="/terms" className="text-[#27731e] font-semibold hover:underline">
                    Terms &amp; Conditions
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy-policy" className="text-[#27731e] font-semibold hover:underline">
                    Privacy Policy
                  </Link>
                  , which also apply.
                </p>
              </SectionBody>
            </section>

            {/* CTA */}
            <div className="mt-10 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#1a1c1c] to-[#2d3028] p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-white text-[20px] font-semibold mb-1" style={{ fontFamily: "var(--font-stagnan)" }}>
                  See what you have earned
                </p>
                <p className="text-white/60 text-[14px] font-body">
                  Your balance, your achievements and your invite code, all in one place.
                </p>
              </div>
              <Link
                href="/account/achievements"
                className="flex-shrink-0 inline-flex items-center gap-2 bg-[#27731e] text-white rounded-full px-7 py-3 text-[15px] font-semibold hover:bg-[#045a03] transition-colors font-body"
              >
                My Rewards
                <Icon icon="mdi:arrow-right" width={16} />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
