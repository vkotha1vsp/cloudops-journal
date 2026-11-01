"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { api } from "@/lib/client";

export function OpenCopyButton({ conceptId, label = "Edit a copy in Studio", ...props }: { conceptId: string; label?: string } & ButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ id: string }>("/api/diagrams", { body: { conceptId } });
          router.push(`/studio/${r.id}`);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Could not copy");
          setBusy(false);
        }
      }}
    >
      <Copy /> {label}
    </Button>
  );
}
