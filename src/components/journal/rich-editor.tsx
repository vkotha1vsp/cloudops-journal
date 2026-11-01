"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold, CheckSquare, Code, Code2, Heading1, Heading2, Heading3, Info, Italic, Link2, List, ListOrdered, Minus, Quote,
  Redo2, Strikethrough, Table2, Undo2,
} from "lucide-react";
import type { TiptapNode } from "@/domain/tiptap";
import { cn } from "@/lib/utils";
import { CODE_LANGUAGES, editorExtensions, isSafeHref } from "./extensions";

type Props = {
  content: TiptapNode;
  onChange?: (doc: TiptapNode) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  /** Change this to force-reload content (e.g. after restoring a version). */
  resetKey?: string | number;
};

export function RichEditor({ content, onChange, placeholder, editable = true, className, resetKey }: Props) {
  const editor = useEditor({
    extensions: editorExtensions(placeholder),
    content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "prose-none max-w-none focus:outline-none", spellcheck: "true" },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON() as TiptapNode),
  });

  useEffect(() => {
    if (editor && resetKey !== undefined) editor.commands.setContent(content, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, editor]);

  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      {editable && editor ? <Toolbar editor={editor} /> : null}
      <div className="px-5 py-4 md:px-8 md:py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (label: string, icon: React.ReactNode, run: () => void, active = false, disabled = false) => (
    <button
      key={label}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-4",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {icon}
    </button>
  );
  const sep = (k: string) => <span key={k} className="mx-1 h-5 w-px bg-border" />;
  const c = () => editor.chain().focus();

  const setLink = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link URL (https://… or an internal path like /journal/<id>)", prev);
    if (url === null) return;
    if (url.trim() === "") return void c().extendMarkRange("link").unsetLink().run();
    if (!isSafeHref(url)) return void window.alert("Only https://, http://, mailto: or internal /paths are allowed.");
    c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b bg-card/95 px-2 py-1.5 backdrop-blur">
      {btn("Undo", <Undo2 />, () => c().undo().run(), false, !editor.can().undo())}
      {btn("Redo", <Redo2 />, () => c().redo().run(), false, !editor.can().redo())}
      {sep("s1")}
      {btn("Heading 1", <Heading1 />, () => c().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
      {btn("Heading 2", <Heading2 />, () => c().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {btn("Heading 3", <Heading3 />, () => c().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}
      {sep("s2")}
      {btn("Bold", <Bold />, () => c().toggleBold().run(), editor.isActive("bold"))}
      {btn("Italic", <Italic />, () => c().toggleItalic().run(), editor.isActive("italic"))}
      {btn("Strikethrough", <Strikethrough />, () => c().toggleStrike().run(), editor.isActive("strike"))}
      {btn("Inline code", <Code />, () => c().toggleCode().run(), editor.isActive("code"))}
      {btn("Link", <Link2 />, setLink, editor.isActive("link"))}
      {sep("s3")}
      {btn("Bullet list", <List />, () => c().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("Numbered list", <ListOrdered />, () => c().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("Checklist", <CheckSquare />, () => c().toggleTaskList().run(), editor.isActive("taskList"))}
      {btn("Quote", <Quote />, () => c().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {btn("Callout", <Info />, () => c().toggleCallout("info").run(), editor.isActive("callout"))}
      {btn("Code block", <Code2 />, () => c().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      {btn("Table", <Table2 />, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, editor.isActive("table"))}
      {btn("Divider", <Minus />, () => c().setHorizontalRule().run())}
      {editor.isActive("codeBlock") ? (
        <select
          aria-label="Code language"
          className="ml-1 h-7 rounded border bg-background px-1 text-xs"
          value={(editor.getAttributes("codeBlock").language as string) ?? "bash"}
          onChange={(e) => c().updateAttributes("codeBlock", { language: e.target.value }).run()}
        >
          {CODE_LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      ) : null}
      {editor.isActive("callout") ? (
        <select
          aria-label="Callout style"
          className="ml-1 h-7 rounded border bg-background px-1 text-xs"
          value={(editor.getAttributes("callout").tone as string) ?? "info"}
          onChange={(e) => c().updateAttributes("callout", { tone: e.target.value }).run()}
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="tip">Tip</option>
        </select>
      ) : null}
      {editor.isActive("table") ? (
        <span className="ml-1 flex gap-0.5 text-xs">
          {[
            ["+ row", () => c().addRowAfter().run()],
            ["+ col", () => c().addColumnAfter().run()],
            ["− row", () => c().deleteRow().run()],
            ["− col", () => c().deleteColumn().run()],
            ["✕ table", () => c().deleteTable().run()],
          ].map(([label, fn]) => (
            <button key={label as string} type="button" onMouseDown={(e) => e.preventDefault()} onClick={fn as () => void} className="rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              {label as string}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );
}
