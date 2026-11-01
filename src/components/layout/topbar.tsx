"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";

export function Topbar({ user }: { user: { email: string; name?: string | null } }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
          <Menu />
        </Button>
        <form
          role="search"
          className="relative max-w-xl flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, topics, errors, commands…"
            aria-label="Search"
            className="h-9 w-full rounded-lg border bg-muted/40 pl-9 pr-14 text-sm placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
            Ctrl K
          </kbd>
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          <span className="hidden max-w-[180px] truncate px-2 text-xs text-muted-foreground md:block" title={user.email}>
            {user.name ?? user.email}
          </span>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut />
          </Button>
        </div>
      </header>
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r bg-sidebar">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
