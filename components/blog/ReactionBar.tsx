"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp, ThumbsDown, MessageCircle, Share2, Eye } from "lucide-react";
import { toast } from "@/lib/toast";

type ReactionType = "LIKE" | "DISLIKE";

type ReactionState = {
  likeCount: number;
  dislikeCount: number;
  userReaction: ReactionType | null;
};

type Props = {
  slug: string;
  initialLikeCount: number;
  initialDislikeCount: number;
  initialCommentCount: number;
  initialViews: number;
  initialUserReaction: ReactionType | null;
  isLoggedIn: boolean;
};

export function commentCountQueryKey(slug: string) {
  return ["blog-comment-count", slug] as const;
}

export function ReactionBar({
  slug,
  initialLikeCount,
  initialDislikeCount,
  initialCommentCount,
  initialViews,
  initialUserReaction,
  isLoggedIn,
}: Props) {
  const qc = useQueryClient();
  const reactionKey = ["blog-reaction", slug] as const;
  const commentKey = commentCountQueryKey(slug);

  const initialReaction: ReactionState = {
    likeCount: initialLikeCount,
    dislikeCount: initialDislikeCount,
    userReaction: initialUserReaction,
  };

  const { data: reaction } = useQuery<ReactionState>({
    queryKey: reactionKey,
    queryFn: () => Promise.resolve(initialReaction),
    initialData: initialReaction,
    staleTime: Infinity,
  });

  const { data: commentCount } = useQuery<number>({
    queryKey: commentKey,
    queryFn: () => Promise.resolve(initialCommentCount),
    initialData: initialCommentCount,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (type: ReactionType) => {
      const res = await fetch(`/api/blog/posts/${slug}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.status === 401) throw new Error("AUTH_REQUIRED");
      if (!res.ok) throw new Error("FAILED");
      return res.json();
    },
    onMutate: async (type) => {
      await qc.cancelQueries({ queryKey: reactionKey });
      const prev = qc.getQueryData<ReactionState>(reactionKey);
      qc.setQueryData<ReactionState>(reactionKey, (old) => {
        if (!old) return old;
        const wasSame = old.userReaction === type;
        const wasOpposite = old.userReaction !== null && !wasSame;
        return {
          userReaction: wasSame ? null : type,
          likeCount:
            old.likeCount +
            (type === "LIKE" ? (wasSame ? -1 : 1) : 0) -
            (wasOpposite && old.userReaction === "LIKE" ? 1 : 0),
          dislikeCount:
            old.dislikeCount +
            (type === "DISLIKE" ? (wasSame ? -1 : 1) : 0) -
            (wasOpposite && old.userReaction === "DISLIKE" ? 1 : 0),
        };
      });
      return { prev };
    },
    onError: (err, _type, ctx) => {
      if (ctx?.prev) qc.setQueryData(reactionKey, ctx.prev);
      toast.error((err as Error).message === "AUTH_REQUIRED" ? "Sign in to react to posts" : "Could not update reaction");
    },
    onSuccess: (json) => {
      const d = json?.data;
      if (d) qc.setQueryData(reactionKey, { likeCount: d.likeCount, dislikeCount: d.dislikeCount, userReaction: d.userReaction });
    },
  });

  function handleReact(type: ReactionType) {
    if (!isLoggedIn) {
      toast.error("Sign in to react to posts");
      return;
    }
    mutation.mutate(type);
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title: document.title });
      } catch {
        // user cancelled the share sheet — no-op
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5 py-4 border-y border-gray-100">
      <button
        onClick={() => handleReact("LIKE")}
        disabled={mutation.isPending}
        className={[
          "inline-flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50",
          reaction.userReaction === "LIKE" ? "text-[#27731e]" : "text-[#40493c] hover:text-[#27731e]",
        ].join(" ")}
        aria-pressed={reaction.userReaction === "LIKE"}
      >
        <ThumbsUp size={16} fill={reaction.userReaction === "LIKE" ? "currentColor" : "none"} />
        {reaction.likeCount}
      </button>

      <button
        onClick={() => handleReact("DISLIKE")}
        disabled={mutation.isPending}
        className={[
          "inline-flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50",
          reaction.userReaction === "DISLIKE" ? "text-red-600" : "text-[#40493c] hover:text-red-600",
        ].join(" ")}
        aria-pressed={reaction.userReaction === "DISLIKE"}
      >
        <ThumbsDown size={16} fill={reaction.userReaction === "DISLIKE" ? "currentColor" : "none"} />
        {reaction.dislikeCount}
      </button>

      <span className="inline-flex items-center gap-1.5 text-sm text-[#40493c]">
        <MessageCircle size={16} /> {commentCount} comments
      </span>

      <button
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#40493c] hover:text-[#27731e] transition-colors"
      >
        <Share2 size={16} /> Share
      </button>

      <span className="inline-flex items-center gap-1.5 text-sm text-[#40493c]/60 ml-auto">
        <Eye size={16} /> {initialViews.toLocaleString()} views
      </span>
    </div>
  );
}
