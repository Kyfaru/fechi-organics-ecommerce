"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown } from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featuredImage: string | null;
  category: string | null;
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
  publishedAt: string | null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function BlogEditorClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id?: string }>();
  const postId = params?.id;
  const isEdit = Boolean(postId);

  const [postRef, setPostRef] = useState<string | null>(postId ?? null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    featuredImage: "",
    category: "",
    status: "DRAFT" as BlogPost["status"],
    publishedAt: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog", postId],
    queryFn: () => fetch(`/api/admin/blog/${postId}`).then((r) => r.json()),
    enabled: isEdit,
  });

  useEffect(() => {
    const p: BlogPost | undefined = data?.data;
    if (!p) return;
    setForm({
      title: p.title ?? "",
      slug: p.slug ?? "",
      excerpt: p.excerpt ?? "",
      content: p.content ?? "",
      featuredImage: p.featuredImage ?? "",
      category: p.category ?? "",
      status: p.status ?? "DRAFT",
      publishedAt: toDateTimeLocal(p.publishedAt),
    });
    setSlugTouched(true);
  }, [data]);

  function setTitle(title: string) {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  }

  function buildBody(overrideStatus?: BlogPost["status"]) {
    return {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      excerpt: form.excerpt || null,
      content: form.content || null,
      featuredImage: form.featuredImage || null,
      category: form.category || null,
      status: overrideStatus ?? form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
    };
  }

  const saveMutation = useMutation({
    mutationFn: async (overrideStatus?: BlogPost["status"]) => {
      const body = buildBody(overrideStatus);
      const ref = postRef;
      if (ref) {
        const res = await fetch(`/api/admin/blog/${ref}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error?.message ?? "Failed to save post");
        return { post: json.data as BlogPost, created: false };
      }
      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to create post");
      return { post: json.data as BlogPost, created: true };
    },
    onSuccess: ({ post, created }) => {
      toast.success(created ? "Post created" : "Post saved");
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
      if (created) {
        setPostRef(post.id);
        router.replace(`/admin/content/blog/${post.id}/edit`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isEdit && isLoading) {
    return (
      <div className="min-h-screen bg-(--neutral-50) p-6">
        <div className="h-8 w-48 bg-(--neutral-100) rounded animate-pulse mb-6" />
        <div className="h-[500px] w-full bg-(--neutral-100) rounded-[12px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-(--neutral-50)">
      <div className="sticky top-0 z-10 bg-white dark:bg-(--dark-surface) border-b border-(--neutral-200) dark:border-(--dark-border) px-6 py-4 flex items-center justify-between">
        <a
          href="/admin/content/blog"
          className="flex items-center gap-2 font-dm text-[14px] text-(--neutral-700) hover:text-(--neutral-900) transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Blog
        </a>
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveMutation.mutate("DRAFT")}
            disabled={saveMutation.isPending || !form.title.trim()}
            className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => saveMutation.mutate("PUBLISHED")}
            disabled={saveMutation.isPending || !form.title.trim()}
            className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving..." : "Publish"}
          </button>
        </div>
      </div>

      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 max-w-[1200px]">
        <div className="space-y-4">
          <FormField label="Title" required>
            <input
              value={form.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              className={inputCls}
            />
          </FormField>

          <FormField label="Slug" hint="auto-generated">
            <input
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
              placeholder="post-slug"
              className={inputCls}
            />
          </FormField>

          <FormField label="Excerpt">
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              rows={3}
              placeholder="Short summary..."
              className={`${inputCls} h-auto py-2 resize-none`}
            />
          </FormField>

          <FormField label="Cover Image URL">
            <input
              value={form.featuredImage}
              onChange={(e) => setForm((f) => ({ ...f, featuredImage: e.target.value }))}
              placeholder="https://..."
              className={inputCls}
            />
          </FormField>

          <FormField label="Category">
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Skincare"
              className={inputCls}
            />
          </FormField>

          <FormField label="Status">
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BlogPost["status"] }))}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
            </div>
          </FormField>

          <FormField label="Publish Date">
            <input
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
              className={inputCls}
            />
          </FormField>
        </div>

        <div>
          <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">Content</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Write your post content here..."
            className="w-full min-h-[560px] p-4 rounded-[12px] border border-(--neutral-200) bg-white font-dm text-[15px] leading-relaxed text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow resize-y"
          />
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
        {label} {required && <span className="text-(--danger)">*</span>}
        {hint && <span className="text-(--neutral-400) font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
