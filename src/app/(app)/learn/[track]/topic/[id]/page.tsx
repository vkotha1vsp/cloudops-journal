import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { getTopic } from "@/server/topics";
import { isBookmarked, recordView } from "@/server/bookmarks";
import { slugFromTrack } from "@/domain/tracks";
import { TopicView } from "@/components/learn/topic-view";

export default async function TopicPage({ params }: { params: Promise<{ track: string; id: string }> }) {
  const user = await requireUser();
  const { id, track } = await params;
  let topic;
  try {
    topic = await getTopic(user.id, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  if (slugFromTrack(topic.category.track) !== track) notFound();
  const [bookmarked] = await Promise.all([
    isBookmarked(user.id, "TOPIC", id),
    recordView(user.id, "TOPIC", id, topic.title, `/learn/${track}/topic/${id}`),
  ]);
  const progress = topic.progress[0];
  return (
    <TopicView
      key={topic.id}
      bookmarked={bookmarked}
      topic={{
        id: topic.id,
        title: topic.title,
        summary: topic.summary,
        categoryName: topic.category.parent ? `${topic.category.parent.name} › ${topic.category.name}` : topic.category.name,
        sections: topic.sections,
        updatedAt: topic.updatedAt.toISOString(),
        pages: topic.pages.map((p) => ({ id: p.id, title: p.title, status: p.status, updatedAt: p.updatedAt.toISOString() })),
        progress: {
          status: progress?.status ?? "NOT_STARTED",
          confidence: progress?.confidence ?? 0,
          nextReviewAt: progress?.nextReviewAt?.toISOString() ?? null,
        },
      }}
    />
  );
}
