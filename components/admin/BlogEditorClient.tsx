"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar, ChevronDown, ImageIcon, Upload, X } from "lucide-react";
import RichTextEditor from "@/components/admin/ui/RichTextEditor";
import ScheduleModal from "@/components/admin/blog/ScheduleModal";
import AuthorPicker, { type AuthorOption } from "@/components/admin/blog/AuthorPicker";
import { useSession } from "@/lib/auth-client";
import { canAccess } from "@/lib/permissions";
import { r2PublicUrl } from "@/lib/r2";

function blogImageUrl(key: string): string {
  return key ? r2PublicUrl(key) : "";
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featuredImage: string | null;
  category: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
  publishedAt: string | null;
  author?: { name: string | null; email: string | null } | null;
  authorIds: string[];
}

// Raw shape returned by GET /api/admin/staff — trimmed to the fields
// AuthorPicker needs (see components/admin/blog/AuthorPicker.tsx).
interface StaffListItem {
  id: string;
  name: string;
  email: string;
  banned: boolean;
  adminProfile: {
    role: string;
    permissions: Record<string, unknown>;
    isSuperAdmin: boolean;
    isActive: boolean;
  } | null;
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
  const { data: session } = useSession();

  const [postRef, setPostRef] = useState<string | null>(postId ?? null);
  // Create mode defaults the picker to "you" (matching the old read-only
  // card's behavior) exactly once, as soon as the session loads — a ref
  // (rather than re-running on every session change) so it doesn't clobber
  // a selection the admin has since edited.
  const defaultAuthorSet = useRef(false);
  // Edit mode starts "touched" so the loaded slug is never silently
  // clobbered by the title-derived slugify() once data arrives — avoids
  // calling setSlugTouched(true) synchronously inside the load effect below.
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const imageRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Bumped every time the Schedule button is clicked, so ScheduleModal is
  // rendered with a fresh `key` each time it opens — see the note in
  // ScheduleModal.tsx for why this replaces an open-triggered reset effect.
  const [scheduleKey, setScheduleKey] = useState(0);

  // Uploads a cover image file to R2 via the shared admin upload endpoint.
  // Shared by both the file-picker input and the dropzone's drag/drop handler.
  async function uploadCoverImage(file: File) {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "blog");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setForm((f) => ({ ...f, featuredImage: json.objectKey }));
      toast.success("Cover image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  function handleFeaturedImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadCoverImage(file);
  }

  function handleCoverDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingCover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadCoverImage(file);
  }

  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    featuredImage: "",
    category: "",
    tags: [] as string[],
    authorIds: [] as string[],
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
      tags: p.tags ?? [],
      authorIds: p.authorIds ?? [],
      status: p.status ?? "DRAFT",
      publishedAt: toDateTimeLocal(p.publishedAt),
    });
  }, [data]);

  // Create mode only: seed the picker with the logged-in admin once their
  // session resolves, so a brand-new post still defaults to "authored by you"
  // the way the old read-only card did.
  useEffect(() => {
    if (isEdit || defaultAuthorSet.current || !session?.user?.id) return;
    defaultAuthorSet.current = true;
    setForm((f) => ({ ...f, authorIds: [session.user.id] }));
  }, [isEdit, session?.user?.id]);

  // Staff eligible to be picked as a blog author: active, non-banned admins
  // with access to the Content page (blog lives under "content" in
  // lib/permissions.ts) — super-admins always qualify.
  const { data: staffData } = useQuery({
    queryKey: ["admin-staff-authors"],
    queryFn: () => fetch("/api/admin/staff").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const authorOptions: AuthorOption[] = ((staffData?.data?.staff ?? []) as StaffListItem[])
    .filter((s) => !s.banned && (s.adminProfile?.isSuperAdmin || canAccess(s.adminProfile?.permissions ?? {}, "content")))
    .map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      adminProfile: s.adminProfile ? { role: s.adminProfile.role } : null,
    }));

  function setTitle(title: string) {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  }

  // overridePublishedAt lets a caller (the Schedule modal) supply a datetime
  // that hasn't been typed into the sidebar "Date" field — it wins over
  // form.publishedAt when present.
  function buildBody(overrideStatus?: BlogPost["status"], overridePublishedAt?: string) {
    return {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      excerpt: form.excerpt || null,
      content: form.content || null,
      featuredImage: form.featuredImage || null,
      category: form.category || null,
      tags: form.tags,
      authorIds: form.authorIds,
      status: overrideStatus ?? form.status,
      publishedAt: overridePublishedAt ?? (form.publishedAt ? new Date(form.publishedAt).toISOString() : null),
    };
  }

  const saveMutation = useMutation({
    mutationFn: async (overrides?: { status?: BlogPost["status"]; publishedAt?: string }) => {
      const body = buildBody(overrides?.status, overrides?.publishedAt);
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

  // Schedule flow: persist status: SCHEDULED + the chosen datetime through the
  // normal save mutation first (so the post row and its ID exist/are current),
  // then hand that exact datetime to the publish route, which enqueues the
  // Qstash job that flips the post live at that time.
  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: Date) => {
      const { post } = await saveMutation.mutateAsync({
        status: "SCHEDULED",
        publishedAt: scheduledAt.toISOString(),
      });
      const res = await fetch(`/api/admin/blog/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "schedule", scheduledAt: scheduledAt.toISOString() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to schedule post");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Post scheduled");
      setScheduleOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Primary action button adapts to the selected Status field: while a post
  // is a draft it reads/behaves as "Save Draft"; once Status is switched to
  // Published it reads/behaves as "Publish". This keeps a single button in
  // the top bar (matching the mockup's Cancel / Publish pair) while
  // preserving the original draft-vs-publish save paths untouched.
  const isDraftStatus = form.status === "DRAFT";
  const canSave = !saveMutation.isPending && Boolean(form.title.trim());

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
      {/* Top bar — back link on the left; Cancel / Schedule / Publish on the right. */}
      <div className="sticky top-0 z-10 bg-white dark:bg-(--dark-surface) border-b border-(--neutral-200) dark:border-(--dark-border) px-6 py-4 flex items-center justify-between">
        <a
          href="/admin/content/blog"
          className="flex items-center gap-2 font-dm text-[14px] text-(--neutral-700) hover:text-(--neutral-900) transition-colors"
        >
          <ArrowLeft size={16} />
          {isEdit ? "Edit Post" : "New Post"}
        </a>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/content/blog")}
            className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { setScheduleKey((k) => k + 1); setScheduleOpen(true); }}
            disabled={!canSave}
            className="h-10 px-5 rounded-[8px] border border-(--gold-700) text-(--gold-700) font-dm text-[14px] font-medium hover:bg-(--gold-50) transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Calendar size={14} />
            Schedule
          </button>
          <button
            onClick={() => saveMutation.mutate(undefined)}
            disabled={!canSave}
            className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : isDraftStatus ? "Save Draft" : "Publish"}
          </button>
        </div>
      </div>

      <ScheduleModal
        key={scheduleKey}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onConfirm={(scheduledAt) => scheduleMutation.mutate(scheduledAt)}
        loading={scheduleMutation.isPending}
      />

      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-[1280px]">
        {/* Left column — Title + rich content */}
        <div className="space-y-4 min-w-0">
          <FormField label="Title" required>
            <input
              value={form.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name your blog post"
              className={`${inputCls} h-12 text-[16px] font-medium`}
            />
          </FormField>

          <div>
            <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">
              Content <span className="text-(--neutral-400) font-normal">(write your blog post)</span>
            </label>
            <RichTextEditor
              value={form.content}
              onChange={(content) => setForm((f) => ({ ...f, content }))}
              placeholder="Write your post content here..."
              heightClassName="h-[560px]"
            />
          </div>
        </div>

        {/* Right column — metadata */}
        <div className="space-y-4">
          <FormField label="Slug" hint="auto-generated">
            <input
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
              placeholder="post-slug"
              className={inputCls}
            />
          </FormField>

          <FormField label="Excerpt" hint="short summary">
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              rows={3}
              placeholder="Short summary..."
              className={`${inputCls} h-auto py-2 resize-none`}
            />
          </FormField>

          <FormField label="Category" hint="used to filter posts on the public blog">
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Skincare"
              className={inputCls}
            />
          </FormField>

          <FormField label="Tags">
            <ChipInput
              values={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
              placeholder="Add a tag and press Enter"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
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

            <FormField label="Date" hint="shown on the post">
              <input
                type="datetime-local"
                value={form.publishedAt}
                onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
                className={inputCls}
              />
            </FormField>
          </div>

          <FormField label="Cover Image">
            <input
              ref={imageRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFeaturedImageUpload}
            />
            {form.featuredImage ? (
              <div className="relative rounded-[10px] border border-(--neutral-200) overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blogImageUrl(form.featuredImage)} alt="Cover preview" className="w-full h-32 object-cover" />
                <button
                  type="button"
                  onClick={() => imageRef.current?.click()}
                  disabled={uploadingImage}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all font-dm text-[13px] font-medium text-white"
                >
                  {uploadingImage ? "Uploading…" : "Replace image"}
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingCover(true); }}
                onDragLeave={() => setIsDraggingCover(false)}
                onDrop={handleCoverDrop}
                onClick={() => imageRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 w-full h-32 rounded-[10px] border-2 border-dashed cursor-pointer transition-colors ${
                  isDraggingCover ? "border-(--green-600) bg-(--green-50)" : "border-(--neutral-200) hover:border-(--green-600)"
                }`}
              >
                <ImageIcon size={20} className="text-(--neutral-400)" />
                <p className="font-dm text-[12px] text-(--neutral-500) text-center px-4">
                  {uploadingImage ? (
                    "Uploading…"
                  ) : (
                    <>
                      Drag and drop, or{" "}
                      <span className="text-(--green-700) font-medium inline-flex items-center gap-1">
                        <Upload size={12} /> Upload Image
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
            <input
              value={form.featuredImage}
              onChange={(e) => setForm((f) => ({ ...f, featuredImage: e.target.value }))}
              placeholder="or paste a key / URL"
              className={`${inputCls} mt-2 h-9 text-[13px]`}
            />
          </FormField>

          <FormField label="Authors" hint="who gets credit on the post">
            <AuthorPicker
              authors={authorOptions}
              value={form.authorIds}
              onChange={(authorIds) => setForm((f) => ({ ...f, authorIds }))}
              placeholder="Select authors…"
            />
          </FormField>

          {isEdit && postId && <CommentModerationPanel postId={postId} />}
        </div>
      </div>
    </div>
  );
}

interface AdminComment {
  id: string;
  content: string;
  status: "VISIBLE" | "HIDDEN" | "FLAGGED";
  createdAt: string;
  user: { name: string | null; email: string | null };
}

function CommentModerationPanel({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const queryKey = ["admin-blog-comments", postId];

  const { data, isLoading } = useQuery<{ comments: AdminComment[] }>({
    queryKey,
    queryFn: () => fetch(`/api/admin/blog/${postId}/comments`).then((r) => r.json()).then((j) => j.data),
  });

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

  const comments = data?.comments ?? [];

  return (
    <FormField label="Comments" hint={`${comments.length} total`}>
      {isLoading ? (
        <p className="text-[13px] text-(--neutral-400)">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-[13px] text-(--neutral-400)">No comments yet.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="border border-(--neutral-200) rounded-[10px] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-dm text-[12px] font-medium text-(--neutral-700) truncate">
                  {c.user.name ?? c.user.email ?? "Unknown"}
                </span>
                <span
                  className={`font-dm text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                    c.status === "VISIBLE"
                      ? "bg-(--green-50) text-(--green-800)"
                      : c.status === "HIDDEN"
                      ? "bg-(--neutral-100) text-(--neutral-500)"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="font-dm text-[13px] text-(--neutral-600) mt-1 line-clamp-3">{c.content}</p>
              <div className="flex gap-2 mt-2">
                {c.status !== "VISIBLE" && (
                  <button
                    onClick={() => statusMutation.mutate({ commentId: c.id, status: "VISIBLE" })}
                    className="font-dm text-[12px] text-(--green-800) hover:underline"
                  >
                    Restore
                  </button>
                )}
                {c.status !== "HIDDEN" && (
                  <button
                    onClick={() => statusMutation.mutate({ commentId: c.id, status: "HIDDEN" })}
                    className="font-dm text-[12px] text-(--neutral-500) hover:underline"
                  >
                    Hide
                  </button>
                )}
                {c.status !== "FLAGGED" && (
                  <button
                    onClick={() => statusMutation.mutate({ commentId: c.id, status: "FLAGGED" })}
                    className="font-dm text-[12px] text-red-600 hover:underline"
                  >
                    Flag
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </FormField>
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

// Free-text chip input bound to a string[] value. Enter (or comma) commits
// the current draft as a chip; Backspace on an empty draft pops the last
// chip; the × button removes a specific chip.
function ChipInput({ values, onChange, placeholder }: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
  }

  function removeChip(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center w-full min-h-10 px-2.5 py-1.5 rounded-[8px] border border-(--neutral-200) bg-white focus-within:ring-2 focus-within:ring-(--green-500) focus-within:border-transparent transition-shadow">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1.5 rounded-full bg-(--green-50) text-(--green-800) font-dm text-[12px] font-medium"
        >
          {v}
          <button
            type="button"
            onClick={() => removeChip(v)}
            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-(--green-200) transition-colors"
            aria-label={`Remove ${v}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Backspace" && !draft && values.length) {
            removeChip(values[values.length - 1]);
          }
        }}
        onBlur={commitDraft}
        placeholder={values.length ? "" : placeholder}
        className="flex-1 min-w-[100px] h-6 font-dm text-[13px] text-(--neutral-900) placeholder:text-(--neutral-400) outline-none bg-transparent"
      />
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";
