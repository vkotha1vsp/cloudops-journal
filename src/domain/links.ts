/** Only http(s), mailto and same-site relative links (internal page links like /journal/abc). */
export function isSafeHref(url: string): boolean {
  const u = url.trim();
  if (/[\u0000-\u001f\s]/.test(u)) return false;
  if (u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\")) return true;
  return /^(https?:\/\/[^/\s]|mailto:[^\s]+@)/i.test(u);
}
