-- Full-text search (Section 13, Phase 1).
-- Expression GIN indexes rather than generated columns: Prisma's schema model does not
-- represent them, so they do not show up as drift. Queries in src/server/search.ts use
-- the exact same expressions so the planner can use these indexes.

CREATE INDEX "JournalPage_fts_idx" ON "JournalPage"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("plainText", '')));

CREATE INDEX "Topic_fts_idx" ON "Topic"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("plainText", '')));

CREATE INDEX "Lab_fts_idx" ON "Lab"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("objective", '') || ' ' || coalesce("observations", '') || ' ' || coalesce("errorsEncountered", '') || ' ' || coalesce("rootCause", '') || ' ' || coalesce("resolution", '')));

CREATE INDEX "TroubleshootingCase_fts_idx" ON "TroubleshootingCase"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("errorMessage", '') || ' ' || coalesce("symptoms", '') || ' ' || coalesce("rootCause", '') || ' ' || coalesce("investigation", '') || ' ' || coalesce("resolution", '')));

CREATE INDEX "ArchitectureDiagram_fts_idx" ON "ArchitectureDiagram"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')));
