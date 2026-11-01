export type NavItem = { href: string; label: string; icon: string; phase?: number };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/learn/aws", label: "My AWS Learning Journey", icon: "cloud" },
  { href: "/learn/azure", label: "My Azure Learning Journey", icon: "cloud-cog" },
  { href: "/learn/devops", label: "DevOps Fundamentals", icon: "terminal" },
  { href: "/studio", label: "Architecture Studio", icon: "network", phase: 2 },
  { href: "/flows", label: "Animated Process Flows", icon: "play", phase: 3 },
  { href: "/journal", label: "My Technical Journal", icon: "notebook-pen" },
  { href: "/labs", label: "Hands-On Labs", icon: "flask", phase: 5 },
  { href: "/troubleshooting", label: "Troubleshooting KB", icon: "siren", phase: 5 },
  { href: "/import", label: "Document Import Center", icon: "file-up", phase: 4 },
  { href: "/roadmaps", label: "Learning Roadmaps", icon: "route", phase: 5 },
  { href: "/bookmarks", label: "Saved & Bookmarks", icon: "bookmark" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** Planned modules: what each delivers and in which phase, shown on their placeholder pages. */
export const UPCOMING: Record<string, { title: string; phase: number; summary: string; delivers: string[] }> = {
  studio: {
    title: "Architecture Studio",
    phase: 2,
    summary: "Generate, validate and edit AWS and Azure architecture diagrams.",
    delivers: [
      "Searchable service palette and natural-language input",
      "Typed graph model with VPC / AZ / subnet boundaries",
      "Validation rules (security groups attach, target groups are config, Route 53 resolves DNS)",
      "Drag-and-drop editing, undo/redo, versions, SVG/PNG/JSON/Mermaid export",
    ],
  },
  flows: {
    title: "Animated Process Flows",
    phase: 3,
    summary: "Deterministic, step-by-step simulations of requests through saved architectures.",
    delivers: [
      "Play, pause, step, speed controls with an explanation panel",
      "Normal traffic, health-check failure, SG rejection, backend failure",
      "Multi-AZ failover, Route 53 DNS failover, routing failure",
      "Clearly labelled as simulations, not live monitoring",
    ],
  },
  labs: {
    title: "Hands-On Labs",
    phase: 5,
    summary: "A lab notebook for what you planned and what actually happened.",
    delivers: ["Ten starter templates (EC2 + Nginx through SonarQube in CI/CD)", "Steps, commands, expected vs actual, errors, root cause", "Cost estimate, validation checklist, cleanup"],
  },
  troubleshooting: {
    title: "Troubleshooting Knowledge Base",
    phase: 5,
    summary: "Searchable error → root cause → fix records linked to labs and diagrams.",
    delivers: ["Categorised by AWS, Azure, Kubernetes, Docker, Jenkins, Terraform, networking, security", "Error messages and CLI output searchable (already indexed today)"],
  },
  import: {
    title: "Document Import Center",
    phase: 4,
    summary: "Turn ChatGPT-generated documents into editable journal pages.",
    delivers: ["Markdown, DOCX, PDF, TXT, HTML, JSON and Mermaid sources", "Preview and correct before saving, with source attribution", "Paste from ChatGPT action"],
  },
  roadmaps: {
    title: "Learning Roadmaps",
    phase: 5,
    summary: "Ordered paths through your topics with progress tracking.",
    delivers: ["Roadmaps built from your own knowledge tree", "Uses the review schedule and confidence scores you record today"],
  },
};
