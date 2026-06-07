"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Section data ─────────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: "introduction",         label: "Introduction" },
  { id: "products-availability",label: "Products & Availability" },
  { id: "pricing",              label: "Pricing" },
  { id: "orders-payment",       label: "Orders & Payment" },
  { id: "promo-codes",          label: "Promo Codes" },
  { id: "delivery",             label: "Delivery" },
  { id: "returns-refunds",      label: "Returns & Refunds" },
  { id: "product-descriptions", label: "Product Descriptions" },
  { id: "intellectual-property","label": "Intellectual Property" },
  { id: "user-accounts",        label: "User Accounts" },
  { id: "liability",            label: "Limitation of Liability" },
  { id: "governing-law",        label: "Governing Law" },
  { id: "changes-terms",        label: "Changes to Terms" },
  { id: "contact",              label: "Contact Us" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Light green highlight box for important terms (payment, refund, liability). */
function HighlightBox({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] bg-[#f4fff3] border border-[#c8e8c5] p-5 flex gap-3">
      <Icon icon={icon} width={20} className="text-[#27731e] flex-shrink-0 mt-0.5" />
      <div className="text-[15px] leading-[1.75] text-[#40493c] font-body">{children}</div>
    </div>
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
            key="toc-mobile-terms"
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

// ─── Desktop sticky TOC ───────────────────────────────────────────────────────

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
            Need help understanding these terms?
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

export function TermsContent() {
  const [activeId, setActiveId] = useState(TOC_ITEMS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

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
          background: "linear-gradient(135deg, #1a1c1c 0%, #2d3028 50%, #27731e 100%)",
        }}
      >
        <div className="absolute -right-16 -top-16 w-[380px] h-[380px] rounded-full bg-[#27731e]/10 pointer-events-none" />
        <div className="absolute -left-8 bottom-0 w-[220px] h-[220px] rounded-full bg-white/5 pointer-events-none" />

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
            <span className="text-white/80 text-[13px] font-body">Terms &amp; Conditions</span>
          </nav>

          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 mb-5">
                <Icon icon="mdi:gavel" width={15} className="text-[#a4f690]" />
                <span className="text-white/90 text-[12px] font-body tracking-wide">
                  Kenya Consumer Protection Act 2012
                </span>
              </div>
              <h1
                className="text-[40px] md:text-[54px] font-bold text-white leading-[1.1] mb-3"
                style={{ fontFamily: "var(--font-stagnan)" }}
              >
                Terms &amp; Conditions
              </h1>
              <p className="text-white/70 text-[16px] font-body max-w-[480px] leading-relaxed">
                Please read these terms carefully before using our website or placing an order.
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
            </div>
          </div>
        </div>
      </section>

      {/* ── Acceptance notice banner ──────────────────────────────────────── */}
      <div className="bg-[#f4fff3] border-b border-[#d4ebd0]">
        <div className="max-w-[1100px] mx-auto px-6 py-3.5 flex items-center gap-3">
          <Icon icon="mdi:information-outline" width={18} className="text-[#27731e] flex-shrink-0" />
          <p className="text-[14px] text-[#40493c] font-body">
            <strong className="text-[#1a1c1c]">Note:</strong> By placing an order on the Fechi
            Organics website, you confirm that you have read and accept these Terms &amp;
            Conditions.
          </p>
        </div>
      </div>

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
                  These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of the Fechi
                  Organics website and the purchase of products from us. They form a binding
                  agreement between you (&ldquo;the customer&rdquo;) and Fechi Organics
                  (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), a Kenyan organic
                  beauty and wellness brand.
                </p>
                <p>
                  By browsing our website or placing an order, you confirm that you are at least
                  18 years old and that you agree to be bound by these Terms. If you do not agree,
                  please do not use our website or services.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 2. Products & Availability */}
            <section>
              <SectionHeading number="02" title="Products &amp; Availability" id="products-availability" />
              <SectionBody>
                <p>
                  We offer a range of natural and organic beauty and wellness products. All products
                  are subject to availability. We make every reasonable effort to maintain accurate
                  stock levels on our website; however, we cannot guarantee that a product will
                  always be in stock at the time of your order.
                </p>
                <BulletList
                  items={[
                    "We reserve the right to limit the quantity of any product purchased per customer or per order.",
                    "Product images are for illustrative purposes. Natural products may vary slightly in colour, texture, or scent from batch to batch.",
                    "We may withdraw or discontinue any product from sale at any time without prior notice.",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 3. Pricing */}
            <section>
              <SectionHeading number="03" title="Pricing" id="pricing" />
              <SectionBody>
                <HighlightBox icon="mdi:tag-outline">
                  All prices displayed on the Fechi Organics website are in{" "}
                  <strong>Kenyan Shillings (KES)</strong> and include applicable VAT. The price
                  applicable to your order is the price shown at the time you place your order.
                </HighlightBox>
                <p>
                  We reserve the right to change product prices at any time without prior notice.
                  Price changes will not affect orders that have already been confirmed by us via
                  a confirmation email.
                </p>
                <p>
                  In the event of a pricing error on our website, we reserve the right to cancel
                  or refuse orders placed at the incorrect price. We will notify you promptly if
                  this occurs and offer a full refund of any amount paid.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 4. Orders & Payment */}
            <section>
              <SectionHeading number="04" title="Orders &amp; Payment" id="orders-payment" />
              <SectionBody>
                <HighlightBox icon="mdi:credit-card-outline">
                  Placing an order on our website constitutes an <strong>offer to purchase</strong>.
                  A binding contract is formed only when we send you an order confirmation email.
                  We reserve the right to decline or cancel any order before this point.
                </HighlightBox>
                <p>
                  We may cancel an order — and issue a full refund — in the following circumstances:
                </p>
                <BulletList
                  items={[
                    "The product is out of stock and cannot be fulfilled within a reasonable timeframe.",
                    "We suspect the order involves fraud or unauthorised use of a payment method.",
                    "The product was listed at an incorrect price due to a system or typographical error.",
                    "The delivery address is outside our current delivery zones.",
                  ]}
                />
                <p>
                  All payments are processed securely through our third-party payment provider.
                  We do not store your card or mobile money details on our servers. By placing an
                  order, you confirm that the payment details you provide are accurate and that you
                  are authorised to use the payment method.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 5. Promo Codes */}
            <section>
              <SectionHeading number="05" title="Promo Codes" id="promo-codes" />
              <SectionBody>
                <p>
                  We may issue promotional codes (&ldquo;promo codes&rdquo;) offering discounts or
                  other benefits. The following conditions apply to all promo codes:
                </p>
                <BulletList
                  items={[
                    "One promo code per transaction — promo codes cannot be stacked or combined.",
                    "Non-transferable — codes are issued for personal use only and may not be sold, shared, or transferred.",
                    "Subject to minimum spend or product eligibility conditions as stated at time of issue.",
                    "Expire on the date stated when the code was issued. Expired codes will not be reactivated.",
                    "We reserve the right to withdraw or modify any promo code at our discretion.",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 6. Delivery */}
            <section>
              <SectionHeading number="06" title="Delivery" id="delivery" />
              <SectionBody>
                <p>
                  We currently deliver within Kenya only. Delivery fees are calculated at checkout
                  based on your location and will be clearly displayed before you complete your
                  order.
                </p>
                <BulletList
                  items={[
                    "Estimated delivery time: 3–7 business days from order confirmation, subject to your location and courier availability.",
                    "Delivery estimates are not guarantees. Delays may occur due to circumstances outside our control, including public holidays, adverse weather, or courier delays.",
                    "Risk of loss and damage to products passes to you upon delivery to your specified address.",
                    "If a delivery attempt fails and the package is returned to us, we will contact you to arrange redelivery. Additional delivery charges may apply.",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 7. Returns & Refunds */}
            <section>
              <SectionHeading number="07" title="Returns &amp; Refunds" id="returns-refunds" />
              <SectionBody>
                <HighlightBox icon="mdi:package-variant-closed-check">
                  <strong>7-day return window.</strong> You may return unopened, unused products
                  in their original packaging within 7 days of delivery. To initiate a return,
                  email us at{" "}
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="text-[#27731e] underline underline-offset-2 hover:text-[#045a03] transition-colors"
                  >
                    hello@fechiorganics.com
                  </a>{" "}
                  with your order number and reason for return.
                </HighlightBox>
                <p>
                  <strong>Opened or used products</strong> are only eligible for return if they
                  are defective or not as described. We may request photographic evidence of the
                  defect before approving a return.
                </p>
                <BulletList
                  items={[
                    "Approved refunds are processed within 7–14 business days of us receiving the returned item.",
                    "Refunds are issued to the original payment method.",
                    "Return shipping costs are the customer's responsibility unless the product is defective or incorrectly sent.",
                    "Sale or promotional items are non-refundable unless defective.",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 8. Product Descriptions */}
            <section>
              <SectionHeading number="08" title="Product Descriptions" id="product-descriptions" />
              <SectionBody>
                <p>
                  We strive to present accurate product descriptions, ingredient lists, and images.
                  However, natural organic products are inherently variable:
                </p>
                <BulletList
                  items={[
                    "Colour and texture may vary slightly between batches due to the use of natural botanicals.",
                    "Scent may vary depending on seasonal harvest conditions of plant-based ingredients.",
                    "Product descriptions are for informational purposes only and do not constitute medical advice.",
                    "Our products are not intended to diagnose, treat, cure, or prevent any disease or medical condition.",
                  ]}
                />
                <p>
                  If you have a specific skin condition, allergy, or medical concern, we recommend
                  consulting a qualified healthcare professional before use. Always perform a patch
                  test before first use of any new skincare product.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 9. Intellectual Property */}
            <section>
              <SectionHeading number="09" title="Intellectual Property" id="intellectual-property" />
              <SectionBody>
                <p>
                  All content on the Fechi Organics website — including but not limited to product
                  photographs, brand copy, graphic designs, logos, the &ldquo;Fechi
                  Organics&rdquo; brand name, and all associated trademarks — is the exclusive
                  intellectual property of Fechi Organics.
                </p>
                <BulletList
                  items={[
                    "You may not reproduce, distribute, modify, or create derivative works from any of our content without our express written permission.",
                    "Personal, non-commercial use (e.g. saving a product image for reference) is permitted provided you do not remove any copyright or trademark notices.",
                    "Unauthorised use of our intellectual property may result in legal action.",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 10. User Accounts */}
            <section>
              <SectionHeading number="10" title="User Accounts" id="user-accounts" />
              <SectionBody>
                <p>
                  When you create an account on the Fechi Organics website, you are responsible
                  for maintaining the confidentiality of your login credentials and for all
                  activity that occurs under your account.
                </p>
                <BulletList
                  items={[
                    "Notify us immediately at hello@fechiorganics.com if you suspect unauthorised access to your account.",
                    "Do not share your password with any third party.",
                    "We reserve the right to suspend or terminate accounts that violate these Terms, are used for fraudulent activity, or are involved in chargebacks without valid cause.",
                    "We are not liable for any loss arising from unauthorised use of your account where you failed to notify us promptly.",
                  ]}
                />
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 11. Limitation of Liability */}
            <section>
              <SectionHeading number="11" title="Limitation of Liability" id="liability" />
              <SectionBody>
                <HighlightBox icon="mdi:shield-alert-outline">
                  To the fullest extent permitted by the{" "}
                  <strong>Kenya Consumer Protection Act 2012</strong>, Fechi Organics shall not be
                  liable for any indirect, incidental, consequential, or punitive damages arising
                  from your use of our website or products. Our total liability to you in respect
                  of any order is capped at the value of that specific order.
                </HighlightBox>
                <p>
                  Nothing in these Terms excludes or limits our liability for:
                </p>
                <BulletList
                  items={[
                    "Death or personal injury caused by our negligence.",
                    "Fraud or fraudulent misrepresentation.",
                    "Any liability that cannot be excluded or limited under Kenyan consumer law.",
                  ]}
                />
                <p>
                  We do not guarantee that the website will be available at all times or free from
                  errors or viruses. We are not liable for any loss resulting from website
                  downtime, data loss, or security incidents outside of our reasonable control.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 12. Governing Law */}
            <section>
              <SectionHeading number="12" title="Governing Law" id="governing-law" />
              <SectionBody>
                <p>
                  These Terms are governed by and construed in accordance with the{" "}
                  <strong>laws of the Republic of Kenya</strong>. Any dispute arising out of or in
                  connection with these Terms shall be subject to the exclusive jurisdiction of
                  the competent courts of Kenya.
                </p>
                <p>
                  We encourage customers to contact us first to resolve any disputes informally.
                  Email us at{" "}
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="text-[#27731e] underline underline-offset-2 hover:text-[#045a03] transition-colors"
                  >
                    hello@fechiorganics.com
                  </a>{" "}
                  and we will endeavour to reach a fair resolution promptly.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 13. Changes to Terms */}
            <section>
              <SectionHeading number="13" title="Changes to Terms" id="changes-terms" />
              <SectionBody>
                <p>
                  We reserve the right to update these Terms &amp; Conditions at any time. For
                  material changes, we will provide at least{" "}
                  <strong>14 days&apos; notice</strong> before the changes take effect, either by:
                </p>
                <BulletList
                  items={[
                    "Sending an email notification to the address associated with your account, or",
                    "Posting a prominent notice on our website homepage.",
                  ]}
                />
                <p>
                  Your continued use of the Fechi Organics website or services after the effective
                  date of updated Terms constitutes your acceptance of the revised Terms. If you do
                  not agree to the updated Terms, you should stop using our website and contact us
                  to close your account.
                </p>
              </SectionBody>
            </section>

            <div className="border-t border-[#e8f4e5]" />

            {/* 14. Contact */}
            <section>
              <SectionHeading number="14" title="Contact Us" id="contact" />
              <SectionBody>
                <p>
                  If you have any questions about these Terms &amp; Conditions or need assistance
                  with an order, please contact us:
                </p>
                <div className="mt-4 rounded-[16px] bg-[#f4fff3] border border-[#d4ebd0] p-6">
                  <p
                    className="font-semibold text-[#1a1c1c] mb-1"
                    style={{ fontFamily: "var(--font-stagnan)" }}
                  >
                    Fechi Organics — Customer Support
                  </p>
                  <a
                    href="mailto:hello@fechiorganics.com"
                    className="inline-flex items-center gap-2 text-[#27731e] font-semibold hover:text-[#045a03] transition-colors font-body"
                  >
                    <Icon icon="mdi:email-outline" width={17} />
                    hello@fechiorganics.com
                  </a>
                  <p className="mt-3 text-[14px] text-[#40493c]/80">
                    We aim to respond to all enquiries within 2 business days.
                  </p>
                </div>
              </SectionBody>
            </section>

            {/* Bottom CTA */}
            <div className="mt-10 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#1a1c1c] to-[#2d3028] p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p
                  className="text-white text-[20px] font-semibold mb-1"
                  style={{ fontFamily: "var(--font-stagnan)" }}
                >
                  Need help with an order?
                </p>
                <p className="text-white/60 text-[14px] font-body">
                  Our team is here to assist you with any queries.
                </p>
              </div>
              <Link
                href="/contact"
                className="flex-shrink-0 inline-flex items-center gap-2 bg-[#27731e] text-white rounded-full px-7 py-3 text-[15px] font-semibold hover:bg-[#045a03] transition-colors font-body"
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
