"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/client";

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error" | "conflict";

/**
 * Debounced autosave. `save` receives the merged pending changes; changes queued while a save
 * is in flight are sent afterwards. Pending changes are flushed when the tab is hidden or the
 * editor unmounts, and the browser warns before leaving with unsaved edits.
 */
export function useAutosave<T extends object>(save: (changes: Partial<T>) => Promise<void>, delayMs = 1200) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) await inFlight.current;
    const changes = pending.current;
    if (Object.keys(changes).length === 0) return;
    pending.current = {};
    setState("saving");
    const p = saveRef
      .current(changes)
      .then(() => {
        setError(null);
        setState(Object.keys(pending.current).length ? "unsaved" : "saved");
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 409) {
          setState("conflict");
          setError(e.message);
          return;
        }
        // Put changes back so the next attempt includes them.
        pending.current = { ...changes, ...pending.current };
        setState("error");
        setError(e instanceof Error ? e.message : "Save failed");
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = p;
    await p;
    if (Object.keys(pending.current).length) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  }, [delayMs, flush]);

  const queue = useCallback(
    (changes: Partial<T>) => {
      pending.current = { ...pending.current, ...changes };
      setState((s) => (s === "conflict" ? s : "unsaved"));
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inFlight.current) {
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  return { state, error, queue, flush };
}

export function saveLabel(state: SaveState): string {
  switch (state) {
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return "All changes saved";
    case "error":
      return "Save failed, retrying on next edit";
    case "conflict":
      return "Changed elsewhere, reload";
    default:
      return "";
  }
}
