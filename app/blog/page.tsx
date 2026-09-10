import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BlogClient } from "@/components/blog/BlogClient";
import { HeroCarousel } from "@/components/blog/HeroCarousel";
import { RankingStrip } from "@/components/blog/RankingStrip";
import { getPublishedPosts, getBlogRankings } from "@/lib/queries/blog";

export const metadata = {
  title: "Blog | Fechi Organics",
  description: "Tips, stories & natural living from the Fechi Organics team.",
};

export default async function BlogPage() {
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
