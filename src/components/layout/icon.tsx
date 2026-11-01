import {
  Activity, Bookmark, Box, Boxes, Cloud, CloudCog, Cpu, Database, FileCode, FileUp, FlaskConical, GitBranch, Globe,
  HardDrive, LayoutDashboard, LifeBuoy, Network, NotebookPen, PiggyBank, Play, Route, Settings, Shield, Siren, Sparkles,
  Split, Terminal, Truck, Waypoints, Workflow, Folder, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity, bookmark: Bookmark, box: Box, boxes: Boxes, cloud: Cloud, "cloud-cog": CloudCog, cpu: Cpu,
  database: Database, "file-code": FileCode, "file-up": FileUp, flask: FlaskConical, "git-branch": GitBranch, globe: Globe,
  "hard-drive": HardDrive, "layout-dashboard": LayoutDashboard, "life-buoy": LifeBuoy, network: Network,
  "notebook-pen": NotebookPen, "piggy-bank": PiggyBank, play: Play, route: Route, settings: Settings, shield: Shield,
  siren: Siren, sparkles: Sparkles, split: Split, terminal: Terminal, truck: Truck, waypoints: Waypoints, workflow: Workflow,
};

export function Icon({ name, className }: { name?: string | null; className?: string }) {
  const C = (name && ICONS[name]) || Folder;
  return <C className={className} aria-hidden />;
}
