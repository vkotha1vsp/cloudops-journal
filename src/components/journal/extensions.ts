import { mergeAttributes, Node, type Extensions } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { isSafeHref } from "@/domain/links";
import { ArchitectureEmbedView, CodeBlockView } from "./embeds";

export { isSafeHref };

const lowlight = createLowlight(common);

export const CALLOUT_TONES = ["info", "warning", "tip"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: { toggleCallout: (tone?: CalloutTone) => ReturnType };
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    architectureEmbed: { insertArchitecture: (attrs: { diagramId?: string | null; conceptId?: string | null }) => ReturnType };
  }
}

/** Interactive architecture diagram (saved diagram or concept) with an Animate tab. */
export const ArchitectureEmbed = Node.create({
  name: "architectureEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    const id = (attr: string, key: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => {
        const v = el.getAttribute(attr);
        return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
      },
      renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [attr]: attrs[key] } : {}),
    });
    return { diagramId: id("data-diagram-id", "diagramId"), conceptId: id("data-concept-id", "conceptId") };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="architecture-embed"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "architecture-embed" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArchitectureEmbedView);
  },
  addCommands() {
    return {
      insertArchitecture:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Callout block: a tinted box for notes, warnings and tips. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (el) => {
          const t = el.getAttribute("data-tone");
          return CALLOUT_TONES.includes(t as CalloutTone) ? t : "info";
        },
        renderHTML: (attrs) => ({ "data-tone": CALLOUT_TONES.includes(attrs.tone) ? attrs.tone : "info" }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },
  addCommands() {
    return {
      toggleCallout:
        (tone = "info") =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { tone }),
    };
  },
});


export function editorExtensions(placeholder = "Start writing… use the toolbar for headings, code, tables and checklists."): Extensions {
  return [
    StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] } }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: "bash" }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto"],
      isAllowedUri: (url) => isSafeHref(url),
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
    }),
    Placeholder.configure({ placeholder }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Callout,
    ArchitectureEmbed,
  ];
}

export const CODE_LANGUAGES = ["bash", "shell", "json", "yaml", "typescript", "javascript", "python", "go", "sql", "ini", "dockerfile", "xml", "hcl", "mermaid", "plaintext"];
