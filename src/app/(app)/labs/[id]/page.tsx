import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getLab } from "@/server/labs";
import { topicOptions } from "@/server/topics";
import { listDiagrams } from "@/server/diagrams";
import { recordView } from "@/server/bookmarks";
import { LAB_TEMPLATES } from "@/domain/labs/templates";
import { LabEditor, type LabData } from "@/components/labs/lab-editor";

export const metadata = { title: "Lab" };

export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lab = await getLab(user.id, id).catch(() => null);
  if (!lab) notFound();
  const [topics, diagrams] = await Promise.all([topicOptions(user.id), listDiagrams(user.id)]);
  await recordView(user.id, "LAB", lab.id, lab.title, `/labs/${lab.id}`);
  const conceptId = LAB_TEMPLATES.find((t) => t.title === lab.title)?.conceptId;
  const initial: LabData = {
    ...lab,
    checklist: Array.isArray(lab.checklist) ? (lab.checklist as LabData["checklist"]) : [],
    steps: lab.steps.map((s) => ({ title: s.title, instruction: s.instruction, commands: s.commands, expected: s.expected, actual: s.actual, done: s.done })),
    startedAt: lab.startedAt?.toISOString() ?? null,
    completedAt: lab.completedAt?.toISOString() ?? null,
  };
  return <LabEditor initial={initial} topics={topics} diagrams={diagrams.map((d) => ({ id: d.id, title: d.title }))} conceptId={conceptId} />;
}
