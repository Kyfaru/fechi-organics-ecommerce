"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileText, MoreHorizontal, Pencil, ExternalLink, MessageSquare, Archive, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

// ---------------------------------------------------------------------------
// 3-dot row menu (mirrors AdminProductsClient.tsx's CardMenu)
// ---------------------------------------------------------------------------
function RowMenu({
  post,
  onEdit,
  onArchive,
  onDelete,
}: {
  post: BlogPost;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100) transition-colors"
        aria-label="Post actions"
      >
        <MoreHorizontal size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 w-44 bg-white rounded-[10px] shadow-(--e3) border border-(--neutral-200) z-50 overflow-hidden py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              <Pencil size={14} /> Edit
            </button>
            <a
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              onClick={() => setOpen(false)}
            >
              <ExternalLink size={14} /> View on Store
            </a>
            <a
              href={`/admin/content/blog/comments?postId=${post.id}`}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              onClick={() => setOpen(false)}
            >
              <MessageSquare size={14} /> View Comments
            </a>
            {post.status !== "ARCHIVED" && (
              <button
                onClick={() => { setOpen(false); onArchive(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              >
                <Archive size={14} /> Archive
              </button>
            )}
            <div className="h-px bg-(--neutral-200) mx-2 my-1" />
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--danger) hover:bg-(--danger-bg) transition-colors"
            >
              <Trash2 size={14} /> Delete permanently
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
  publishedAt: string | null;
  author?: { name: string | null } | null;
}

const FILTERS = ["All", "DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"] as const;
type Filter = (typeof FILTERS)[number];

export function AdminBlogClient() {
  const qc = useQueryClient();
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("All");
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog"],
    queryFn: () => fetch("/api/admin/blog").then((r) => r.json()),
  });
  const posts: BlogPost[] = data?.data ?? [];

  const filtered = filter === "All" ? posts : posts.filter((p) => p.status === filter);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to delete post");
    },
    onSuccess: () => {
      toast.success("Post permanently deleted");
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/blog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to archive post");
    },
    onSuccess: () => {
      toast.success("Post archived");
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = [
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (v: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as BlogPost;
        return (
          <div className="flex items-center gap-2 max-w-[420px]">
            <div className="w-8 h-8 rounded-full bg-(--green-50) flex items-center justify-center shrink-0">
              <FileText size={14} className="text-(--green-800)" />
            </div>
            <div className="min-w-0">
              <div className="font-dm text-[14px] font-medium text-(--neutral-900) truncate">{String(v)}</div>
              <div className="font-dm text-[12px] text-(--neutral-400) truncate">/{p.slug}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (v: unknown) => <StatusPill status={String(v)} />,
    },
    {
      key: "publishedAt",
      label: "Published",
      render: (v: unknown) => (
        <span className="font-dm text-[14px] text-(--neutral-700)">
          {v ? new Date(String(v)).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "id",
      label: "Actions",
      render: (_: unknown, row: Record<string, unknown>) => {
        const p = row as unknown as BlogPost;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <RowMenu
              post={p}
              onEdit={() => router.push(`/admin/content/blog/${p.id}/edit`)}
              onArchive={() => archiveMutation.mutate(p.id)}
              onDelete={() => setDeleteTarget(p)}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <PageHeader
        breadcrumbs={[{ label: "Content", href: "/admin/content/blog" }, { label: "Blog", href: "/admin/content/blog" }]}
        title="Blog Posts"
        description="Write and manage articles for your storefront"
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/content/blog/comments"
              className="flex items-center gap-2 h-10 px-4 rounded-[8px] border border-(--neutral-200) text-(--neutral-700) font-dm text-[14px] font-medium hover:bg-(--neutral-50) transition-colors"
            >
              <MessageSquare size={16} />
              Comments
            </Link>
            <Link
              href="/admin/content/blog/new"
              className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
            >
              <Plus size={16} />
              New Post
            </Link>
          </div>
        }
      />

      <div className="px-6 pb-6">
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

        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="No posts yet"
          emptyDescription="Write your first blog post to get started."
          pageSize={20}
        />
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
        title="Delete Post Permanently"
        description={`This permanently deletes "${deleteTarget?.title}" and all its comments/reactions from the database. This cannot be undone — use Archive instead if you just want to unpublish it.`}
        confirmLabel="Delete Permanently"
        danger
      />
    </div>
  );
}
