import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, notFound } from "@/lib/errors";
import { markdownToHtml } from "@/domain/import/convert";
import { search } from "@/server/search";

export const AI_KINDS = {
  question: "Answer a question",
  explain: "Explain a component or concept",
  quiz: "Generate review questions",
  compare: "Compare AWS and Azure",
  recommend: "Recommend missing components",
  troubleshoot: "Explain a troubleshooting scenario",
  draft: "Draft a journal page",
} as const;
export type AIKind = keyof typeof AI_KINDS;

export const askSchema = z.object({
  kind: z.enum(Object.keys(AI_KINDS) as [AIKind, ...AIKind[]]),
  prompt: z.string().trim().min(3).max(4000),
  pageId: z.string().max(64).nullish(),
  diagramId: z.string().max(64).nullish(),
});

export type Source = { ref: string; kind: string; id: string; title: string; href: string };

export function aiStatus() {
  const e = env();
  if (e.AI_PROVIDER === "bedrock") return { enabled: true, provider: "bedrock" as const, model: e.BEDROCK_MODEL_ID };
  if (e.AI_PROVIDER === "openai") return { enabled: true, provider: "openai" as const, model: e.OPENAI_MODEL };
  return { enabled: false, provider: "none" as const, model: "" };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Retrieval from the user's own knowledge base (PostgreSQL full-text search). */
async function retrieve(ownerId: string, query: string, pageId?: string | null, diagramId?: string | null) {
  const sources: Source[] = [];
  const blocks: string[] = [];
  const add = (kind: string, id: string, title: string, href: string, text: string) => {
    if (sources.some((s) => s.kind === kind && s.id === id)) return;
    const ref = `S${sources.length + 1}`;
    sources.push({ ref, kind, id, title, href });
    blocks.push(`[${ref}] ${kind}: ${title}\n${clip(text.trim(), 2500)}`);
  };
  const prisma = db();
  if (pageId) {
    const p = await prisma.journalPage.findFirst({ where: { id: pageId, ownerId }, select: { id: true, title: true, plainText: true } });
    if (!p) throw notFound("Page");
    add("page", p.id, p.title, `/journal/${p.id}`, p.plainText);
  }
  if (diagramId) {
    const d = await prisma.architectureDiagram.findFirst({
      where: { id: diagramId, ownerId },
      select: { id: true, title: true, description: true, nodes: { select: { key: true, kind: true, label: true } }, edges: { select: { relation: true, protocol: true, port: true, source: { select: { label: true } }, target: { select: { label: true } } } } },
    });
    if (!d) throw notFound("Diagram");
    const text = [
      d.description ?? "",
      "Resources: " + d.nodes.map((n) => `${n.label} (${n.kind})`).join("; "),
      "Connections: " + d.edges.map((e) => `${e.source.label} --${e.relation}${e.protocol ? ` ${e.protocol}` : ""}${e.port ? `:${e.port}` : ""}--> ${e.target.label}`).join("; "),
    ].join("\n");
    add("diagram", d.id, d.title, `/studio/${d.id}`, text);
  }
  const hits = await search(ownerId, query, { kinds: ["page", "topic", "lab", "troubleshooting"], limit: 6 }).catch(() => []);
  for (const h of hits) {
    if (sources.length >= 7) break;
    let text = h.snippet.replace(/<\/?mark>/g, "");
    if (h.kind === "page") text = (await prisma.journalPage.findFirst({ where: { id: h.id, ownerId }, select: { plainText: true } }))?.plainText ?? text;
    if (h.kind === "topic") {
      const t = await prisma.topic.findFirst({ where: { id: h.id, ownerId }, select: { summary: true, plainText: true } });
      text = `${t?.summary ?? ""}\n${t?.plainText ?? ""}`;
    }
    if (h.kind === "lab") {
      const l = await prisma.lab.findFirst({ where: { id: h.id, ownerId }, select: { objective: true, observations: true, errorsEncountered: true, rootCause: true, resolution: true } });
      if (l) text = `Objective: ${l.objective}\nObserved: ${l.observations}\nErrors: ${l.errorsEncountered}\nRoot cause: ${l.rootCause}\nResolution: ${l.resolution}`;
    }
    if (h.kind === "troubleshooting") {
      const c = await prisma.troubleshootingCase.findFirst({ where: { id: h.id, ownerId }, select: { errorMessage: true, symptoms: true, rootCause: true, resolution: true } });
      if (c) text = `Error: ${c.errorMessage}\nSymptoms: ${c.symptoms}\nRoot cause: ${c.rootCause}\nResolution: ${c.resolution}`;
    }
    add(h.kind, h.id, h.title, h.href, text);
  }
  return { sources, context: blocks.join("\n\n---\n\n") };
}

const TASK: Record<AIKind, string> = {
  question: "Answer the user's question.",
  explain: "Explain the named component or concept: what it does, why it exists, how it relates to neighbouring components, common misconceptions.",
  quiz: "Write 6 review questions of increasing difficulty with short model answers (hide answers under a 'Answers' heading).",
  compare: "Compare how AWS and Azure implement this. Do not assume similarly named services behave identically; call out real behavioural differences.",
  recommend: "Review the architecture and list missing or questionable components (security, availability, observability, cost) with a one-line reason each.",
  troubleshoot: "Explain the likely causes in order of probability, the commands to investigate each (read-only commands first), and how to verify the fix.",
  draft: "Draft a journal page in Markdown with sections: Overview, How it works, Configuration, Security, Cost, Common errors, Related topics. The user will review it before saving.",
};

function systemPrompt(kind: AIKind) {
  return [
    "You are the learning assistant inside CloudOps Journal, a personal AWS / Azure / DevOps knowledge base.",
    TASK[kind],
    "Respond in Markdown with exactly two top-level sections:",
    "## From your journal — only facts supported by the numbered sources provided, citing them like [S1]. If the sources do not cover the question, say so in one sentence.",
    "## General guidance — your own knowledge. Be technically precise. Mark uncertainty explicitly.",
    "Rules: never invent URLs or documentation titles; if pointing to official docs, name the service and say to search docs.aws.amazon.com or learn.microsoft.com. Shell commands and Terraform are suggestions for the user to review, never claims that anything was run. Never ask for or include credentials.",
  ].join("\n");
}

async function callModel(system: string, user: string): Promise<string> {
  const e = env();
  if (e.AI_PROVIDER === "bedrock") {
    const client = new BedrockRuntimeClient({ region: e.BEDROCK_REGION || e.AWS_REGION });
    const res = await client.send(
      new ConverseCommand({
        modelId: e.BEDROCK_MODEL_ID,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 2000, temperature: 0.3 },
      }),
    );
    return (res.output?.message?.content ?? []).map((c) => ("text" in c ? c.text : "")).join("").trim();
  }
  if (e.AI_PROVIDER === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: e.OPENAI_MODEL, temperature: 0.3, max_tokens: 2000, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }
  throw new HttpError(503, "AI assistant is not configured");
}

export async function ask(ownerId: string, input: z.infer<typeof askSchema>) {
  const status = aiStatus();
  const { sources, context } = await retrieve(ownerId, input.prompt, input.pageId, input.diagramId);
  if (!status.enabled) return { enabled: false, output: null, html: null, sources, jobId: null };

  const since = new Date(Date.now() - 24 * 3600_000);
  const used = await db().aIJob.count({ where: { ownerId, createdAt: { gte: since } } });
  if (used >= env().AI_DAILY_LIMIT) throw new HttpError(429, `Daily AI limit reached (${env().AI_DAILY_LIMIT}). Change AI_DAILY_LIMIT to adjust.`);

  const userMsg = `Sources from my journal:\n\n${context || "(no matching journal content)"}\n\n===\n\nRequest (${AI_KINDS[input.kind]}):\n${input.prompt}`;
  const job = await db().aIJob.create({
    data: { ownerId, kind: input.kind, provider: status.provider, model: status.model, prompt: clip(input.prompt, 4000), status: "RUNNING", grounded: sources },
    select: { id: true },
  });
  try {
    const output = await callModel(systemPrompt(input.kind), userMsg);
    await db().aIJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", output } });
    return { enabled: true, output, html: markdownToHtml(output), sources, jobId: job.id };
  } catch (err) {
    const message = err instanceof HttpError ? err.message : err instanceof Error ? clip(err.message, 300) : "AI request failed";
    await db().aIJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message } });
    console.error("AI request failed", err);
    throw new HttpError(502, `The AI provider returned an error: ${message}`);
  }
}

export async function setJobDecision(ownerId: string, id: string, status: "APPROVED" | "REJECTED") {
  const res = await db().aIJob.updateMany({ where: { id, ownerId, status: { in: ["SUCCEEDED", "APPROVED", "REJECTED"] } }, data: { status } });
  if (!res.count) throw notFound("AI job");
}

export async function recentJobs(ownerId: string) {
  return db().aIJob.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, kind: true, prompt: true, status: true, createdAt: true } });
}
