import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { trackFromSlug } from "@/domain/tracks";
import { getTree } from "@/server/categories";
import { TreePanel } from "./tree-panel";

export default async function TrackLayout({ children, params }: { children: React.ReactNode; params: Promise<{ track: string }> }) {
  const { track: slug } = await params;
  const track = trackFromSlug(slug);
  if (!track) notFound();
  const user = await requireUser();
  const tree = await getTree(user.id, track.key);
  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <TreePanel tree={tree} track={track.key} trackSlug={slug} label={track.label} />
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
