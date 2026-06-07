"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Section data ────────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: "introduction",        label: "Introduction" },
  { id: "information-collect", label: "Information We Collect" },
  { id: "how-we-use",          label: "How We Use Your Information" },
  { id: "legal-basis",         label: "Legal Basis" },
  { id: "data-sharing",        label: "Data Sharing" },
  { id: "cookies",             label: "Cookies" },
  { id: "data-retention",      label: "Data Retention" },
  { id: "your-rights",         label: "Your Rights" },
  { id: "childrens-privacy",   label: "Children's Privacy" },
  { id: "policy-changes",      label: "Changes to This Policy" },
  { id: "contact",             label: "Contact Us" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeading({
  number,
  title,
  id,
}: {
  number: string;
  title: string;
  id: string;
}) {
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
    <div className="pl-[52px] space-y-4 text-[16px] leading-[1.8] text-[#40493c] font-body">
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
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

// ─── Mobile TOC accordion ─────────────────────────────────────────────────────

function MobileTOC({ activeId }: { activeId: string }) {
  const [open, setOpen] = useState(false);
  const activeItem = TOC_ITEMS.find((t) => t.id === activeId) ?? TOC_ITEMS[0];

  function handleClick(id: string) {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
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
          <span
            className="text-[14px] font-semibold text-[#1a1c1c]"
            style={{ fontFamily: "var(--font-stagnan)" }}
          >
            {open ? "Table of Contents" : `Contents: ${activeItem.label}`}
          </span>
        </div>
        <Icon
          icon={open ? "mdi:chevron-up" : "mdi:chevron-down"}
          width={20}
          className="text-[#27731e]"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="toc-mobile"
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
                    activeId === item.id
                      ? "text-[#27731e] font-semibold"
                      : "text-[#40493c] hover:text-[#27731e]",
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

// ─── Desktop sticky TOC sidebar ───────────────────────────────────────────────

function DesktopTOC({ activeId }: { activeId: string }) {
  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
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
                  activeId === item.id
                    ? "bg-[#27731e] text-white"
                    : "bg-[#e8fce3] text-[#27731e]/70 group-hover:bg-[#27731e]/10",
                ].join(" ")}
              >
                {i + 1}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Contact card */}
        <div className="mt-8 rounded-[12px] bg-[#f4fff3] border border-[#d4ebd0] p-4">
          <p className="text-[12px] text-[#40493c] font-body leading-relaxed">
            Questions about this policy?
          </p>
          <Link
            href="/contact"
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#27731e] hover:text-[#045a03] font-body transition-colors"
          >
            Contact us
            <Icon icon="mdi:arrow-right" width={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

export function PrivacyPolicyContent() {
  const [activeId, setActiveId] = useState(TOC_ITEMS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Scrollspy: track which section heading is in view
  useEffect(() => {
    const headings = TOC_ITEMS.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    headings.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <>
      {/* ── Hero Banner ───────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #045a03 0%, #27731e 50%, #3a9430 100%)",
        }}
      >
        {/* Decorative circles */}
        <div className="absolute -right-20 -top-20 w-[400px] h-[400px] rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -left-10 bottom-0 w-[250px] h-[250px] rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 max-w-[1100px] mx-auto px-6 py-16 md:py-20">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 mb-8" aria-label="Breadcrumb">
            <Link
              href="/"
              className="text-white/60 text-[13px] font-body hover:text-white transition-colors"
            >
              Home
            </Link>
            <Icon icon="mdi:chevron-right" width={14} className="text-white/40" />
            <span className="text-white/80 text-[13px] font-body">Privacy Policy</span>
          </nav>

          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 mb-5">
                <Icon icon="mdi:shield-check-outline" width={15} className="text-[#a4f690]" />
                <span className="text-white/90 text-[12px] font-body tracking-wide">
                  Kenya Data Protection Act 2019
                </span>
              </div>
              <h1
                className="text-[40px] md:text-[54px] font-bold text-white leading-[1.1] mb-3"
                style={{ fontFamily: "var(--font-stagnan)" }}
              >
                Privacy Policy
              </h1>
              <p className="text-white/70 text-[16px] font-body max-w-[480px] leading-relaxed">
                How Fechi Organics collects, uses, and protects your personal information.
              </p>
            </div>

            <div className="flex flex-col gap-2 self-end pb-1">
              <div className="bg-white/15 border border-white/25 rounded-[12px] px-5 py-3 text-right">
                <p className="text-white/50 text-[11px] font-body uppercase tracking-wider mb-0.5">
                  Effective Date
                </p>
                <p
                  className="text-white text-[15px] font-semibold"
                  style={{ fontFamily: "var(--font-stagnan)" }}
                >
                  7 June 2026
                </p>
              </div>
              <div className="bg-white/15 border border-white/25 rounded-[12px] px-5 py-3 text-right">
                <p className="text-white/50 text-[11px] font-body uppercase tracking-wider mb-0.5">
                  Last Updated
                </p>
                <p
                  className="text-white text-[15px] font-semibold"
                  style={{ fontFamily: "var(--font-stagnan)" }}
                >
                  7 June 2026
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6 py-14">
        {/* Mobile TOC */}
        <MobileTOC activeId={activeId} />

        <div className="flex gap-16 items-start">
          {/* Desktop TOC */}
          <DesktopTOC activeId={activeId} />

          {/* Sections */}
          <article className="flex-1 min-w-0 space-y-14">

            {/* 1. Introduction */}
            <section>
              <SectionHeading number="01" title="Introduction" id="introduction" />
              <SectionBody>
                <p>
                  Fechi Organics (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is a
                  Kenyan organic beauty and wellness brand committed to keeping your personal
                  information safe. This Privacy Policy explains what data we collect when you
                  visit our website or place an order, how we use it, and the rights you hold under
                  Kenyan law.
                </p>
                <p>
                  By using the Fechi Organics website or purchasing our products, you agree to the
                  practices described in this policy. If you do not agree, please do not use our
                  services.
                </p>
                <p>
                  This policy applies to all personal data processed by Fechi Organics in
                  connection with our e-commerce operations in Kenya and is effective as of
                  7 June 2026.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 2. Information We Collect */}
            <section>
              <SectionHeading number="02" title="Information We Collect" id="information-collect" />
              <SectionBody>
                <p>
                  We collect information you give us directly and information gathered
                  automatically as you use our website.
                </p>
                <p className="font-semibold text-[#1a1c1c]">Information you provide:</p>
                <BulletList
                  items={[
                    "Name and email address — when you create an account or place an order.",
                    "Phone number — for order delivery coordination.",
                    "Delivery address — street, city, county, and postcode for shipping.",
                    "Payment information — we do not store your card details. Payments are processed securely by our third-party payment processor and are subject to their privacy policy.",
                  ]}
                />
                <p className="font-semibold text-[#1a1c1c] mt-4">Information collected automatically:</p>
                <BulletList
                  items={[
                    "Device and browser data — IP address, browser type, operating system.",
                    "Usage data — pages visited, time on site, links clicked, referral source.",
                    "Cookie data — session identifiers, preferences, and analytics markers (see Section 6).",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 3. How We Use Your Information */}
            <section>
              <SectionHeading number="03" title="How We Use Your Information" id="how-we-use" />
              <SectionBody>
                <p>We use your personal data only for the following purposes:</p>
                <BulletList
                  items={[
                    "Processing and fulfilling your orders, including payment verification and delivery.",
                    "Sending order confirmations, dispatch notifications, and delivery updates.",
                    "Responding to your customer support enquiries.",
                    "Improving our website, product range, and user experience through analytics.",
                    "Sending marketing communications — only where you have given your consent, and only until you unsubscribe.",
                    "Complying with our legal obligations under Kenyan law, including tax record-keeping.",
                  ]}
                />
                <p>
                  We will never use your data in a way that is incompatible with the purpose for
                  which it was collected, and we do not make automated decisions about you that
                  produce significant legal effects.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 4. Legal Basis */}
            <section>
              <SectionHeading number="04" title="Legal Basis" id="legal-basis" />
              <SectionBody>
                <p>
                  Our processing of your personal data is governed by the{" "}
                  <strong>Kenya Data Protection Act 2019</strong>. We rely on the following lawful
                  bases:
                </p>
                <BulletList
                  items={[
                    "Contract performance — processing your order and delivering your products.",
                    "Legitimate interest — improving our services, preventing fraud, and ensuring website security.",
                    "Consent — sending marketing emails or SMS; you may withdraw consent at any time.",
                    "Legal obligation — retaining financial records as required by Kenyan tax regulations.",
                  ]}
                />
                <p>
                  Where we rely on consent, you have the right to withdraw it at any time without
                  affecting the lawfulness of prior processing. To withdraw consent, email us at{" "}
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="text-[#27731e] underline underline-offset-2 hover:text-[#045a03] transition-colors"
                  >
                    hello@fechiorganics.com
                  </a>
                  .
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 5. Data Sharing */}
            <section>
              <SectionHeading number="05" title="Data Sharing" id="data-sharing" />
              <SectionBody>
                <p>
                  <strong>We do not sell your personal data.</strong> We share it only where
                  strictly necessary to operate our business:
                </p>
                <BulletList
                  items={[
                    "Payment processors — to securely handle card and mobile money transactions.",
                    "Delivery and logistics partners — your name, phone number, and delivery address to facilitate shipping.",
                    "Email service provider (Resend) — to send transactional and marketing emails on our behalf.",
                    "Analytics tools — aggregated, anonymised usage data to understand how our website is used.",
                  ]}
                />
                <p>
                  All third parties we share data with are contractually required to process it
                  only for the specified purpose, maintain adequate security measures, and comply
                  with applicable data protection law. We do not transfer your data outside Kenya
                  except where necessary and with appropriate safeguards in place.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 6. Cookies */}
            <section>
              <SectionHeading number="06" title="Cookies" id="cookies" />
              <SectionBody>
                <p>
                  Our website uses cookies — small text files stored on your device — to make the
                  site work properly and improve your experience. We use:
                </p>
                <BulletList
                  items={[
                    "Session cookies — keep you logged in during your visit; deleted when you close your browser.",
                    "Preference cookies — remember your currency selection and display settings.",
                    "Analytics cookies — help us understand traffic patterns and popular pages (data is aggregated and anonymous).",
                  ]}
                />
                <p>
                  You can control cookies through your browser settings. Disabling cookies may
                  affect some functionality (such as staying logged in or retaining your cart
                  contents). Most browsers allow you to block third-party cookies specifically
                  while keeping essential cookies active.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 7. Data Retention */}
            <section>
              <SectionHeading number="07" title="Data Retention" id="data-retention" />
              <SectionBody>
                <p>We keep your personal data only for as long as necessary:</p>
                <BulletList
                  items={[
                    "Order and transaction records — 7 years, as required for tax compliance under Kenyan law.",
                    "Account data — retained until you request deletion of your account.",
                    "Marketing preferences — until you unsubscribe; we will then delete your address from our marketing lists promptly.",
                    "Analytics data — aggregated and anonymised; no individual retention limit applies.",
                  ]}
                />
                <p>
                  When data is no longer required, we securely delete or anonymise it so it cannot
                  be linked back to you.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 8. Your Rights */}
            <section>
              <SectionHeading number="08" title="Your Rights (Kenya DPA 2019)" id="your-rights" />
              <SectionBody>
                <p>
                  Under the Kenya Data Protection Act 2019 you have the following rights regarding
                  your personal data:
                </p>
                <BulletList
                  items={[
                    "Right of access — request a copy of the personal data we hold about you.",
                    "Right to rectification — ask us to correct inaccurate or incomplete data.",
                    "Right to erasure — request that we delete your data, subject to legal retention requirements.",
                    "Right to restriction — ask us to pause processing of your data in certain circumstances.",
                    "Right to object — object to processing based on legitimate interests or for direct marketing.",
                    "Right to data portability — receive your data in a portable, machine-readable format.",
                  ]}
                />
                <p>
                  To exercise any of these rights, email us at{" "}
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="text-[#27731e] underline underline-offset-2 hover:text-[#045a03] transition-colors"
                  >
                    hello@fechiorganics.com
                  </a>{" "}
                  with the subject line &ldquo;Data Rights Request&rdquo;. We will respond within
                  30 days. We may need to verify your identity before processing your request.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 9. Children's Privacy */}
            <section>
              <SectionHeading number="09" title="Children's Privacy" id="childrens-privacy" />
              <SectionBody>
                <p>
                  Our website and services are not directed at persons under the age of 18. We do
                  not knowingly collect personal data from children. If we become aware that a
                  child has provided us with personal information, we will delete it promptly.
                </p>
                <p>
                  If you believe a child has submitted personal data to us, please contact us at{" "}
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="text-[#27731e] underline underline-offset-2 hover:text-[#045a03] transition-colors"
                  >
                    hello@fechiorganics.com
                  </a>{" "}
                  so we can take appropriate action.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 10. Changes */}
            <section>
              <SectionHeading number="10" title="Changes to This Policy" id="policy-changes" />
              <SectionBody>
                <p>
                  We may update this Privacy Policy from time to time to reflect changes in our
                  practices, technology, or legal requirements. When we make material changes, we
                  will notify you by:
                </p>
                <BulletList
                  items={[
                    "Sending an email to the address associated with your account, or",
                    "Posting a prominent notice on our homepage.",
                  ]}
                />
                <p>
                  The &ldquo;Effective Date&rdquo; at the top of this page will always reflect when
                  the current version came into force. We encourage you to review this policy
                  periodically. Continued use of our website after the effective date constitutes
                  acceptance of the updated policy.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 11. Contact */}
            <section>
              <SectionHeading number="11" title="Contact Us" id="contact" />
              <SectionBody>
                <p>
                  If you have any questions, concerns, or requests relating to this Privacy Policy
                  or the way we handle your personal data, please get in touch:
                </p>
                <div className="mt-4 rounded-[16px] bg-[#f4fff3] border border-[#d4ebd0] p-6">
                  <p
                    className="font-semibold text-[#1a1c1c] mb-1"
                    style={{ fontFamily: "var(--font-stagnan)" }}
                  >
                    Fechi Organics — Data Enquiries
                  </p>
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="inline-flex items-center gap-2 text-[#27731e] font-semibold hover:text-[#045a03] transition-colors font-body"
                  >
                    <Icon icon="mdi:email-outline" width={17} />
                    hello@fechiorganics.com
                  </a>
                  <p className="mt-3 text-[14px] text-[#40493c]/80">
                    We aim to respond to all privacy-related enquiries within 30 days.
                  </p>
                </div>
              </SectionBody>
            </section>

            {/* Bottom CTA */}
            <div className="mt-10 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#27731e] to-[#045a03] p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p
                  className="text-white text-[20px] font-semibold mb-1"
                  style={{ fontFamily: "var(--font-stagnan)" }}
                >
                  Questions about this policy?
                </p>
                <p className="text-white/70 text-[14px] font-body">
                  Our team is happy to explain anything in plain language.
                </p>
              </div>
              <Link
                href="/contact"
                className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-[#27731e] rounded-full px-7 py-3 text-[15px] font-semibold hover:bg-[#e8fce3] transition-colors font-body"
              >
                Contact Us
                <Icon icon="mdi:arrow-right" width={16} />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
