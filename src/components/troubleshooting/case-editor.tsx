"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Area } from "@/components/labs/fields";

export const AREAS = ["aws", "azure", "kubernetes", "docker", "jenkins", "terraform", "networking", "security"] as const;
export const AREA_LABEL: Record<string, string> = {
  aws: "AWS", azure: "Azure", kubernetes: "Kubernetes", docker: "Docker", jenkins: "Jenkins", terraform: "Terraform", networking: "Networking", security: "Security",
};

export type CaseData = {
  title: string;
  errorMessage: string;
  area: (typeof AREAS)[number];
  services: string[];
  symptoms: string;
  rootCause: string;
  investigation: string;
  resolution: string;
  verification: string;
  prevention: string;
  labIds: string[];
  diagramIds: string[];
};

type Option = { id: string; title: string };

export function CaseEditor({ id, initial, labs, diagrams }: { id?: string; initial: CaseData; labs: Option[]; diagrams: Option[] }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof CaseData>(k: K, v: CaseData[K]) => (setC((x) => ({ ...x, [k]: v })), setMsg(null));

  const save = async () => {
    setBusy(true);
    try {
      if (id) {
        await api(`/api/troubleshooting/${id}`, { method: "PUT", body: c });
        setMsg("Saved");
        router.refresh();
      } else {
        const r = await api<{ id: string }>("/api/troubleshooting", { body: c });
        router.push(`/troubleshooting/${r.id}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!id || !confirm("Delete this troubleshooting case?")) return;
    await api(`/api/troubleshooting/${id}`, { method: "DELETE" });
    router.push("/troubleshooting");
    router.refresh();
  };
  const addService = () => {
    const s = service.trim();
    if (s && !c.services.includes(s)) set("services", [...c.services, s]);
    setService("");
  };
  const toggle = (k: "labIds" | "diagramIds", v: string) => set(k, c[k].includes(v) ? c[k].filter((x) => x !== v) : [...c[k], v]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/troubleshooting" className="hover:text-foreground">Troubleshooting KB</Link>
        <span>/</span>
        <span className="truncate">{id ? c.title : "New case"}</span>
        <span className="ml-auto flex items-center gap-2">
          {msg ? <span className={msg === "Saved" ? "text-xs" : "text-xs text-destructive"}>{msg}</span> : null}
          {id ? <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete case"><Trash2 /></Button> : null}
          <Button size="sm" onClick={save} disabled={busy || !c.title.trim()}><Save /> {busy ? "Saving…" : id ? "Save" : "Create case"}</Button>
        </span>
      </div>
      <input
        aria-label="Title"
        value={c.title}
        placeholder="Short name, e.g. ALB targets unhealthy after deploy"
        onChange={(e) => set("title", e.target.value)}
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
      />
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Area</span>
            <Select value={c.area} onChange={(e) => set("area", e.target.value as CaseData["area"])}>
              {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
            </Select>
          </label>
          <div className="min-w-[240px] flex-1 space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Affected services</span>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
              {c.services.map((s) => (
                <span key={s} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {s}
                  <button type="button" aria-label={`Remove ${s}`} onClick={() => set("services", c.services.filter((x) => x !== s))}><X className="size-3" /></button>
                </span>
              ))}
              <input
                value={service}
                onChange={(e) => setService(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addService())}
                onBlur={addService}
                placeholder="ALB, EC2… (Enter)"
                className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
        </div>
        <Area label="Error message" value={c.errorMessage} onChange={(v) => set("errorMessage", v)} mono placeholder="Paste the exact error text; it is searchable." />
        <Area label="Symptoms" value={c.symptoms} onChange={(v) => set("symptoms", v)} />
        <Area label="Investigation commands" value={c.investigation} onChange={(v) => set("investigation", v)} mono placeholder="aws elbv2 describe-target-health --target-group-arn …" hint="Reference only; never executed by the app." />
        <Area label="Root cause" value={c.rootCause} onChange={(v) => set("rootCause", v)} />
        <Area label="Resolution steps" value={c.resolution} onChange={(v) => set("resolution", v)} />
        <Area label="Verification steps" value={c.verification} onChange={(v) => set("verification", v)} />
        <Area label="Prevention" value={c.prevention} onChange={(v) => set("prevention", v)} />
      </Card>
      <Card className="grid gap-4 p-5 md:grid-cols-2">
        <Picker title="Related labs" options={labs} selected={c.labIds} onToggle={(v) => toggle("labIds", v)} href={(id) => `/labs/${id}`} empty="No labs yet." />
        <Picker title="Related architectures" options={diagrams} selected={c.diagramIds} onToggle={(v) => toggle("diagramIds", v)} href={(id) => `/studio/${id}`} empty="No saved diagrams yet." />
      </Card>
    </div>
  );
}

function Picker({ title, options, selected, onToggle, href, empty }: { title: string; options: Option[]; selected: string[]; onToggle: (id: string) => void; href: (id: string) => string; empty: string }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => selected.includes(o.id) || o.title.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {options.length > 6 ? <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-8" /> : null}
      {options.length ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
          {shown.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-primary" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} aria-label={o.title} />
              <span className="min-w-0 flex-1 truncate">{o.title}</span>
              {selected.includes(o.id) ? <Link href={href(o.id)} className="text-xs text-muted-foreground hover:text-foreground">Open</Link> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
