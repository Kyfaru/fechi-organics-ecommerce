import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BlogClient } from "@/components/blog/BlogClient";
import { getPublishedPosts } from "@/lib/queries/blog";

export const metadata = {
  title: "Blog | Fechi Organics",
  description: "Tips, stories & natural living from the Fechi Organics team.",
};

export default async function BlogPage() {
  const posts = await getPublishedPosts();

  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <BlogClient posts={posts} />
      <Footer />
    </main>
  );
}
