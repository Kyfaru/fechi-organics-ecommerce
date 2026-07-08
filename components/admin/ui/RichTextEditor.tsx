"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link as LinkIcon,
  ListOrdered,
  List,
  Quote,
  Code,
  ImagePlus,
} from "lucide-react";
import { toast } from "@/lib/toast";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Tailwind height class for the editable area. Defaults to the compact
   *  "h-40" used in drawer/modal contexts (e.g. AdminCampaignsClient); pass a
   *  taller value (e.g. "h-[560px]") for full-page editors like the blog post
   *  editor, where the content area should dominate the page. */
  heightClassName?: string;
};

const btnCls = (active: boolean) =>
  `size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:pointer-events-none ${
    active ? "bg-gray-100 dark:bg-neutral-700" : ""
  }`;

export default function RichTextEditor({ value, onChange, placeholder, heightClassName = "h-40" }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false, HTMLAttributes: { class: "rounded-lg max-w-full" } }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editable: true,
    immediatelyRender: false,
  });

  // Uploads the picked file to R2 via the shared admin upload endpoint (same
  // pattern as the cover-image upload in BlogEditorClient) and inserts the
  // resulting public URL as an <img> node at the current cursor position.
  async function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "blog");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Image upload failed");
      const src: string = json.publicUrl || json.objectKey;
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    } catch (err) {
      console.error("[RichTextEditor] Image upload failed:", err);
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  // Keep editor in sync when value is set externally (e.g. when editing an existing post).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Enter URL");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl overflow-hidden">
      <div className="sticky top-0 bg-white dark:bg-neutral-800 flex align-middle gap-x-0.5 border-b border-gray-200 dark:border-neutral-700 p-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBold().run();
          }}
          className={btnCls(!!editor?.isActive("bold"))}
        >
          <Bold className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleItalic().run();
          }}
          className={btnCls(!!editor?.isActive("italic"))}
        >
          <Italic className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleUnderline().run();
          }}
          className={btnCls(!!editor?.isActive("underline"))}
        >
          <UnderlineIcon className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleStrike().run();
          }}
          className={btnCls(!!editor?.isActive("strike"))}
        >
          <Strikethrough className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            toggleLink();
          }}
          className={btnCls(!!editor?.isActive("link"))}
        >
          <LinkIcon className="shrink-0 size-4" />
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleInsertImage}
        />
        <button
          type="button"
          title="Insert image"
          disabled={uploadingImage}
          onMouseDown={(e) => {
            e.preventDefault();
            imageInputRef.current?.click();
          }}
          className={btnCls(false)}
        >
          <ImagePlus className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleOrderedList().run();
          }}
          className={btnCls(!!editor?.isActive("orderedList"))}
        >
          <ListOrdered className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBulletList().run();
          }}
          className={btnCls(!!editor?.isActive("bulletList"))}
        >
          <List className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBlockquote().run();
          }}
          className={btnCls(!!editor?.isActive("blockquote"))}
        >
          <Quote className="shrink-0 size-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleCodeBlock().run();
          }}
          className={btnCls(!!editor?.isActive("codeBlock"))}
        >
          <Code className="shrink-0 size-4" />
        </button>
      </div>
      <EditorContent
        editor={editor}
        data-placeholder={placeholder}
        className={`${heightClassName} overflow-auto p-3 prose dark:prose-invert max-w-none text-sm`}
      />
    </div>
  );
}
