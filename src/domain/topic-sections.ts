/** The 18 structured sections every learning topic has (Section 4 of the spec). */
export const TOPIC_SECTIONS = [
  { key: "concept", label: "Concept", hint: "What is it, in your own words?" },
  { key: "why", label: "Why it exists", hint: "Which problem does this service solve?" },
  { key: "diagram", label: "Architecture diagram", hint: "Notes on the diagram. Interactive diagrams arrive with Architecture Studio (Phase 2)." },
  { key: "flow", label: "Request / process flow", hint: "Describe the request path step by step. Animated flows arrive in Phase 3." },
  { key: "terminology", label: "Terminology", hint: "Key terms and definitions." },
  { key: "dependencies", label: "Dependencies & relationships", hint: "What it depends on and what depends on it." },
  { key: "console", label: "Console implementation", hint: "Click-path in the cloud console." },
  { key: "cli", label: "CLI commands", hint: "Commands you used, with output." },
  { key: "terraform", label: "Terraform", hint: "Resource blocks and gotchas." },
  { key: "security", label: "Security considerations", hint: "IAM, encryption, network exposure." },
  { key: "cost", label: "Cost considerations", hint: "Pricing dimensions and traps." },
  { key: "errors", label: "Common errors", hint: "Error messages you have hit." },
  { key: "troubleshooting", label: "Troubleshooting", hint: "Investigation procedure." },
  { key: "examples", label: "Real-world examples", hint: "Where you have seen it used." },
  { key: "related", label: "Related topics", hint: "Links to other topics and pages." },
  { key: "observations", label: "Personal observations", hint: "What surprised you." },
  { key: "references", label: "References", hint: "Official documentation links (verify they exist)." },
  { key: "history", label: "Revision history", hint: "Change log for this topic." },
] as const;

export type SectionKey = (typeof TOPIC_SECTIONS)[number]["key"];

export const SECTION_KEYS = TOPIC_SECTIONS.map((s) => s.key) as [SectionKey, ...SectionKey[]];

export function isSectionKey(v: string): v is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(v);
}

/** Sections editable as rich text. "history" is generated from the topic's change log. */
export const EDITABLE_SECTIONS = TOPIC_SECTIONS.filter((s) => s.key !== "history");
