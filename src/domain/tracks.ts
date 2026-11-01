export const TRACKS = {
  aws: { key: "AWS", label: "My AWS Learning Journey", short: "AWS", color: "text-aws" },
  azure: { key: "AZURE", label: "My Azure Learning Journey", short: "Azure", color: "text-azure" },
  devops: { key: "DEVOPS", label: "DevOps Fundamentals", short: "DevOps", color: "text-devops" },
} as const;

export type TrackSlug = keyof typeof TRACKS;
export type TrackKey = (typeof TRACKS)[TrackSlug]["key"];

export function trackFromSlug(slug: string): (typeof TRACKS)[TrackSlug] | null {
  return slug in TRACKS ? TRACKS[slug as TrackSlug] : null;
}

export function slugFromTrack(key: string): TrackSlug {
  const found = (Object.keys(TRACKS) as TrackSlug[]).find((s) => TRACKS[s].key === key);
  return found ?? "aws";
}
