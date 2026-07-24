"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, TrendingUp, Eye, Heart, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { BlogRankingCard, BlogRankings } from "@/lib/queries/blog";
import { r2PublicUrl } from "@/lib/r2";

function coverImageUrl(key: string | null): string {
  return key ? r2PublicUrl(key) : "/blog/placeholder.webp";
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(d));
}

function BlogPhotoCard({ post }: { post: BlogRankingCard }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="relative flex-shrink-0 w-[300px] md:w-[380px] h-[240px] md:h-[280px] snap-start rounded-[24px] overflow-hidden group"
    >
      <Image
        src={coverImageUrl(post.featuredImage)}
        alt={post.title}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="380px"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col gap-2">
        <h3 className="text-white font-heading font-semibold text-xl md:text-2xl leading-snug line-clamp-2">
          {post.title}
        </h3>
        <div className="flex items-center gap-3 text-white/80 text-sm">
          <span>{formatDate(post.publishedAt)}</span>
          <span className="inline-flex items-center gap-1">
            <Eye size={14} /> {post.views.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart size={14} /> {post.likeCount.toLocaleString()}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ScrollerRow({
  title,
  icon,
  posts,
  openToRight = false,
}: {
  title: string;
  icon: React.ReactNode;
  posts: BlogRankingCard[];
  openToRight?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [atStart, setAtStart] = useState(!openToRight);
  const [atEnd, setAtEnd] = useState(openToRight);

  // 20px tolerance — the snap-aligned scroller can rest a few px off exact
  // 0/max (e.g. scroll-padding from the row's own edge padding), which would
  // otherwise leave an arrow visible at what's practically the start/end.
  const EDGE_TOLERANCE = 20;

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= EDGE_TOLERANCE);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_TOLERANCE);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (openToRight) el.scrollLeft = el.scrollWidth;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [openToRight, updateEdges]);

  function scrollByDir(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

  if (posts.length === 0) return null;

  return (
    <div className="py-6">
      <div className="flex items-center gap-2 mb-4 max-w-7xl mx-auto px-2.5">
        {icon}
        <h3 className="font-heading font-semibold text-xl md:text-2xl text-[#1a1c1c]">{title}</h3>
      </div>
      <div
        className="relative max-w-7xl mx-auto"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          ref={scrollerRef}
          className="flex overflow-x-auto gap-5 pb-2 px-2.5 snap-x snap-proximity [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {posts.map((post) => (
            <BlogPhotoCard key={post.id} post={post} />
          ))}
          <div className="flex-shrink-0 flex items-center justify-center pl-1">
            <a
              href="#blog-search"
              aria-label={`See more — ${title}`}
              className="w-14 h-14 rounded-full bg-[#27731e] hover:bg-[#1f5f18] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(39,115,30,0.35)] transition-colors"
            >
              <ArrowRight size={22} />
            </a>
          </div>
        </div>

        {hovered && !atStart && (
          <button
            onClick={() => scrollByDir(-1)}
            aria-label={`Scroll ${title} left`}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.18)] flex items-center justify-center text-[#1a1c1c] hover:bg-[#fec700] transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {hovered && !atEnd && (
          <button
            onClick={() => scrollByDir(1)}
            aria-label={`Scroll ${title} right`}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.18)] flex items-center justify-center text-[#1a1c1c] hover:bg-[#fec700] transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

export function RankingStrip({ rankings }: { rankings: BlogRankings }) {
  const { latest, trending, mostViewed } = rankings;
  if (latest.length === 0 && trending.length === 0 && mostViewed.length === 0) return null;

  return (
    <section className="py-6">
      <ScrollerRow
        title="Latest Blogs"
        icon={<Clock size={18} className="text-[#27731e]" />}
        posts={latest}
      />
      <ScrollerRow
        title="Trending Blogs"
        icon={<TrendingUp size={18} className="text-[#fec700]" />}
        posts={trending}
        openToRight
      />
      <ScrollerRow
        title="Most Viewed"
        icon={<Eye size={18} className="text-[#40493c]" />}
        posts={mostViewed}
      />
    </section>
  );
}
