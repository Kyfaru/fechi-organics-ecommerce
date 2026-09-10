import { db } from "@/lib/db"
import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { FaqPageClient } from "@/components/faq/FaqPageClient"

export const metadata = { title: "FAQs | Fechi Organics", description: "Answers to your most common questions about Fechi Organics products and services." }

export default async function FaqPage() {
  const faqs = await db.faq.findMany({
    where: { status: "published" },
    orderBy: { order: "asc" },
  })

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar flat />
      <main className="flex-1">
        <FaqPageClient faqs={faqs} />
      </main>
      <Footer />
    </div>
  )
}
