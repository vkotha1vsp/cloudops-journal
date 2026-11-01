import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCase } from "@/server/cases";
import { labOptions } from "@/server/labs";
import { listDiagrams } from "@/server/diagrams";
import { recordView } from "@/server/bookmarks";
import { CaseEditor, type CaseData } from "@/components/troubleshooting/case-editor";

export const metadata = { title: "Troubleshooting case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await getCase(user.id, id).catch(() => null);
  if (!c) notFound();
  const [labs, diagrams] = await Promise.all([labOptions(user.id), listDiagrams(user.id)]);
  await recordView(user.id, "TROUBLESHOOTING", c.id, c.title, `/troubleshooting/${c.id}`);
  const initial: CaseData = {
    title: c.title, errorMessage: c.errorMessage, area: c.area as CaseData["area"], services: c.services, symptoms: c.symptoms, rootCause: c.rootCause,
    investigation: c.investigation, resolution: c.resolution, verification: c.verification, prevention: c.prevention,
    labIds: c.labs.map((l) => l.id), diagramIds: c.diagrams.map((d) => d.id),
  };
  return <CaseEditor key={c.updatedAt.toISOString()} id={c.id} initial={initial} labs={labs} diagrams={diagrams.map((d) => ({ id: d.id, title: d.title }))} />;
}
