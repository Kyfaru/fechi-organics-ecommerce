"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PhoneInput from "@/components/ui/PhoneInput";
import { posthog } from "@/lib/posthog";
import { ContactSuccessModal } from "@/components/contact/ContactSuccessModal";

function CustomSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between border border-[#c0cab8] dark:border-gray-600 rounded-[8px] px-4 py-3 font-body text-[14px] text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800 outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] cursor-pointer transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}</span>
        <Icon
          icon={open ? "mdi:chevron-up" : "mdi:chevron-down"}
          width={18}
          className="text-[#40493c] dark:text-gray-400 flex-shrink-0"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-gray-800 border border-[#c0cab8] dark:border-gray-600 rounded-[10px] shadow-lg overflow-hidden"
          >
            {options.map((opt) => (
              <li
                key={opt}
                role="option"
                aria-selected={opt === value}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={[
                  "px-4 py-2.5 font-body text-[14px] cursor-pointer transition-colors",
                  opt === value
                    ? "bg-[#27731e] text-white"
                    : "text-[#1a1c1c] dark:text-gray-200 hover:bg-[#e8fce3] dark:hover:bg-gray-700",
                ].join(" ")}
              >
                {opt}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

const BRANCHES = [
  {
    city: "Nairobi",
    mall: "Spice Mall, Ground Floor",
    hours: "Mon–Sat, 9am–8pm",
    maps: "https://maps.google.com",
  },
  {
    city: "Nakuru",
    mall: "Westlands Mall, 1st Floor",
    hours: "Mon–Sat, 9am–7pm",
    maps: "https://maps.google.com",
  },
  {
    city: "Eldoret",
    mall: "Trujas Mall, Ground Floor",
    hours: "Mon–Sat, 9am–7pm",
    maps: "https://maps.google.com",
  },
  {
    city: "Mwea",
    mall: "Wanguru Plaza, 4",
    hours: "Mon–Sun, 9am–8pm",
    maps: "https://maps.google.com",
  },
  {
    city: "Kitengela",
    mall: "Kitengela Mall, 2nd Floor",
    hours: "Mon–Sun, 9am–8pm",
    maps: "https://maps.google.com",
  },
];

const WHY_CARDS = [
  {
    icon: "mdi:leaf-circle-outline",
    title: "100% Organic",
    desc: "Sourced purely from nature, free from harsh chemicals and synthetic additives.",
  },
  {
    icon: "mdi:paw-outline",
    title: "Cruelty-Free",
    desc: "We love all creatures. Our products are never tested on animals.",
  },
  {
    icon: "mdi:earth",
    title: "African Heritage",
    desc: "Formulated with indigenous African botanicals trusted for generations.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What are your delivery options?",
    a: "We offer standard delivery (3–5 business days) and express delivery (next day) across Kenya. International shipping is available to 12+ countries.",
  },
  {
    q: "What is your return policy?",
    a: "We accept returns within 14 days of purchase for unopened products in original packaging. Please contact our support team to initiate a return.",
  },
  {
    q: "Are your products suitable for sensitive skin?",
    a: "Yes! All Fechi Organics products are dermatologist-tested and formulated for all skin types, including sensitive skin. Our Gentle Cleanser and Soothing Balm are especially designed for sensitive skin.",
  },
];

const ORDER_INQUIRY_OPTIONS = [
  "Order Inquiry",
  "Product Question",
  "Delivery Issue",
  "Request a Delivery Zone",
  "Return Request",
  "Partnership",
  "Other",
];

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="max-w-[720px] mx-auto">
      {FAQ_ITEMS.map((faq, idx) => (
        <div key={idx} className="border-b border-[#e2e2e2] dark:border-gray-700">
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="w-full flex items-center justify-between py-5 text-left gap-4"
          >
            <span className="font-body text-[#1a1c1c] dark:text-gray-200 text-[16px]">{faq.q}</span>
            <span
              className={[
                "flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border transition-all",
                open === idx
                  ? "bg-[#27731e] border-[#27731e] text-white"
                  : "border-[#c0cab8] dark:border-gray-600 text-[#1a1c1c] dark:text-gray-300",
              ].join(" ")}
            >
              <Icon icon={open === idx ? "mdi:minus" : "mdi:plus"} width={16} />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {open === idx && (
              <motion.div
                key="content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px] leading-[1.6] pb-5">{faq.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

const MESSAGE_MAX = 50000;

/* shared input classes to avoid repetition */
const inputCls =
  "w-full border border-[#c0cab8] dark:border-gray-600 rounded-[8px] px-4 py-3 font-body text-[14px] text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800 outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] placeholder-[#a1a1a1] dark:placeholder-gray-500 transition-colors";

export function ContactClient() {
  // Pre-fill subject (and optionally a starter message) from the query string —
  // used by the /shipping page's "Request a New Zone" CTA so a zone request
  // becomes a normal contact-form ticket instead of a separate backend path.
  // Read once via a lazy useState initializer (matches the searchParams.get()
  // pattern already used in ShopClient) rather than setState-in-effect.
  const searchParams = useSearchParams();
  const [form, setForm] = useState(() => {
    const subjectParam = searchParams.get("subject");
    const countyParam = searchParams.get("county");
    const subject =
      subjectParam && ORDER_INQUIRY_OPTIONS.includes(subjectParam) ? subjectParam : "Order Inquiry";
    return {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      subject,
      message: countyParam
        ? `Hi, I'd like to request delivery to ${countyParam} County — it's not currently listed on the Shipping page.`
        : "",
    };
  });
  const [sending, setSending] = useState(false);
  const [successModal, setSuccessModal] = useState<{ open: boolean; ticketNumber?: string }>({
    open: false,
  });
  const [messageOverflow, setMessageOverflow] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    if (name === "message" && value.length > MESSAGE_MAX) {
      setForm((prev) => ({ ...prev, message: value.slice(0, MESSAGE_MAX) }));
      setMessageOverflow(true);
      window.setTimeout(() => setMessageOverflow(false), 400);
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${form.firstName} ${form.lastName}`.trim(),
          email: form.email,
          phone: form.phone,
          subject: form.subject,
          message: form.message,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const urlParams = new URLSearchParams(window.location.search);
        posthog.capture("contact_form_submitted", {
          subject: form.subject,
          has_phone: !!form.phone,
          referrer: document.referrer || null,
          utm_source: urlParams.get("utm_source"),
          utm_medium: urlParams.get("utm_medium"),
          utm_campaign: urlParams.get("utm_campaign"),
        });
        const ticketNumber = json.data?.ticketNumber as string | undefined;
        setSuccessModal({ open: true, ticketNumber });
        setForm({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          subject: "Order Inquiry",
          message: "",
        });
      } else {
        toast.error(json.error?.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function handleCloseSuccessModal() {
    const { ticketNumber } = successModal;
    setSuccessModal({ open: false });
    toast.success(
      ticketNumber ? `Ticket ${ticketNumber} created — we'll be in touch soon.` : "We'll be in touch soon."
    );
  }

  return (
    <>
      <ContactSuccessModal
        open={successModal.open}
        ticketNumber={successModal.ticketNumber}
        onClose={handleCloseSuccessModal}
      />

      {/* Hero header */}
      <section className="bg-white dark:bg-gray-950 px-4 md:px-8 pt-10 pb-16 text-center transition-colors">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="font-body text-[#40493c] dark:text-gray-400 text-[12px] md:text-[13px] tracking-[1.5px] uppercase mb-3">
            We&apos;d Love to Hear From You
          </p>
          <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[40px] md:text-[58px] tracking-[-1.16px] leading-tight">
            Get In Touch
          </h1>
        </motion.div>
      </section>

      {/* Main content — Form + Contact cards */}
      <section className="px-4 md:px-8 pb-16 bg-[#f9f9f9] dark:bg-gray-900 transition-colors">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Send a Message form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-white dark:bg-gray-950 rounded-[20px] p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-gray-800"
          >
            <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[24px] md:text-[28px] mb-2">
              Send Us a Message
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[14px] mb-6">
              Have a question about our products or your order? Drop us a line below.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* First + Last name row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-body text-[#40493c] dark:text-gray-400 text-[12px] mb-1.5 block">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    required
                    placeholder="Jane"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="font-body text-[#40493c] dark:text-gray-400 text-[12px] mb-1.5 block">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    required
                    placeholder="Doe"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="font-body text-[#40493c] dark:text-gray-400 text-[12px] mb-1.5 block">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  placeholder="jane@example.com"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <PhoneInput
                  label="Phone Number"
                  value={form.phone as import("react-phone-number-input").Value | undefined}
                  onChange={(val) => setForm((prev) => ({ ...prev, phone: val ?? "" }))}
                />
                <div>
                  <label className="font-body text-[#40493c] dark:text-gray-400 text-[12px] mb-1.5 block">Subject</label>
                  <CustomSelect
                    value={form.subject}
                    onChange={(v) => setForm((prev) => ({ ...prev, subject: v }))}
                    options={ORDER_INQUIRY_OPTIONS}
                  />
                </div>
              </div>

              <div>
                <label className="font-body text-[#40493c] dark:text-gray-400 text-[12px] mb-1.5 block">Message</label>
                <div className="relative">
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    required
                    rows={4}
                    maxLength={MESSAGE_MAX}
                    placeholder="How can we help you today?"
                    className={`${inputCls} resize-none ${messageOverflow ? "animate-shake-error border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                  />
                  {messageOverflow && (
                    <Icon
                      icon="mdi:alert-circle"
                      width={18}
                      className="absolute top-3 right-3 text-red-500"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  {messageOverflow ? (
                    <span className="font-body text-[12px] text-red-500">
                      Message can&apos;t exceed {MESSAGE_MAX.toLocaleString()} characters.
                    </span>
                  ) : (
                    <span />
                  )}
                  <span
                    className={`font-body text-[12px] shrink-0 ${
                      form.message.length >= MESSAGE_MAX ? "text-red-500" : "text-[#a1a1a1] dark:text-gray-500"
                    }`}
                  >
                    {form.message.length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full bg-[#fec700] hover:brightness-95 text-[#1a1c1c] font-body font-semibold text-[15px] rounded-[40px] py-4 transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {sending ? (
                  <>
                    <Icon icon="mdi:loading" width={18} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Message"
                )}
              </button>
            </form>
          </motion.div>

          {/* Contact cards */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start"
          >
            <ContactCard
              icon="mdi:phone-outline"
              iconBg="#e8fce3"
              iconColor="#27731e"
              title="Phone"
              lines={["+254 768 151 505", "Mon–Fri, 8am–6pm"]}
            />
            <ContactCard
              icon="mdi:whatsapp"
              iconBg="#dcfce7"
              iconColor="#16a34a"
              title="WhatsApp"
              lines={["+254 768 151 505", "Typically responds"]}
            />
            <ContactCard
              icon="mdi:email-outline"
              iconBg="#fef9c3"
              iconColor="#ca8a04"
              title="Email"
              lines={["fechiorganicsltd@gmail.com", "Response within 24h"]}
            />
            <ContactCard
              icon="mdi:store-outline"
              iconBg="#f0fdf4"
              iconColor="#27731e"
              title="Stores"
              lines={["Find a retail partner", "View locations below"]}
            />
          </motion.div>
        </div>
      </section>

      {/* Our Branches */}
      <section className="px-4 md:px-8 py-16 bg-white dark:bg-gray-950 transition-colors">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[32px] md:text-[40px] tracking-[-1px] mb-3">
              Our Branches
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px] max-w-[400px] mx-auto">
              Find a Fechi Organics store near you and experience our products in person.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {BRANCHES.map((branch, idx) => (
              <motion.div
                key={branch.city}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.07 }}
                className="bg-[#f9f9f9] dark:bg-gray-900 rounded-[16px] p-5 flex flex-col gap-3 border border-transparent dark:border-gray-800"
              >
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:map-marker-outline" width={18} className="text-[#27731e] dark:text-green-400 flex-shrink-0" />
                  <span className="font-body font-semibold text-[#1a1c1c] dark:text-white text-[15px]">{branch.city}</span>
                </div>
                <p className="font-body text-[#40493c] dark:text-gray-400 text-[13px] leading-[1.5]">{branch.mall}</p>
                <div className="flex items-center gap-1 text-[#40493c] dark:text-gray-500">
                  <Icon icon="mdi:clock-outline" width={14} />
                  <span className="font-body text-[12px]">{branch.hours}</span>
                </div>
                <a
                  href={branch.maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[#27731e] text-white rounded-full px-4 py-2 font-body text-[12px] hover:bg-[#045a03] transition-colors w-fit mt-auto"
                >
                  <Icon icon="mdi:directions" width={14} />
                  Get Directions
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Fechi Organics */}
      <section className="px-4 md:px-8 py-16 bg-[#f4fff3] dark:bg-gray-900 transition-colors">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2 className="font-heading font-semibold text-[#27731e] dark:text-green-400 text-[32px] md:text-[40px] tracking-[-1px] mb-3">
              Why Choose Fechi Organics
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px]">Committed to your skin and our planet.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHY_CARDS.map((card, idx) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="flex flex-col items-center text-center p-8 bg-white dark:bg-gray-950 rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-gray-800"
              >
                <div className="w-16 h-16 bg-[#27731e] rounded-full flex items-center justify-center mb-5">
                  <Icon icon={card.icon} width={32} className="text-white" />
                </div>
                <h3 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[20px] mb-3">{card.title}</h3>
                <p className="font-body text-[#40493c] dark:text-gray-400 text-[14px] leading-[1.6]">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-4 md:px-8 py-16 bg-white dark:bg-gray-950 transition-colors">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2 className="font-heading font-semibold text-[#27731e] dark:text-green-400 text-[32px] md:text-[40px] tracking-[-1px] mb-3">
              Frequently Asked Questions
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px]">Quick answers to common questions.</p>
          </motion.div>

          <FaqAccordion />
        </div>
      </section>
    </>
  );
}

function ContactCard({
  icon,
  iconBg,
  iconColor,
  title,
  lines,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  lines: string[];
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="bg-white dark:bg-gray-950 rounded-[16px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-gray-800 flex flex-col gap-3"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        <Icon icon={icon} width={24} style={{ color: iconColor }} />
      </div>
      <div>
        <h3 className="font-body font-semibold text-[#1a1c1c] dark:text-white text-[15px] mb-1">{title}</h3>
        {lines.map((line, i) => (
          <p
            key={i}
            className={`font-body text-[13px] ${
              i === 0 ? "text-[#1a1c1c] dark:text-gray-300" : "text-[#a1a1a1] dark:text-gray-500"
            }`}
          >
            {line}
          </p>
        ))}
      </div>
    </motion.div>
  );
}
