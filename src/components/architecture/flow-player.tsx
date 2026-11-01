"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ArchGraph } from "@/domain/architecture/graph";
import { buildAllScenarios, FLOW_MODES, type FlowMode, type Outcome } from "@/domain/architecture/scenarios";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DiagramCanvas } from "./diagram-canvas";

const OUTCOME_LABEL: Record<Outcome, { text: string; cls: string }> = {
  OK: { text: "OK", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  FAILED: { text: "Failed", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  REJECTED: { text: "Dropped", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  FAILOVER: { text: "Failover", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
};

export function FlowPlayer({ graph, initialMode = "normal", height = 520, compact = false }: { graph: ArchGraph; initialMode?: FlowMode; height?: number; compact?: boolean }) {
  const scenarios = useMemo(() => buildAllScenarios(graph), [graph]);
  const [mode, setMode] = useState<FlowMode>(initialMode);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const scenario = scenarios.find((s) => s.mode === mode)!;
  const step = index >= 0 ? scenario.steps[index] : undefined;

  useEffect(() => {
    setIndex(-1);
    setPlaying(false);
  }, [mode, graph]);

  useEffect(() => {
    if (!playing) return;
    if (index >= scenario.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), index < 0 ? 200 : (step?.durationMs ?? 2000) / speed);
    return () => clearTimeout(t);
  }, [playing, index, scenario.steps.length, speed, step?.durationMs]);

  const highlight = step ? { nodeKeys: step.nodeKeys, edgeKeys: step.edgeKeys, outcome: step.outcome } : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
        <FlaskConical className="size-3.5 shrink-0" />
        Simulation: a step-by-step model of how these services behave. It does not read or monitor your real AWS resources.
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Simulation mode">
        {FLOW_MODES.map((m) => {
          const s = scenarios.find((x) => x.mode === m.mode)!;
          return (
            <button
              key={m.mode}
              role="tab"
              aria-selected={mode === m.mode}
              title={s.applicable ? m.description : s.reason}
              onClick={() => setMode(m.mode)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                mode === m.mode ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                !s.applicable && "opacity-50",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" disabled={!scenario.applicable} onClick={() => (index >= scenario.steps.length - 1 ? (setIndex(-1), setPlaying(true)) : setPlaying(!playing))}>
            {playing ? <Pause /> : <Play />} {playing ? "Pause" : index >= 0 && index < scenario.steps.length - 1 ? "Resume" : "Play"}
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Previous step" disabled={index <= 0} onClick={() => (setPlaying(false), setIndex((i) => i - 1))}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Next step" disabled={!scenario.applicable || index >= scenario.steps.length - 1} onClick={() => (setPlaying(false), setIndex((i) => i + 1))}>
            <ChevronRight />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Restart" onClick={() => (setPlaying(false), setIndex(-1))}>
            <RotateCcw />
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Speed
            <select className="h-7 rounded border bg-background px-1 text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[0.5, 1, 1.5, 2].map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>
        </div>
        <div className="min-h-[84px] min-w-[280px] flex-1">
          {!scenario.applicable ? (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Not available for this architecture. {scenario.reason}</p>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${mode}-${index}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border bg-card px-4 py-3"
                aria-live="polite"
              >
                {step ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Step {step.order} of {scenario.steps.length}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", OUTCOME_LABEL[step.outcome].cls)}>{OUTCOME_LABEL[step.outcome].text}</span>
                      <h4 className="font-semibold">{step.title}</h4>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.explanation}</p>
                  </>
                ) : (
                  <>
                    <h4 className="font-semibold">{scenario.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{scenario.description} Press Play, or step through with the arrows.</p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-muted/20">
        <ReactFlowProvider>
          <DiagramCanvas graph={graph} highlight={highlight} height={height} />
        </ReactFlowProvider>
      </div>
      {scenario.applicable && !compact ? (
        <ol className="flex flex-wrap gap-1.5 text-sm">
          {scenario.steps.map((s, i) => (
            <li key={s.order}>
              <button
                onClick={() => (setPlaying(false), setIndex(i))}
                className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-muted", i === index ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground")}
              >
                <span className="tabular-nums opacity-60">{s.order}</span>
                {s.title}
                {s.outcome !== "OK" ? <span className={cn("rounded px-1 text-[10px]", OUTCOME_LABEL[s.outcome].cls)}>{OUTCOME_LABEL[s.outcome].text}</span> : null}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
