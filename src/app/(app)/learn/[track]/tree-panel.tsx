"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { CategoryTree } from "@/components/learn/category-tree";
import type { TreeCategory } from "@/server/categories";

export function TreePanel({ tree, track, trackSlug, label }: { tree: TreeCategory[]; track: string; trackSlug: string; label: string }) {
  const segments = useSelectedLayoutSegments();
  const activeTopicId = segments[0] === "topic" ? segments[1] : undefined;
  return (
    <div className="rounded-xl border bg-card p-3">
      <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
      <CategoryTree tree={tree} track={track} trackSlug={trackSlug} activeTopicId={activeTopicId} />
    </div>
  );
}
