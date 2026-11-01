"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Labelled textarea that grows with its content. `mono` for commands, logs and Terraform. */
export function Area({
  label, value, onChange, placeholder, mono, rows = 3, hint,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; rows?: number; hint?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 640)}px`;
  }, [value]);
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        spellCheck={!mono}
        onChange={(e) => onChange(e.target.value)}
        className={cn("min-h-0 resize-y", mono && "font-mono text-[13px] leading-relaxed")}
      />
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Debounced autosave: call `touch()` after each change; `save` runs 1.2s after the last one. */
export function useDebouncedSave(save: () => Promise<void>, delay = 1200) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const run = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState("saving");
    try {
      await saveRef.current();
      setState("saved");
      setError(null);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };
  const touch = () => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  return { state, error, touch, saveNow: run };
}

export function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  const text = { idle: "", dirty: "Unsaved changes", saving: "Saving…", saved: "Saved", error: error ?? "Save failed" }[state];
  return <span className={cn("text-xs", state === "error" ? "text-destructive" : "text-muted-foreground")}>{text}</span>;
}
