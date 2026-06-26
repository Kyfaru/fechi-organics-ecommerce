"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
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
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

const btnCls = (active: boolean) =>
  `size-8 inline-flex justify-center items-center rounded-full text-sm text-gray-800 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700 ${
    active ? "bg-gray-100 dark:bg-neutral-700" : ""
  }`;

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editable: true,
    immediatelyRender: false,
  });

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
        className="h-40 overflow-auto p-3 prose dark:prose-invert max-w-none text-sm"
      />
    </div>
  );
}
