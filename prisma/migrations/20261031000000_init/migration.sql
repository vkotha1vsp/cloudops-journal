-- CreateEnum
CREATE TYPE "Track" AS ENUM ('AWS', 'AZURE', 'DEVOPS', 'GENERAL');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'REVIEWING', 'MASTERED');

-- CreateEnum
CREATE TYPE "LabStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSED', 'SAVED', 'FAILED');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PAGE', 'TOPIC', 'DIAGRAM', 'LAB', 'TROUBLESHOOTING', 'CATEGORY');

-- CreateEnum
CREATE TYPE "StepOutcome" AS ENUM ('OK', 'REJECTED', 'FAILED', 'FAILOVER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "cognitoSub" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "track" "Track" NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "plainText" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalPage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentId" TEXT,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "content" JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}',
    "plainText" TEXT NOT NULL DEFAULT '',
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalPageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "plainText" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalPageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageTag" (
    "pageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PageTag_pkey" PRIMARY KEY ("pageId","tagId")
);

-- CreateTable
CREATE TABLE "ArchitectureDiagram" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'aws',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchitectureDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureDiagramVersion" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchitectureDiagramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureNode" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "boundaryId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ArchitectureNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchitectureEdge" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "protocol" TEXT,
    "port" INTEGER,
    "label" TEXT,

    CONSTRAINT "ArchitectureEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimationScenario" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimationScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimationStep" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "nodeKeys" TEXT[],
    "edgeKeys" TEXT[],
    "outcome" "StepOutcome" NOT NULL DEFAULT 'OK',
    "durationMs" INTEGER NOT NULL DEFAULT 1500,

    CONSTRAINT "AnimationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "topicId" TEXT,
    "diagramId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "objective" TEXT NOT NULL DEFAULT '',
    "prerequisites" TEXT NOT NULL DEFAULT '',
    "estimatedCost" TEXT,
    "expectedResults" TEXT NOT NULL DEFAULT '',
    "observations" TEXT NOT NULL DEFAULT '',
    "errorsEncountered" TEXT NOT NULL DEFAULT '',
    "rootCause" TEXT NOT NULL DEFAULT '',
    "resolution" TEXT NOT NULL DEFAULT '',
    "cleanup" TEXT NOT NULL DEFAULT '',
    "terraform" TEXT NOT NULL DEFAULT '',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "status" "LabStatus" NOT NULL DEFAULT 'PLANNED',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabStep" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL DEFAULT '',
    "commands" TEXT NOT NULL DEFAULT '',
    "expected" TEXT NOT NULL DEFAULT '',
    "actual" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LabStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TroubleshootingCase" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "services" TEXT[],
    "symptoms" TEXT NOT NULL DEFAULT '',
    "rootCause" TEXT NOT NULL DEFAULT '',
    "investigation" TEXT NOT NULL DEFAULT '',
    "resolution" TEXT NOT NULL DEFAULT '',
    "verification" TEXT NOT NULL DEFAULT '',
    "prevention" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TroubleshootingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "pageId" TEXT,
    "labId" TEXT,
    "caseId" TEXT,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploaded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "pageId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "s3Key" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "extracted" JSONB,
    "detected" JSONB,
    "warnings" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentView" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProgress" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3),
    "lastReviewAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "topicId" TEXT,
    "pageId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "output" TEXT,
    "grounded" JSONB,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PageDiagrams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PageDiagrams_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PageLabs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PageLabs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CaseDiagrams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CaseDiagrams_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CaseLabs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CaseLabs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_cognitoSub_key" ON "User"("cognitoSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_ownerId_slug_key" ON "Workspace"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "Category_ownerId_track_idx" ON "Category"("ownerId", "track");

-- CreateIndex
CREATE UNIQUE INDEX "Category_ownerId_track_parentId_slug_key" ON "Category"("ownerId", "track", "parentId", "slug");

-- CreateIndex
CREATE INDEX "Topic_ownerId_idx" ON "Topic"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_categoryId_slug_key" ON "Topic"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "JournalPage_ownerId_updatedAt_idx" ON "JournalPage"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "JournalPage_parentId_idx" ON "JournalPage"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalPage_ownerId_slug_key" ON "JournalPage"("ownerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "JournalPageVersion_pageId_version_key" ON "JournalPageVersion"("pageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_name_key" ON "Tag"("ownerId", "name");

-- CreateIndex
CREATE INDEX "PageTag_tagId_idx" ON "PageTag"("tagId");

-- CreateIndex
CREATE INDEX "ArchitectureDiagram_ownerId_updatedAt_idx" ON "ArchitectureDiagram"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArchitectureDiagramVersion_diagramId_version_key" ON "ArchitectureDiagramVersion"("diagramId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ArchitectureNode_diagramId_key_key" ON "ArchitectureNode"("diagramId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ArchitectureEdge_diagramId_key_key" ON "ArchitectureEdge"("diagramId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AnimationScenario_diagramId_mode_key" ON "AnimationScenario"("diagramId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "AnimationStep_scenarioId_order_key" ON "AnimationStep"("scenarioId", "order");

-- CreateIndex
CREATE INDEX "Lab_ownerId_status_idx" ON "Lab"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Lab_ownerId_slug_key" ON "Lab"("ownerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "LabStep_labId_order_key" ON "LabStep"("labId", "order");

-- CreateIndex
CREATE INDEX "TroubleshootingCase_ownerId_area_idx" ON "TroubleshootingCase"("ownerId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_s3Key_key" ON "Attachment"("s3Key");

-- CreateIndex
CREATE INDEX "Attachment_ownerId_idx" ON "Attachment"("ownerId");

-- CreateIndex
CREATE INDEX "Import_ownerId_createdAt_idx" ON "Import"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_ownerId_entityType_entityId_key" ON "Bookmark"("ownerId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "RecentView_ownerId_viewedAt_idx" ON "RecentView"("ownerId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentView_ownerId_entityType_entityId_key" ON "RecentView"("ownerId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "LearningProgress_ownerId_nextReviewAt_idx" ON "LearningProgress"("ownerId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningProgress_ownerId_topicId_key" ON "LearningProgress"("ownerId", "topicId");

-- CreateIndex
CREATE INDEX "AIJob_ownerId_createdAt_idx" ON "AIJob"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "_PageDiagrams_B_index" ON "_PageDiagrams"("B");

-- CreateIndex
CREATE INDEX "_PageLabs_B_index" ON "_PageLabs"("B");

-- CreateIndex
CREATE INDEX "_CaseDiagrams_B_index" ON "_CaseDiagrams"("B");

-- CreateIndex
CREATE INDEX "_CaseLabs_B_index" ON "_CaseLabs"("B");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPage" ADD CONSTRAINT "JournalPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPage" ADD CONSTRAINT "JournalPage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "JournalPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPage" ADD CONSTRAINT "JournalPage_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPageVersion" ADD CONSTRAINT "JournalPageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "JournalPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPageVersion" ADD CONSTRAINT "JournalPageVersion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTag" ADD CONSTRAINT "PageTag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "JournalPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTag" ADD CONSTRAINT "PageTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureDiagram" ADD CONSTRAINT "ArchitectureDiagram_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureDiagram" ADD CONSTRAINT "ArchitectureDiagram_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureDiagramVersion" ADD CONSTRAINT "ArchitectureDiagramVersion_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ArchitectureDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureNode" ADD CONSTRAINT "ArchitectureNode_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ArchitectureDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureEdge" ADD CONSTRAINT "ArchitectureEdge_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ArchitectureDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureEdge" ADD CONSTRAINT "ArchitectureEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ArchitectureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchitectureEdge" ADD CONSTRAINT "ArchitectureEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ArchitectureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimationScenario" ADD CONSTRAINT "AnimationScenario_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ArchitectureDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimationStep" ADD CONSTRAINT "AnimationStep_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "AnimationScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "ArchitectureDiagram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabStep" ADD CONSTRAINT "LabStep_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingCase" ADD CONSTRAINT "TroubleshootingCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "JournalPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TroubleshootingCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "JournalPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentView" ADD CONSTRAINT "RecentView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "JournalPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PageDiagrams" ADD CONSTRAINT "_PageDiagrams_A_fkey" FOREIGN KEY ("A") REFERENCES "ArchitectureDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PageDiagrams" ADD CONSTRAINT "_PageDiagrams_B_fkey" FOREIGN KEY ("B") REFERENCES "JournalPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PageLabs" ADD CONSTRAINT "_PageLabs_A_fkey" FOREIGN KEY ("A") REFERENCES "JournalPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PageLabs" ADD CONSTRAINT "_PageLabs_B_fkey" FOREIGN KEY ("B") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseDiagrams" ADD CONSTRAINT "_CaseDiagrams_A_fkey" FOREIGN KEY ("A") REFERENCES "ArchitectureDiagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseDiagrams" ADD CONSTRAINT "_CaseDiagrams_B_fkey" FOREIGN KEY ("B") REFERENCES "TroubleshootingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseLabs" ADD CONSTRAINT "_CaseLabs_A_fkey" FOREIGN KEY ("A") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaseLabs" ADD CONSTRAINT "_CaseLabs_B_fkey" FOREIGN KEY ("B") REFERENCES "TroubleshootingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
