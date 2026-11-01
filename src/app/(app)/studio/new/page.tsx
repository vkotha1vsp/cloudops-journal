import { requireUser } from "@/lib/auth";
import { topicOptions } from "@/server/topics";
import { conceptGraph } from "@/domain/architecture/library";
import { generate } from "@/domain/architecture/build";
import { parseRequest } from "@/domain/architecture/parse";
import { emptyGraph } from "@/domain/architecture/graph";
import { StudioEditor, type StudioInitial } from "@/components/architecture/studio-editor";

export const metadata = { title: "New architecture" };

export default async function NewDiagram({ searchParams }: { searchParams: Promise<{ concept?: string; text?: string; topic?: string }> }) {
  const user = await requireUser();
  const { concept, text, topic } = await searchParams;
  const topics = await topicOptions(user.id);
  let initial: StudioInitial = { title: "Untitled architecture", description: "", provider: "aws", topicId: null, graph: emptyGraph(), assumptions: [] };
  const c = concept ? conceptGraph(concept) : undefined;
  if (c) initial = { ...initial, title: c.concept.title, description: c.concept.summary, provider: c.concept.provider, graph: c.graph, assumptions: c.assumptions };
  else if (text) {
    const parsed = parseRequest(text.slice(0, 2000));
    const r = generate(parsed);
    initial = { ...initial, title: text.slice(0, 80), provider: parsed.provider, graph: r.graph, assumptions: r.assumptions, questions: r.questions, added: r.added };
  }
  if (topic && topics.some((t) => t.id === topic)) initial.topicId = topic;
  return <StudioEditor initial={initial} topics={topics} />;
}
