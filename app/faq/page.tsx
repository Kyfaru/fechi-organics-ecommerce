import { db } from "@/lib/db"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"

export const metadata = { title: "FAQs | Fechi Organics", description: "Answers to your most common questions about Fechi Organics products and services." }

export default async function FaqPage() {
  const faqs = await db.faq.findMany({
    where: { status: "published" },
    orderBy: { order: "asc" },
  })

  // Group by faq.group
  const groups: Record<string, typeof faqs> = {}
  for (const faq of faqs) {
    const g = faq.group || "General"
    if (!groups[g]) groups[g] = []
    groups[g].push(faq)
  }
  const groupNames = Object.keys(groups)

  return (
    <div className="min-h-screen flex flex-col bg-[#f9fafb] dark:bg-neutral-950">
      <Navbar flat />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 pt-16 pb-24">
        {/* Page header */}
        <div className="text-center mb-14">
          <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-[#15803D] bg-[#f0fdf4] border border-[#dcfce7] px-3 py-1.5 rounded-full mb-4">
            Help Center
          </span>
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-lg max-w-xl mx-auto leading-relaxed">
            Everything you need to know about Fechi Organics. Can&apos;t find your answer?{" "}
            <a href="/contact" className="text-[#15803D] hover:underline font-medium">Contact us</a>.
          </p>
        </div>

        {groupNames.length === 0 && (
          <div className="text-center py-16 text-neutral-400">
            <p className="text-lg">No FAQs available yet. Check back soon!</p>
          </div>
        )}

        {/* FAQ groups */}
        <div className="space-y-10">
          {groupNames.map((group) => (
            <section key={group}>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#15803D] mb-4 pl-1">
                {group}
              </h2>
              <div className="space-y-2">
                {groups[group].map((faq) => (
                  <details
                    key={faq.id}
                    className="group bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden"
                  >
                    <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none select-none">
                      <span className="text-[15px] font-semibold text-neutral-900 dark:text-white pr-4">
                        {faq.question}
                      </span>
                      <svg
                        className="w-4 h-4 text-[#15803D] shrink-0 transition-transform duration-200 group-open:rotate-180"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="px-6 pb-5 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                      <p className="text-neutral-600 dark:text-neutral-400 text-[15px] leading-relaxed whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
