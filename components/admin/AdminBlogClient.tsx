"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { ConfirmModal } from "@/components/admin/ui/ConfirmModal";

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
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to archive post");
    },
    onSuccess: () => {
      toast.success("Post archived");
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
      setDeleteTarget(null);
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
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/content/blog/${p.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="h-8 px-3 flex items-center rounded-[6px] font-dm text-[13px] bg-(--neutral-100) hover:bg-(--neutral-200) text-(--neutral-700) transition-colors"
            >
              Edit
            </Link>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
              className="h-8 px-3 rounded-[6px] font-dm text-[13px] bg-(--danger-bg) hover:bg-red-100 text-(--danger) transition-colors"
            >
              Archive
            </button>
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
          <Link
            href="/admin/content/blog/new"
            className="flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
          >
            <Plus size={16} />
            New Post
          </Link>
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
        title="Archive Post"
        description={`This will archive "${deleteTarget?.title}". It will no longer be visible on the storefront.`}
        confirmLabel="Archive"
        danger
      />
    </div>
  );
}
