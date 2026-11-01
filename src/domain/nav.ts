export type NavItem = { href: string; label: string; icon: string; phase?: number };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/learn/aws", label: "My AWS Learning Journey", icon: "cloud" },
  { href: "/learn/azure", label: "My Azure Learning Journey", icon: "cloud-cog" },
  { href: "/learn/devops", label: "DevOps Fundamentals", icon: "terminal" },
  { href: "/studio", label: "Architecture Studio", icon: "network" },
  { href: "/flows", label: "Animated Process Flows", icon: "play" },
  { href: "/journal", label: "My Technical Journal", icon: "notebook-pen" },
  { href: "/labs", label: "Hands-On Labs", icon: "flask" },
  { href: "/troubleshooting", label: "Troubleshooting KB", icon: "siren" },
  { href: "/import", label: "Document Import Center", icon: "file-up" },
  { href: "/roadmaps", label: "Learning Roadmaps", icon: "route" },
  { href: "/assistant", label: "AI Assistant", icon: "sparkles" },
  { href: "/bookmarks", label: "Saved & Bookmarks", icon: "bookmark" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
