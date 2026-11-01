import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { labOptions } from "@/server/labs";
import { listDiagrams } from "@/server/diagrams";
import { CaseEditor, type CaseData } from "@/components/troubleshooting/case-editor";

export const metadata = { title: "New troubleshooting case" };

export default async function NewCase({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const user = await requireUser();
  const { lab: labId } = await searchParams;
  const [labs, diagrams, lab] = await Promise.all([
    labOptions(user.id),
    listDiagrams(user.id),
    labId ? db().lab.findFirst({ where: { id: labId, ownerId: user.id } }) : null,
  ]);
  const initial: CaseData = {
    title: lab ? `${lab.title}: ` : "",
    errorMessage: lab?.errorsEncountered ?? "",
    area: "aws",
    services: [],
    symptoms: lab?.observations ?? "",
    rootCause: lab?.rootCause ?? "",
    investigation: "",
    resolution: lab?.resolution ?? "",
    verification: "",
    prevention: "",
    labIds: lab ? [lab.id] : [],
    diagramIds: lab?.diagramId ? [lab.diagramId] : [],
  };
  return <CaseEditor initial={initial} labs={labs} diagrams={diagrams.map((d) => ({ id: d.id, title: d.title }))} />;
}
