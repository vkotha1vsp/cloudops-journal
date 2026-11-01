import { requireUser } from "@/lib/auth";
import { AI_KINDS, aiStatus } from "@/server/ai";
import { listPages } from "@/server/pages";
import { listDiagrams } from "@/server/diagrams";
import { Assistant } from "@/components/assistant/assistant";

export const metadata = { title: "AI Learning Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; page?: string; diagram?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [pages, diagrams] = await Promise.all([listPages(user.id), listDiagrams(user.id)]);
  const status = aiStatus();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Learning Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Answers are split into what your journal says (with numbered sources) and general guidance. It never runs commands or changes infrastructure.
        </p>
      </div>
      <Assistant
        kinds={AI_KINDS}
        enabled={status.enabled}
        provider={status.provider}
        pages={pages.map((p) => ({ id: p.id, title: p.title }))}
        diagrams={diagrams.map((d) => ({ id: d.id, title: d.title }))}
        initial={{ kind: sp.kind, prompt: sp.q, pageId: sp.page, diagramId: sp.diagram }}
      />
    </div>
  );
}
