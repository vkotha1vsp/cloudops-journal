/** Explanatory documentation for a diagram, as a Tiptap document (used by "Save as journal page"). */
import { service } from "./catalog";
import type { ArchGraph } from "./graph";
import { validateGraph } from "./graph";
import { buildScenario } from "./scenarios";
import type { TiptapNode } from "../tiptap";
import { bullets, callout, doc, h, p } from "../tiptap";

export function diagramDocument(opts: {
  graph: ArchGraph;
  title: string;
  summary?: string;
  diagramId?: string;
  conceptId?: string;
  assumptions?: string[];
}): TiptapNode {
  const { graph } = opts;
  const embed: TiptapNode = { type: "architectureEmbed", attrs: { diagramId: opts.diagramId ?? null, conceptId: opts.conceptId ?? null } };
  const traffic = graph.nodes.filter((n) => service(n.kind).role === "traffic" && n.kind !== "client");
  const config = graph.nodes.filter((n) => service(n.kind).role === "config");
  const flow = buildScenario(graph, "normal");
  const issues = validateGraph(graph).filter((v) => v.level !== "assumption");
  const ordered: TiptapNode = {
    type: "orderedList",
    content: flow.steps.map((s) => ({ type: "listItem", content: [p(`${s.title}: ${s.explanation}`)] })),
  };
  return doc(
    ...(opts.summary ? [p(opts.summary)] : []),
    embed,
    h(2, "Components"),
    ...(traffic.length ? [bullets(...traffic.map((n) => `${n.label}: ${service(n.kind).description}`))] : []),
    ...(config.length
      ? [h(3, "Configuration attached to them"), bullets(...config.map((n) => `${n.label}: ${service(n.kind).description}`))]
      : []),
    h(2, "Request flow"),
    ...(flow.applicable ? [ordered] : [p(flow.reason ?? "")]),
    ...(opts.assumptions?.length ? [h(2, "Assumptions"), bullets(...opts.assumptions)] : []),
    ...(issues.length ? [callout("warning", `Validation: ${issues.map((i) => i.message).join(" ")}`)] : []),
    h(2, "My notes"),
    p(""),
  );
}
