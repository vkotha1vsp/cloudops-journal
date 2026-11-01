"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { cn, relativeTime } from "@/lib/utils";
import type { TiptapNode } from "@/domain/tiptap";
import { RichEditor } from "./rich-editor";

type V = { version: number; title: string; note: string | null; createdAt: string; chars: number };

export function HistoryView({ pageId, versions }: { pageId: string; versions: V[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(versions[0]?.version ?? null);
  const [doc, setDoc] = useState<{ version: number; title: string; content: TiptapNode } | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (v: number) => {
    setSelected(v);
    setLoading(true);
    try {
      const r = await api<{ version: { version: number; title: string; content: TiptapNode } }>(`/api/pages/${pageId}/versions/${v}`);
      setDoc(r.version);
    } finally {
      setLoading(false);
    }
  };

  const restore = async (v: number) => {
    if (!window.confirm(`Restore version ${v}? Your current content is saved as a new version first, so nothing is lost.`)) return;
    await api(`/api/pages/${pageId}/versions/${v}`, { method: "POST" });
    router.push(`/journal/${pageId}`);
    router.refresh();
  };

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <ol className="space-y-1">
        {versions.map((v) => (
          <li key={v.version}>
            <button
              type="button"
              onClick={() => open(v.version)}
              className={cn("w-full rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary/50", selected === v.version && doc?.version === v.version && "border-primary bg-accent/40")}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">v{v.version}</span>
                <span className="text-xs text-muted-foreground">{relativeTime(v.createdAt)}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{v.note ?? "Snapshot"} · {v.chars.toLocaleString()} chars</div>
            </button>
          </li>
        ))}
      </ol>
      <div>
        {doc ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-semibold">{doc.title} <span className="text-sm font-normal text-muted-foreground">v{doc.version}</span></h2>
              <Button size="sm" variant="outline" onClick={() => restore(doc.version)}>
                <RotateCcw /> Restore this version
              </Button>
            </div>
            <RichEditor key={doc.version} content={doc.content} editable={false} />
          </div>
        ) : (
          <div className="grid h-64 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
            {loading ? "Loading…" : "Select a version to preview it"}
          </div>
        )}
      </div>
    </div>
  );
}
