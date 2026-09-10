"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, X } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Avatar } from "@/components/admin/AdminStaffClient";

interface AdminComment {
  id: string;
  content: string;
  status: "VISIBLE" | "HIDDEN" | "FLAGGED";
  createdAt: string;
  postId: string;
  post: { title: string; slug: string };
  user: { name: string | null; email: string | null };
}

const FILTERS = ["All", "VISIBLE", "HIDDEN", "FLAGGED"] as const;
type Filter = (typeof FILTERS)[number];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Reddit/community-style comment card
// ---------------------------------------------------------------------------
function CommentCard({ comment, onSetStatus, pending }: {
  comment: AdminComment;
  onSetStatus: (status: AdminComment["status"]) => void;
  pending: boolean;
}) {
  const statusStyle =
    comment.status === "VISIBLE"
      ? "bg-(--green-50) text-(--green-800)"
      : comment.status === "HIDDEN"
      ? "bg-(--neutral-100) text-(--neutral-500)"
      : "bg-red-50 text-red-600";

  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) p-4 flex gap-3">
      <Avatar name={comment.user.name ?? comment.user.email ?? "?"} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
          <span className="font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
            {comment.user.name ?? comment.user.email ?? "Unknown"}
          </span>
          <span className="font-dm text-[12px] text-(--neutral-400)">{timeAgo(comment.createdAt)}</span>
          <span className={`font-dm text-[11px] px-2 py-0.5 rounded-full ${statusStyle}`}>{comment.status}</span>
        </div>
        <p className="font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text) mt-1.5 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2.5">
          <Link
            href={`/blog/${comment.post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-dm text-[12px] text-(--neutral-500) hover:text-(--green-800) hover:underline truncate max-w-[240px]"
          >
            on &ldquo;{comment.post.title}&rdquo;
          </Link>
          <div className="flex items-center gap-3">
            {comment.status !== "VISIBLE" && (
              <button
                disabled={pending}
                onClick={() => onSetStatus("VISIBLE")}
                className="font-dm text-[12px] font-medium text-(--green-800) hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            )}
            {comment.status !== "HIDDEN" && (
              <button
                disabled={pending}
                onClick={() => onSetStatus("HIDDEN")}
                className="font-dm text-[12px] font-medium text-(--neutral-500) hover:underline disabled:opacity-50"
              >
                Hide
              </button>
            )}
            {comment.status !== "FLAGGED" && (
              <button
                disabled={pending}
                onClick={() => onSetStatus("FLAGGED")}
                className="font-dm text-[12px] font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Flag
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminBlogCommentsClient() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const postIdFilter = searchParams.get("postId");

  const [filter, setFilter] = useState<Filter>("All");

  const queryKey = ["admin-blog-comments-all", postIdFilter];
  const { data, isLoading } = useQuery<{ comments: AdminComment[] }>({
    queryKey,
    queryFn: () =>
      fetch(`/api/admin/blog/comments${postIdFilter ? `?postId=${postIdFilter}` : ""}`)
        .then((r) => r.json())
        .then((j) => j.data),
  });

  const comments = data?.comments ?? [];
  const filtered = filter === "All" ? comments : comments.filter((c) => c.status === filter);
  const postTitle = comments[0]?.post.title;

  const statusMutation = useMutation({
    mutationFn: async ({ commentId, status }: { commentId: string; status: AdminComment["status"] }) => {
      const res = await fetch(`/api/admin/blog/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("FAILED");
      return { commentId, status };
    },
    onSuccess: ({ commentId, status }) => {
      qc.setQueryData<{ comments: AdminComment[] }>(queryKey, (old) => ({
        comments: (old?.comments ?? []).map((c) => (c.id === commentId ? { ...c, status } : c)),
      }));
    },
    onError: () => toast.error("Could not update comment status"),
  });

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        breadcrumbs={[{ label: "Content", href: "/admin/content/blog" }, { label: "Blog", href: "/admin/content/blog" }, { label: "Comments", href: "/admin/content/blog/comments" }]}
        title="Comments"
        description="Moderate comments left across every blog post"
      />

      <div className="px-6 pb-6 max-w-[820px]">
        {postIdFilter && postTitle && (
          <div className="mb-4 flex items-center gap-2 font-dm text-[13px] text-(--neutral-600)">
            Filtering by post: <span className="font-medium text-(--neutral-900) dark:text-(--dark-text)">{postTitle}</span>
            <Link href="/admin/content/blog/comments" className="inline-flex items-center gap-1 text-(--neutral-400) hover:text-(--neutral-700)">
              <X size={13} /> clear
            </Link>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-9 px-4 rounded-full font-dm text-[13px] font-medium transition-colors ${
                filter === f
                  ? "bg-(--green-800) text-white"
                  : "bg-white border border-(--neutral-200) text-(--neutral-700) hover:bg-(--neutral-50)"
              }`}
            >
              {f === "All" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 text-center font-dm text-[14px] text-(--neutral-400)">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border)">
            <MessageSquare size={28} className="mx-auto text-(--neutral-300) mb-2" />
            <p className="font-dm text-[14px] text-(--neutral-400)">No comments here yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                pending={statusMutation.isPending && statusMutation.variables?.commentId === c.id}
                onSetStatus={(status) => statusMutation.mutate({ commentId: c.id, status })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
