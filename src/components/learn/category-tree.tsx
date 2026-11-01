"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Icon } from "@/components/layout/icon";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { TreeCategory } from "@/server/categories";

const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-muted-foreground/30",
  LEARNING: "bg-sky-500",
  REVIEWING: "bg-amber-500",
  MASTERED: "bg-emerald-500",
};

export function CategoryTree({ tree, track, trackSlug, activeTopicId }: { tree: TreeCategory[]; track: string; trackSlug: string; activeTopicId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const addCategory = (parentId: string | null) => {
    const name = window.prompt(parentId ? "New sub-category name" : "New category name");
    if (name?.trim()) void act(() => api("/api/categories", { body: { track, name, parentId } }));
  };

  return (
    <div className={cn("space-y-1 text-sm", busy && "pointer-events-none opacity-60")}>
      <ul className="space-y-0.5">
        {tree.map((c) => (
          <CategoryNode key={c.id} cat={c} depth={0} trackSlug={trackSlug} activeTopicId={activeTopicId} act={act} addCategory={addCategory} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => addCategory(null)}
        className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <FolderPlus className="size-4" /> Add category
      </button>
    </div>
  );
}

function CategoryNode({
  cat, depth, trackSlug, activeTopicId, act, addCategory,
}: {
  cat: TreeCategory;
  depth: number;
  trackSlug: string;
  activeTopicId?: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  addCategory: (parentId: string | null) => void;
}) {
  const containsActive = (c: TreeCategory): boolean => c.topics.some((t) => t.id === activeTopicId) || c.children.some(containsActive);
  const [open, setOpen] = useState(depth === 0 ? containsActive(cat) || !activeTopicId : containsActive(cat));
  const count = cat.topics.length;
  const done = cat.topics.filter((t) => t.status === "MASTERED").length;

  // Hidden (not just transparent) until hover/focus so category names get the full width.
  const hoverBtn = "hidden size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground group-hover:grid group-focus-within:grid";

  return (
    <li>
      <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-muted" style={{ paddingLeft: depth * 12 }}>
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1 text-left" aria-expanded={open}>
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <Icon name={cat.icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{cat.name}</span>
          {count ? <span className="ml-auto pl-1 text-[11px] tabular-nums text-muted-foreground">{done}/{count}</span> : null}
        </button>
        <button type="button" className={hoverBtn} title="Add topic" aria-label={`Add topic to ${cat.name}`}
          onClick={() => {
            const title = window.prompt(`New topic in “${cat.name}”`);
            if (title?.trim()) void act(() => api("/api/topics", { body: { categoryId: cat.id, title } }));
          }}>
          <Plus className="size-3.5" />
        </button>
        <button type="button" className={hoverBtn} title="Add sub-category" aria-label={`Add sub-category to ${cat.name}`} onClick={() => addCategory(cat.id)}>
          <FolderPlus className="size-3.5" />
        </button>
        <button type="button" className={hoverBtn} title="Rename" aria-label={`Rename ${cat.name}`}
          onClick={() => {
            const name = window.prompt("Rename category", cat.name);
            if (name?.trim() && name !== cat.name) void act(() => api(`/api/categories/${cat.id}`, { method: "PATCH", body: { name } }));
          }}>
          <Pencil className="size-3.5" />
        </button>
        <button type="button" className={hoverBtn} title="Delete" aria-label={`Delete ${cat.name}`}
          onClick={() => {
            if (window.confirm(`Delete “${cat.name}” with all its sub-categories and topics? Journal pages linked to these topics are kept.`))
              void act(() => api(`/api/categories/${cat.id}`, { method: "DELETE" }));
          }}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {open ? (
        <ul className="space-y-0.5">
          {cat.children.map((c) => (
            <CategoryNode key={c.id} cat={c} depth={depth + 1} trackSlug={trackSlug} activeTopicId={activeTopicId} act={act} addCategory={addCategory} />
          ))}
          {cat.topics.map((t) => (
            <li key={t.id}>
              <Link
                href={`/learn/${trackSlug}/topic/${t.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-md py-1 pr-2 text-[13px] hover:bg-muted",
                  t.id === activeTopicId ? "bg-accent font-medium text-accent-foreground" : "text-sidebar-foreground",
                )}
                style={{ paddingLeft: (depth + 1) * 12 + 22 }}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[t.status])} title={t.status.toLowerCase().replace("_", " ")} />
                <span className="truncate">{t.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
