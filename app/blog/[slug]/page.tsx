import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getPostBySlug } from "@/lib/queries/blog";
import { db } from "@/lib/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) return { title: "Not Found" };

  return {
    title: post.seoTitle ?? post.title,
    description: post.metaDesc ?? post.excerpt ?? "",
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  // Fire-and-forget view increment — we do not block the render on this
  db.blogPost
    .update({ where: { slug }, data: { views: { increment: 1 } } })
    .catch(() => {});

  const formattedDate = post.publishedAt
    ? new Intl.DateTimeFormat("en-KE", { dateStyle: "long" }).format(
        new Date(post.publishedAt)
      )
    : "";

  return (
    <main>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-[#27731e] hover:underline mb-4"
        >
          ← Back to Blog
        </Link>

        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/blog" className="hover:underline">
            Blog
          </Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">{post.title}</span>
        </nav>

        {/* Category + date */}
        <div>
          {post.category && (
            <span className="text-xs font-semibold uppercase tracking-widest text-[#27731e]">
              {post.category}
            </span>
          )}
          <span className="text-xs text-gray-400 mx-2">•</span>
          <span className="text-xs text-gray-400">{formattedDate}</span>
        </div>

        {/* Title */}
        <h1 className="font-heading font-bold text-4xl text-[#1a1c1c] mt-3 mb-2 leading-tight">
          {post.title}
        </h1>

        {/* Author */}
        <p className="text-sm text-gray-500 mb-8">
          By {post.author.name ?? "Fechi Organics"}
        </p>

        {/* Hero image */}
        <div className="relative w-full h-80 rounded-2xl overflow-hidden mb-10">
          <Image
            src={post.featuredImage ?? "/blog/placeholder.webp"}
            alt={post.title}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>

        {/* Article body */}
        <article
          className="prose prose-green max-w-none"
          dangerouslySetInnerHTML={{
            __html: post.content ?? "<p>No content yet.</p>",
          }}
        />
      </div>
      <Footer />
    </main>
  );
}
