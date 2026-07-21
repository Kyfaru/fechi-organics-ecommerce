import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ReactionBar } from "@/components/blog/ReactionBar";
import { CommentSection } from "@/components/blog/CommentSection";
import { getPostBySlug } from "@/lib/queries/blog";
import { recordBlogView } from "@/lib/blog-views";
import { r2PublicUrl } from "@/lib/r2";
import { auth } from "@/lib/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) return { title: "Not Found" };

  const title = post.seoTitle ?? post.title;
  const description = post.metaDesc ?? post.excerpt ?? "";
  const imageUrl = post.featuredImage ? r2PublicUrl(post.featuredImage) : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      authors: post.author.name ? [post.author.name] : undefined,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const post = await getPostBySlug(slug, session?.user?.id);

  if (!post) notFound();

  // Fire-and-forget, de-duplicated view record — does not block render
  void recordBlogView(post.id);

  const formattedDate = post.publishedAt
    ? new Intl.DateTimeFormat("en-KE", { dateStyle: "long" }).format(
        new Date(post.publishedAt)
      )
    : "";

  const imageUrl = post.featuredImage ? r2PublicUrl(post.featuredImage) : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDesc ?? post.excerpt ?? undefined,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: post.publishedAt?.toISOString(),
    author: { "@type": "Person", name: post.author.name ?? "Fechi Organics" },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
            src={imageUrl ?? "/blog/placeholder.webp"}
            alt={post.title}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>

        <ReactionBar
          slug={post.slug}
          initialLikeCount={post.likeCount}
          initialDislikeCount={post.dislikeCount}
          initialCommentCount={post.commentCount}
          initialViews={post.views}
          initialUserReaction={post.userReaction}
          isLoggedIn={!!session?.user?.id}
        />

        {/* Article body */}
        <article
          className="prose prose-green max-w-none my-10"
          dangerouslySetInnerHTML={{
            __html: post.content ?? "<p>No content yet.</p>",
          }}
        />

        <ReactionBar
          slug={post.slug}
          initialLikeCount={post.likeCount}
          initialDislikeCount={post.dislikeCount}
          initialCommentCount={post.commentCount}
          initialViews={post.views}
          initialUserReaction={post.userReaction}
          isLoggedIn={!!session?.user?.id}
        />

        <CommentSection slug={post.slug} />
      </div>
      <Footer />
    </main>
  );
}
