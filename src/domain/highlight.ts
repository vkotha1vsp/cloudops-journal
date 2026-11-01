export const HL_START = "⟦";
export const HL_END = "⟧";

/** Split a highlighted snippet into segments React can render as text (no HTML injection). */
export function highlightSegments(snippet: string): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  const re = new RegExp(`${HL_START}([\\s\\S]*?)${HL_END}`, "g");
  let last = 0;
  for (const m of snippet.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: snippet.slice(last, start), hit: false });
    out.push({ text: m[1] ?? "", hit: true });
    last = start + m[0].length;
  }
  if (last < snippet.length) out.push({ text: snippet.slice(last), hit: false });
  return out.filter((s) => s.text.length > 0);
}
