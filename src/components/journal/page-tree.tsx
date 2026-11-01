"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export type TreePage = { id: string; title: string; parentId: string | null; icon: string | null; status: string };

type Node = TreePage & { children: Node[] };

export function buildPageTree(pages: TreePage[]): Node[] {
  const map = new Map<string, Node>(pages.map((p) => [p.id, { ...p, children: [] }]));
  const roots: Node[] = [];
  for (const n of map.values()) {
    const parent = n.parentId ? map.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export function PageTree({ pages, activeId }: { pages: TreePage[]; activeId?: string }) {
  const roots = useMemo(() => buildPageTree(pages), [pages]);
  if (!roots.length) return <p className="px-2 py-4 text-sm text-muted-foreground">No pages yet.</p>;
  return (
    <ul className="space-y-0.5 text-sm">
      {roots.map((n) => (
        <TreeItem key={n.id} node={n} activeId={activeId} depth={0} />
      ))}
    </ul>
  );
}

function TreeItem({ node, activeId, depth }: { node: Node; activeId?: string; depth: number }) {
  const [open, setOpen] = useState(true);
  const active = node.id === activeId;
  return (
    <li>
      <div
        className={cn("group flex items-center gap-1 rounded-md pr-2 hover:bg-muted", active && "bg-accent text-accent-foreground")}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {node.children.length ? (
          <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className="grid size-5 place-items-center text-muted-foreground">
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-5" />
        )}
        <Link href={`/journal/${node.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
          {node.icon ? <span className="text-sm">{node.icon}</span> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{node.title}</span>
          {node.status === "PUBLISHED" ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500" title="Published" /> : null}
        </Link>
      </div>
      {open && node.children.length ? (
        <ul>
          {node.children.map((c) => (
            <TreeItem key={c.id} node={c} activeId={activeId} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
