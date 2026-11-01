"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTheme } from "next-themes";
import { ExternalLink } from "lucide-react";
import { DiagramCanvas } from "@/components/architecture/diagram-canvas";
import { FlowPlayer } from "@/components/architecture/flow-player";
import { useDiagramGraph } from "@/components/architecture/topic-diagrams";
import { cn } from "@/lib/utils";

/** Interactive architecture embed inside a journal page (attrs: diagramId or conceptId). */
export function ArchitectureEmbedView({ node, selected, deleteNode, editor }: NodeViewProps) {
  const diagramId = node.attrs.diagramId as string | null;
  const conceptId = node.attrs.conceptId as string | null;
  const ref = diagramId ? { kind: "diagram" as const, id: diagramId } : conceptId ? { kind: "concept" as const, id: conceptId } : null;
  const [refMemo] = useState(ref);
  const { graph, title, error } = useDiagramGraph(refMemo);
  const [tab, setTab] = useState<"diagram" | "flow">("diagram");
  const href = diagramId ? `/studio/${diagramId}` : conceptId ? `/studio/concepts/${conceptId}` : "/studio";
  return (
    <NodeViewWrapper className={cn("not-prose my-4 rounded-xl border bg-card p-3", selected && "ring-2 ring-primary")} data-drag-handle contentEditable={false}>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="font-medium">{title ?? "Architecture"}</span>
        <div className="ml-2 flex rounded-md border p-0.5 text-xs">
          {(["diagram", "flow"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded px-2 py-0.5", tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
              {t === "diagram" ? "Diagram" : "Animate"}
            </button>
          ))}
        </div>
        <Link href={href} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open in Studio <ExternalLink className="size-3" /></Link>
        {editor.isEditable ? <button type="button" onClick={deleteNode} className="text-xs text-muted-foreground hover:text-destructive">Remove</button> : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {graph ? (
        tab === "diagram" ? <div className="overflow-hidden rounded-lg border bg-muted/20"><DiagramCanvas graph={graph} height={420} /></div> : <FlowPlayer graph={graph} height={400} compact />
      ) : !error ? <div className="h-40 animate-pulse rounded-lg bg-muted/40" /> : null}
    </NodeViewWrapper>
  );
}

/** Code block that also renders a live Mermaid preview when its language is "mermaid". */
export function CodeBlockView({ node }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? null;
  return (
    <NodeViewWrapper className="relative">
      <pre>
        <NodeViewContent as={"code" as "div"} className={language ? `language-${language}` : undefined} />
      </pre>
      {language === "mermaid" ? <MermaidPreview code={node.textContent} /> : null}
    </NodeViewWrapper>
  );
}

export function MermaidPreview({ code }: { code: string }) {
  const { resolvedTheme } = useTheme();
  const rawId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      if (!code.trim()) return setSvg("");
      try {
        const mermaid = (await import("mermaid")).default;
        // securityLevel "strict": HTML in labels is encoded and the SVG is sanitised; no click handlers.
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: resolvedTheme === "light" ? "default" : "dark" });
        const { svg } = await mermaid.render(`m${rawId.replace(/[^a-zA-Z0-9]/g, "")}${Date.now()}`, code);
        if (live) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message.split("\n")[0]! : "Invalid Mermaid diagram");
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [code, resolvedTheme, rawId]);
  return (
    <div contentEditable={false} className="not-prose -mt-1 mb-2 overflow-x-auto rounded-b-lg border border-t-0 bg-card p-3">
      {error ? <p className="text-xs text-destructive">Mermaid: {error}</p> : <div className="flex justify-center [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}
