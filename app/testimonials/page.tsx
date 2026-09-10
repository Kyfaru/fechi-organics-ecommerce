import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { TestimonialsGrid } from "@/components/testimonials/TestimonialsGrid";
import { getTestimonialsPaginated } from "@/lib/queries/testimonials";

export const metadata = {
  title: "Testimonials | Fechi Organics",
  description: "Real results from real customers — before & after stories from the Fechi Organics community.",
};

const PAGE_SIZE = 20;

export default async function TestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam) || 1;

  let paginated;
  try {
    paginated = await getTestimonialsPaginated(requestedPage, PAGE_SIZE);
  } catch (e) {
    // Defensive fallback — never let a DB hiccup take down the whole page.
    console.error("[testimonials/page] failed to load testimonials", e);
    paginated = { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 };
  }

  const { items, page, totalPages, total } = paginated;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <Navbar flat />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 md:px-8 pt-16 pb-24">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-[#15803D] bg-[#f0fdf4] border border-[#dcfce7] px-3 py-1.5 rounded-full mb-4">
            Real Stories
          </span>
          <h1 className="font-heading font-semibold text-[#27731e] text-[40px] md:text-[58px] tracking-[-1.16px]">
            Testimonials
          </h1>
          <p className="font-body text-[15px] text-[#40493c] dark:text-gray-400 mt-3">
            {total} {total === 1 ? "story" : "stories"} from real Fechi Organics customers, in
            their own words — before &amp; after results, and how our products fit into their
            routines.
          </p>
          <Link
            href="/testimonials/new"
            className="inline-flex items-center gap-2 mt-6 bg-[#27731e] text-white font-body font-semibold px-7 py-3.5 rounded-full hover:bg-[#045a03] transition-colors text-[15px]"
          >
            Share Your Story
          </Link>
        </div>

        <TestimonialsGrid testimonials={items} />

        {totalPages > 1 && <PaginationControls page={page} totalPages={totalPages} />}
      </main>

      <Footer />
    </div>
  );
}

function PaginationControls({ page, totalPages }: { page: number; totalPages: number }) {
  const prevHref = `/testimonials?page=${Math.max(1, page - 1)}`;
  const nextHref = `/testimonials?page=${Math.min(totalPages, page + 1)}`;

  // Windowed page numbers (max 7), centered on the current page.
  const windowSize = 7;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav aria-label="Testimonials pagination" className="flex items-center justify-center gap-1 mt-14">
      <Link
        href={prevHref}
        aria-disabled={page === 1}
        tabIndex={page === 1 ? -1 : undefined}
        className={`h-9 w-9 flex items-center justify-center rounded-full border border-[#e2e2e2] dark:border-gray-700 font-body text-[15px] text-[#1a1c1c] dark:text-white hover:bg-[#f0fdf4] dark:hover:bg-gray-800 transition-colors ${page === 1 ? "pointer-events-none opacity-40" : ""}`}
      >
        ‹
      </Link>
      {pages.map((p) => (
        <Link
          key={p}
          href={`/testimonials?page=${p}`}
          aria-current={p === page ? "page" : undefined}
          className={`h-9 w-9 flex items-center justify-center rounded-full font-body text-[14px] transition-colors ${
            p === page
              ? "bg-[#27731e] text-white"
              : "text-[#1a1c1c] dark:text-white hover:bg-[#f0fdf4] dark:hover:bg-gray-800"
          }`}
        >
          {p}
        </Link>
      ))}
      <Link
        href={nextHref}
        aria-disabled={page === totalPages}
        tabIndex={page === totalPages ? -1 : undefined}
        className={`h-9 w-9 flex items-center justify-center rounded-full border border-[#e2e2e2] dark:border-gray-700 font-body text-[15px] text-[#1a1c1c] dark:text-white hover:bg-[#f0fdf4] dark:hover:bg-gray-800 transition-colors ${page === totalPages ? "pointer-events-none opacity-40" : ""}`}
      >
        ›
      </Link>
    </nav>
  );
}
