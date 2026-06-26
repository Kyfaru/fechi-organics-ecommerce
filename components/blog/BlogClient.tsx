"use client";

import { useState, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Search, BookOpen } from "lucide-react";
import type { BlogPostCard } from "@/lib/queries/blog";

/* ─── tiny animation helpers (copied verbatim from AboutClient.tsx) ─── */
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 48 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ScaleIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.88 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── date formatting helper ─────────────────────────────────────────── */
function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(d));
}

/* ─── design tokens (hex)
   #27731e  — green 800  — primary brand green
   #e8fce3  — green 50   — light tint
   #045a03  — green 900  — dark green / hover
   #1a1c1c  — neutral dark
   #40493c  — neutral mid
   #fec700  — yellow accent
─────────────────────────────────────────────────────────────────────── */

interface BlogClientProps {
  posts: BlogPostCard[];
}

export function BlogClient({ posts }: BlogClientProps) {
  /* ── state ── */
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  /* ── derived: unique category list ── */
  const categories = useMemo<string[]>(
    () => ["All", ...Array.from(new Set(posts.map((p) => p.category).filter(Boolean) as string[]))],
    [posts],
  );

  /* ── derived: filtered posts ── */
  const filteredPosts = useMemo<BlogPostCard[]>(() => {
    const q = search.toLowerCase();
    return posts.filter((p) => {
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.excerpt ?? "").toLowerCase().includes(q);
      const matchesCategory =
        activeCategory === "All" || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [posts, search, activeCategory]);

  const featuredPost = filteredPosts[0] ?? null;
  const gridPosts = filteredPosts.slice(1);

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="overflow-x-hidden">

      {/* ── 1. HERO ───────────────────────────────────────────────────── */}
      <section className="relative bg-[#27731e] py-24 md:py-32 flex flex-col items-center justify-center overflow-hidden">

        {/* animated blob backgrounds */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 8, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-28 -left-28 w-[520px] h-[520px] rounded-full bg-[#1f5a17] opacity-40"
          />
          <motion.div
            animate={{ scale: [1, 1.14, 1], rotate: [0, -10, 0] }}
            transition={{ duration: 24, repeat: Infinity, ease: "easeInOut", delay: 3 }}
            className="absolute -bottom-36 -right-36 w-[620px] h-[620px] rounded-full bg-[#045a03] opacity-50"
          />
          <motion.div
            animate={{ y: [0, -24, 0], x: [0, 12, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute top-1/3 right-[8%] w-[200px] h-[200px] rounded-full bg-[#a4f690] opacity-10"
          />
        </div>

        {/* hero content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl w-full">
          {/* heading */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl md:text-6xl font-bold font-heading text-white leading-tight mb-4"
          >
            The Fechi Journal
          </motion.h1>

          {/* subheading */}
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-white/70 text-lg md:text-xl mb-10"
          >
            Tips, stories &amp; natural living from our team
          </motion.p>

          {/* search input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="relative w-full max-w-md mb-8"
          >
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#40493c] pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-5 py-3.5 rounded-full bg-white text-[#1a1c1c] placeholder:text-[#40493c]/60 text-sm focus:outline-none focus:ring-2 focus:ring-[#fec700] shadow-sm"
              aria-label="Search blog articles"
            />
          </motion.div>

          {/* category pills */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-wrap gap-2 justify-center"
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "px-5 py-2 rounded-full text-sm font-semibold transition-all",
                  activeCategory === cat
                    ? "bg-[#fec700] text-[#1a1c1c]"
                    : "bg-white/20 text-white hover:bg-white/30",
                ].join(" ")}
              >
                {cat}
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── EMPTY STATE ───────────────────────────────────────────────── */}
      {filteredPosts.length === 0 && (
        <div className="text-center py-24 px-4">
          <div className="w-20 h-20 rounded-full bg-[#e8fce3] flex items-center justify-center mx-auto mb-6">
            <BookOpen size={32} color="#27731e" aria-hidden />
          </div>
          <h3 className="font-heading font-semibold text-xl text-[#1a1c1c] mb-2">
            No articles yet
          </h3>
          <p className="text-[#40493c] text-sm">
            Check back soon — our team is writing for you.
          </p>
          {(search || activeCategory !== "All") ? (
            <button
              onClick={() => { setSearch(""); setActiveCategory("All"); }}
              className="mt-6 text-sm text-[#27731e] hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}

      {/* ── 2. FEATURED POST ──────────────────────────────────────────── */}
      {featuredPost && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <FadeUp>
            <div className="grid md:grid-cols-2 gap-8 items-center">

              {/* left: image */}
              <div className="relative h-72 md:h-96 rounded-2xl overflow-hidden">
                <Image
                  src={featuredPost.featuredImage ?? "/blog/placeholder.webp"}
                  alt={featuredPost.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              </div>

              {/* right: content */}
              <div className="flex flex-col gap-4">
                {/* category badge */}
                {featuredPost.category && (
                  <span className="inline-block self-start bg-[#e8fce3] text-[#27731e] text-xs font-semibold px-3 py-1 rounded-full">
                    {featuredPost.category}
                  </span>
                )}

                {/* title */}
                <h2 className="text-2xl md:text-3xl font-bold font-heading text-[#1a1c1c] leading-snug">
                  {featuredPost.title}
                </h2>

                {/* excerpt */}
                {featuredPost.excerpt && (
                  <p className="text-[#40493c] line-clamp-2 text-base leading-relaxed">
                    {featuredPost.excerpt}
                  </p>
                )}

                {/* meta */}
                <p className="text-sm text-[#40493c]/70">
                  By {featuredPost.author?.name ?? "Fechi Organics"}
                  {featuredPost.publishedAt
                    ? ` · ${formatDate(featuredPost.publishedAt)}`
                    : ""}
                </p>

                {/* CTA */}
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="self-start bg-[#27731e] text-white rounded-full px-6 py-3 text-sm font-semibold hover:bg-[#045a03] transition-colors"
                >
                  Read Article →
                </Link>
              </div>
            </div>
          </FadeUp>
        </section>
      )}

      {/* ── 3. ALL POSTS GRID ─────────────────────────────────────────── */}
      {gridPosts.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <FadeUp>
            <h2 className="text-2xl font-bold font-heading text-[#1a1c1c]">
              More Articles
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {gridPosts.map((post, index) => (
              <ScaleIn key={post.slug} delay={index * 0.06}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="block bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-[#27731e]/30 transition-all group"
                >
                  {/* card image */}
                  <div className="relative h-48 overflow-hidden">
                    <Image
                      src={post.featuredImage ?? "/blog/placeholder.webp"}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>

                  {/* card body */}
                  <div className="p-5 flex flex-col gap-2">
                    {/* category badge */}
                    {post.category && (
                      <span className="self-start bg-[#e8fce3] text-[#27731e] text-xs font-semibold px-3 py-1 rounded-full">
                        {post.category}
                      </span>
                    )}

                    {/* title */}
                    <h3 className="text-base font-bold font-heading text-[#1a1c1c] mt-1 group-hover:text-[#27731e] transition-colors leading-snug">
                      {post.title}
                    </h3>

                    {/* excerpt */}
                    {post.excerpt && (
                      <p className="text-sm text-[#40493c] line-clamp-3 leading-relaxed">
                        {post.excerpt}
                      </p>
                    )}

                    {/* meta footer */}
                    <p className="text-xs text-[#40493c]/60 mt-1">
                      {post.author?.name ?? "Fechi Organics"}
                      {post.publishedAt ? ` · ${formatDate(post.publishedAt)}` : ""}
                    </p>
                  </div>
                </Link>
              </ScaleIn>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
