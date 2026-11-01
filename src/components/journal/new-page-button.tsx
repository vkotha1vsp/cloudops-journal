"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { api } from "@/lib/client";

export function NewPageButton({
  parentId,
  topicId,
  title = "Untitled",
  label = "New page",
  ...props
}: { parentId?: string; topicId?: string; title?: string; label?: string } & ButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { page } = await api<{ page: { id: string } }>("/api/pages", { body: { title, parentId, topicId } });
          router.push(`/journal/${page.id}`);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Could not create page");
          setBusy(false);
        }
      }}
    >
      <Plus /> {label}
    </Button>
  );
}
