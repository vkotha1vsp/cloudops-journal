"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";

export function StartLabButton({ templateId, topicId, label, variant = "default" }: { templateId?: string; topicId?: string; label: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const body = templateId ? { templateId, topicId: topicId ?? null } : { title: "Untitled lab", topicId: topicId ?? null };
      const r = await api<{ id: string }>("/api/labs", { body });
      router.push(`/labs/${r.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create the lab");
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant={variant} disabled={busy} onClick={start}>
      <Plus /> {busy ? "Creating…" : label}
    </Button>
  );
}
