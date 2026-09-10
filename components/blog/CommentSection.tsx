"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import { commentCountQueryKey } from "@/components/blog/ReactionBar";

type Comment = {
  id: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  userId: string;
  user: { name: string | null; image: string | null };
};

function formatDate(d: string): string {
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export function CommentSection({ slug }: { slug: string }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const commentsKey = ["blog-comments", slug] as const;

  const { data, isLoading } = useQuery<{ comments: Comment[] }>({
    queryKey: commentsKey,
    queryFn: () => fetch(`/api/blog/posts/${slug}/comments`).then((r) => r.json()).then((j) => j.data),
  });

  const postMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/blog/posts/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.status === 401) throw new Error("AUTH_REQUIRED");
      if (!res.ok) throw new Error("FAILED");
      return res.json();
    },
    onSuccess: (json) => {
      const comment = json?.data?.comment as Comment | undefined;
      if (comment) {
        qc.setQueryData<{ comments: Comment[] }>(commentsKey, (old) => ({
          comments: [comment, ...(old?.comments ?? [])],
        }));
        qc.setQueryData<number>(commentCountQueryKey(slug), (n) => (n ?? 0) + 1);
      }
      setContent("");
    },
    onError: (err) => {
      toast.error((err as Error).message === "AUTH_REQUIRED" ? "Sign in to comment" : "Could not post comment");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/blog/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("FAILED");
      return commentId;
    },
    onSuccess: (commentId) => {
      qc.setQueryData<{ comments: Comment[] }>(commentsKey, (old) => ({
        comments: (old?.comments ?? []).filter((c) => c.id !== commentId),
      }));
      qc.setQueryData<number>(commentCountQueryKey(slug), (n) => Math.max(0, (n ?? 1) - 1));
    },
    onError: () => toast.error("Could not delete comment"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    if (!session?.user) {
      toast.error("Sign in to comment");
      return;
    }
    postMutation.mutate(trimmed);
  }

  const comments = data?.comments ?? [];

  return (
    <section className="py-10">
      <h2 className="font-heading font-bold text-xl text-[#1a1c1c] mb-6">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {session?.user ? (
        <form onSubmit={handleSubmit} className="mb-8">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            maxLength={2000}
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-[#1a1c1c] focus:outline-none focus:ring-2 focus:ring-[#27731e]/40 resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={postMutation.isPending || !content.trim()}
              className="bg-[#27731e] text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-[#045a03] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {postMutation.isPending ? "Posting…" : "Post Comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-8 text-sm text-[#40493c] bg-[#e8fce3] rounded-xl px-4 py-3">
          Sign in to join the conversation.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-[#40493c]/60">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-[#40493c]/60">Be the first to comment.</p>
      ) : (
        <ul className="space-y-6">
          {comments.map((c) => {
            const canDelete = session?.user?.id === c.userId;
            return (
              <li key={c.id} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-[#e8fce3] text-[#27731e] flex items-center justify-center text-sm font-semibold shrink-0">
                  {(c.user.name ?? "F").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1a1c1c]">{c.user.name ?? "Fechi Organics"}</span>
                    <span className="text-xs text-[#40493c]/50">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#40493c] mt-1 whitespace-pre-wrap break-words">{c.content}</p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => deleteMutation.mutate(c.id)}
                    disabled={deleteMutation.isPending}
                    aria-label="Delete comment"
                    className="text-[#40493c]/40 hover:text-red-600 transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
