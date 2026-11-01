"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/domain/nav";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <Link href="/dashboard" className="mb-4 flex items-center gap-2.5 px-2 py-1.5" onClick={onNavigate}>
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow">
          <Icon name="cloud" className="size-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">CloudOps Journal</span>
          <span className="block text-[11px] text-muted-foreground">Learn · build · document</span>
        </span>
      </Link>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-accent font-medium text-accent-foreground" : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon name={item.icon} className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            <span className="truncate">{item.label}</span>
            {item.phase ? (
              <span className="ml-auto rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">P{item.phase}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
