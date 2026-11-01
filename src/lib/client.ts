"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Browser-side JSON fetch helper for our own API (same-origin cookies, JSON only). */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    signal: init.signal,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.details);
  return data as T;
}
