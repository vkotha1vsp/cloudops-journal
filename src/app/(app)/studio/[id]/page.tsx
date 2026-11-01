import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { getDiagram } from "@/server/diagrams";
import { topicOptions } from "@/server/topics";
import { recordView } from "@/server/bookmarks";
import { StudioEditor } from "@/components/architecture/studio-editor";

export default async function DiagramPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let d;
  try {
    d = await getDiagram(user.id, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const [topics] = await Promise.all([topicOptions(user.id), recordView(user.id, "DIAGRAM", id, d.title, `/studio/${id}`)]);
  return (
    <StudioEditor
      key={`${d.id}`}
      topics={topics}
      initial={{
        id: d.id, title: d.title, description: d.description ?? "", provider: d.provider, topicId: d.topic?.id ?? null, graph: d.graph,
        assumptions: d.assumptions, currentVersion: d.currentVersion, pages: d.pages,
        versions: d.versions.map((v) => ({ version: v.version, note: v.note, createdAt: v.createdAt.toISOString() })),
      }}
    />
  );
}
