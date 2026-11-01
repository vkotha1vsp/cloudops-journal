"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type EntityType = "PAGE" | "TOPIC" | "DIAGRAM" | "LAB" | "TROUBLESHOOTING" | "CATEGORY";

export function BookmarkButton({ entityType, entityId, initial }: { entityType: EntityType; entityId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={on ? "Remove bookmark" : "Bookmark"}
      title={on ? "Remove bookmark" : "Bookmark"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ bookmarked: boolean }>("/api/bookmarks", { body: { entityType, entityId } });
          setOn(r.bookmarked);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Star className={cn(on && "fill-amber-400 text-amber-400")} />
    </Button>
  );
}
