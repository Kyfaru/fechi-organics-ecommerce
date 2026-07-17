import Image from "next/image";
import Link from "next/link";
import { Star, TrendingUp, Eye } from "lucide-react";
import type { BlogRankingCard, BlogRankings } from "@/lib/queries/blog";
import { r2PublicUrl } from "@/lib/r2";

function coverImageUrl(key: string | null): string {
  return key ? r2PublicUrl(key) : "/blog/placeholder.webp";
}

function Column({
  title,
  icon,
  posts,
  metric,
}: {
  title: string;
  icon: React.ReactNode;
  posts: BlogRankingCard[];
  metric: (p: BlogRankingCard) => string;
}) {
  if (posts.length === 0) return null;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-heading font-semibold text-[#1a1c1c]">{title}</h3>
      </div>
      <div className="flex md:flex-col gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-1 px-1">
        {posts.map((p) => (
          <Link
            key={p.id}
            href={`/blog/${p.slug}`}
            className="flex items-center gap-3 shrink-0 w-64 md:w-full group"
          >
            <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
              <Image src={coverImageUrl(p.featuredImage)} alt={p.title} fill className="object-cover" sizes="56px" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1a1c1c] leading-snug line-clamp-2 group-hover:text-[#27731e] transition-colors">
                {p.title}
              </p>
              <p className="text-xs text-[#40493c]/60 mt-0.5">{metric(p)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function RankingStrip({ rankings }: { rankings: BlogRankings }) {
  const { favourites, trending, mostViewed } = rankings;
  if (favourites.length === 0 && trending.length === 0 && mostViewed.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row gap-10 md:gap-8">
        <Column
          title="Favourites"
          icon={<Star size={18} className="text-[#fec700]" fill="#fec700" />}
          posts={favourites}
          metric={(p) => `${p.likeCount} likes`}
        />
        <Column
          title="Trending"
          icon={<TrendingUp size={18} className="text-[#27731e]" />}
          posts={trending}
          metric={() => "Hot this week"}
        />
        <Column
          title="Most Viewed"
          icon={<Eye size={18} className="text-[#40493c]" />}
          posts={mostViewed}
          metric={(p) => `${p.views.toLocaleString()} views`}
        />
      </div>
    </section>
  );
}
