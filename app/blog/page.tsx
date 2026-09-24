import { connection } from "next/server";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BlogClient } from "@/components/blog/BlogClient";
import { HeroCarousel } from "@/components/blog/HeroCarousel";
import { RankingStrip } from "@/components/blog/RankingStrip";
import { getPublishedPosts, getBlogRankings } from "@/lib/queries/blog";

export const metadata = {
  title: "Blog",
  description: "Tips, stories & natural living from the Fechi Organics team.",
};

export default async function BlogPage() {
  // Sentry's OpenTelemetry auto-instrumentation generates a random span id
  // (Math.random()) for this route's render span before our own DB queries
  // below run, which trips Next 16's "random used before uncached/request
  // data" prerender guard and forces a client-side tree regeneration —
  // manifesting as a hydration mismatch and a visibly broken hero/navbar on
  // first paint. connection() opts the route into dynamic rendering up front
  // so that ordering ambiguity never arises. See app/admin/(protected)/orders/new/page.tsx
  // for the same pattern.
  await connection();
  const [posts, rankings] = await Promise.all([getPublishedPosts(), getBlogRankings()]);

  return (
    <main className="min-h-screen bg-white overflow-x-hidden scroll-smooth">
      <Navbar transparent />
      <HeroCarousel posts={posts} />
      <RankingStrip rankings={rankings} />
      <BlogClient posts={posts} />
      <Footer />
    </main>
  );
}
