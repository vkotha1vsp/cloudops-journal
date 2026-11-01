# CloudOps Journal — System Design

This document covers the seven planning deliverables from Section 20 of the master prompt:
system architecture, repository structure, database schema, navigation and wireframes,
the architecture graph model, milestones, and local development.

---

## 1. High-level system architecture

```
                         ┌──────────────────────────────────────────────┐
  Browser ──HTTPS──▶ Route 53 (learn.<your-domain>)  — DNS only, never a hop
     │                                                 
     ▼                                                 
  ┌───────────────────────── AWS account (yours) ─────────────────────────────┐
  │                                                                           │
  │   ACM cert ──▶ Application Load Balancer (public subnets, 2 AZs)          │
  │                 listener :443 → rule → target group (ip, :3000)           │
  │                 listener :80  → redirect to :443                          │
  │                         │  health check GET /api/health                   │
  │                         ▼                                                 │
  │   ECS Fargate service (private subnets, 2 AZs)                            │
  │     └─ container: Next.js 15 (App Router)                                 │
  │          ├─ React UI (server + client components)                         │
  │          ├─ Route handlers  /api/*  (zod validation, ownership checks)    │
  │          ├─ NextAuth → Amazon Cognito Hosted UI (OIDC)                    │
  │          ├─ Prisma ORM ──────────────▶ RDS PostgreSQL 16 (private,       │
  │          │                               encrypted, 7-day backups)        │
  │          ├─ AWS SDK (task role) ─────▶ S3 attachments bucket (private,    │
  │          │                               presigned URLs, SSE)             │
  │          └─ Bedrock (Phase 4) ───────▶ Amazon Bedrock runtime             │
  │                                                                           │
  │   Secrets Manager: DB URL, NEXTAUTH_SECRET, Cognito client secret         │
  │   CloudWatch Logs + alarms     ECR: container images                      │
  └───────────────────────────────────────────────────────────────────────────┘

  GitHub Actions: test → build image → push ECR → register task def → ECS deploy
  (GitHub OIDC role, no long-lived AWS keys)
```

### Design principles

| Concern | Decision |
|---|---|
| Single deployable | One Next.js app serves UI and API. No separate backend service until a real need appears. |
| Authorization | Every query is scoped by `ownerId` in a service layer (`src/server/*`). Route handlers never query Prisma directly. |
| Content model | Journal content stored as Tiptap JSON (lossless, editable) **plus** a derived `plainText` column feeding Postgres full-text search. |
| Search | Postgres `tsvector` generated columns + GIN indexes (Phase 1). `pgvector` semantic search slots in later without schema rewrites. |
| Files | Never proxied through the app. Browser uploads directly to S3 using short-lived presigned PUT URLs after server-side type/size checks. |
| Diagrams | Stored as a normalized graph (nodes/edges tables) and a JSON snapshot per version, so diagrams are both queryable and exactly restorable. |
| Simulations | Deterministic step models in the DB, never live AWS calls. UI labels every animation "Simulation". |
| AI | Server-only provider interface (Bedrock default, OpenAI optional). AI output is always a draft requiring approval; nothing it produces is executed. |

---

## 2. Repository structure

```
cloudops-journal/
├── docs/                         design, deployment, backup/recovery, cleanup
├── prisma/
│   ├── schema.prisma             full data model (all 21+ entities)
│   ├── migrations/               SQL migrations incl. full-text search columns
│   └── seed.ts                   AWS/Azure/DevOps trees, sample pages
├── src/
│   ├── app/
│   │   ├── (app)/                authenticated shell (sidebar layout)
│   │   │   ├── dashboard/
│   │   │   ├── learn/[track]/    aws | azure | devops knowledge trees
│   │   │   ├── journal/          page list, editor, versions
│   │   │   ├── search/
│   │   │   ├── bookmarks/
│   │   │   ├── settings/
│   │   │   └── …                 studio, flows, labs, troubleshooting, import, roadmaps (later phases)
│   │   ├── api/                  route handlers
│   │   ├── login/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                   shadcn/ui primitives
│   │   ├── layout/               sidebar, topbar, theme toggle
│   │   ├── journal/              Tiptap editor + toolbar
│   │   └── learn/                category tree
│   ├── lib/                      auth, prisma client, env, validation, rate limit, utils
│   ├── server/                   service layer: owner-scoped data access
│   └── domain/                   pure logic: tiptap text extraction, slugs, graph model (Phase 2)
├── tests/                        vitest unit + API tests
├── infra/
│   ├── terraform/                Option B: VPC, ALB, ECS, RDS, S3, Cognito, ACM, Route 53
│   └── ec2-compose/              Option A: Caddy + compose for a single EC2
├── .github/workflows/            ci.yml, deploy.yml
├── Dockerfile
├── docker-compose.yml            local dev: postgres + app
└── .env.example
```

---

## 3. Database schema (summary)

Full definition: `prisma/schema.prisma`. Every content table carries `ownerId` (or reaches it through a
parent with `onDelete: Cascade`) so ownership checks are a single `where` clause.

| Entity | Purpose | Key relations |
|---|---|---|
| `User` | Cognito subject + profile | owns everything |
| `Workspace` | Container for future multi-workspace / publishing | User 1–n |
| `Category` | Unlimited nested tree per track (AWS, AZURE, DEVOPS, GENERAL) | self-relation `parentId` |
| `Topic` | A learning subject (e.g. "Application Load Balancer") with 18 structured sections in `sections` JSON | Category n–1, pages, diagrams, labs |
| `JournalPage` | Rich page: Tiptap JSON + plainText + status + nesting | self-relation, Topic, Tags, versions |
| `JournalPageVersion` | Immutable snapshot on each explicit save / autosave checkpoint | JournalPage n–1 |
| `ArchitectureDiagram` | Diagram metadata + current version | Topic, versions |
| `ArchitectureDiagramVersion` | Exact JSON snapshot of a graph version | diagram n–1 |
| `ArchitectureNode` / `ArchitectureEdge` | Normalized graph of current version | diagram n–1 |
| `AnimationScenario` / `AnimationStep` | Deterministic simulation steps per scenario | diagram n–1 |
| `Lab` / `LabStep` | Lab notebook | Topic, diagram |
| `TroubleshootingCase` | Error → root cause → fix, searchable | diagrams, labs |
| `Attachment` | S3 object metadata (key, mime, size, checksum) | page/lab/case |
| `Import` | Upload → parse → preview → saved page, with source attribution | page |
| `Tag` / `PageTag` | Tagging (owner-unique tag names) | many-to-many |
| `Bookmark` | Polymorphic bookmark (entityType + entityId) | user |
| `LearningProgress` | Status, confidence, next review date per topic | topic, user |
| `Reference` | Source links for topics/pages | topic / page |
| `AIJob` | Audit trail of AI requests and drafts | user |
| `RecentView` | Recently viewed list | user |

Full-text search: generated `search_vector` columns on `JournalPage`, `Topic`, `TroubleshootingCase`,
`Lab`, `ArchitectureDiagram`, each with a GIN index (see the `fulltext_search` migration).

---

## 4. Navigation and wireframes

```
┌────────────────┬──────────────────────────────────────────────────────────────┐
│ ☁ CloudOps     │  🔍 Search everything…  (⌘K)              ☀/☾   avatar ▾    │
│ Journal        ├──────────────────────────────────────────────────────────────┤
│                │  Good evening, Vivek                                         │
│ ▣ Dashboard    │  ┌──────────────┬──────────────┬──────────────┬───────────┐  │
│ ◆ AWS Journey  │  │ Pages  42    │ Topics 61    │ Reviewing 7  │ Labs  3   │  │
│ ◇ Azure Journey│  └──────────────┴──────────────┴──────────────┴───────────┘  │
│ ⚙ DevOps Fund. │  ┌ Recently edited ───────────┐ ┌ Due for review ─────────┐  │
│ ⬡ Arch. Studio │  │ ALB health checks   2h ago │ │ NAT Gateway   overdue   │  │
│ ▶ Process Flows│  │ VPC endpoints notes  1d    │ │ IAM policies  today     │  │
│ ✎ Journal      │  └────────────────────────────┘ └─────────────────────────┘  │
│ ⚗ Labs         │  ┌ AWS topics ──────┐ ┌ Azure topics ─┐ ┌ Quick actions ──┐  │
│ ⚠ Troubleshoot │  │ Compute  ▓▓▓░ 60%│ │ Networking …  │ │ + New page      │  │
│ ⇪ Import       │  │ Network  ▓▓░░ 40%│ │               │ │ ⬡ Generate arch │  │
│ ⇢ Roadmaps     │  └──────────────────┘ └───────────────┘ │ ⇪ Paste ChatGPT │  │
│ ★ Bookmarks    │                                         └─────────────────┘  │
│ ⚙ Settings     │                                                              │
└────────────────┴──────────────────────────────────────────────────────────────┘

Learning journey (AWS / Azure / DevOps):
┌ Tree ─────────────────┬ Topic: Application Load Balancer ──────────── ★  ✎ ┐
│ ▾ Load Balancing      │ status: Learning · confidence 3/5 · review Nov 7    │
│    ▸ ALB  ●           │ [Concept][Why][Diagram][Flow][Terms][Console][CLI]  │
│    ▸ NLB              │ [Terraform][Security][Cost][Errors][Troubleshoot]…  │
│    ▸ Target Groups    │ ─────────────────────────────────────────────────── │
│ ▸ Networking          │  section editor (Tiptap)                            │
│ + Category  + Topic   │  Linked pages · diagrams · labs                     │
└───────────────────────┴─────────────────────────────────────────────────────┘

Journal editor:
┌ Pages ───────────────┬ Title ……………………………  Draft ▾   Saved ✓ 2s   ⋯ History ┐
│ ▾ Networking notes   │ [B][I][code][H1][H2][•][1.][☐][table][</>][link][❝]  │
│    ▸ VPC endpoints   │                                                      │
│ ▸ Interview prep     │  rich content…                                       │
│ + New page           │  Tags: #alb #health-check  + tag                     │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

Sidebar entries for modules from later phases render a clearly labeled "Coming in Phase N" page,
never a fake mockup of the feature.

---

## 5. Architecture graph data model (Phase 2 contract, defined now)

```ts
type Provider = "aws" | "azure" | "generic";

interface ArchNode {
  id: string;
  kind: ServiceKind;            // "route53" | "alb" | "target-group" | "ec2" | "rds" | "security-group" | …
  role: "traffic" | "config" | "boundary-member";  // config = SG, target group, route table
  label: string;
  boundaryId?: string;          // innermost container (subnet → az → vpc → region)
  config: Record<string, unknown>; // ports, protocol, instance type, health check path…
  position: { x: number; y: number };
}

interface Boundary { id: string; kind: "region" | "vpc" | "az" | "subnet-public" | "subnet-private";
                     parentId?: string; label: string; }

interface ArchEdge {
  id: string; source: string; target: string;
  relation: "dns-resolves" | "routes-to" | "forwards-to" | "registers" | "attached-to"
          | "health-checks" | "connects" | "replicates" | "failover";
  protocol?: "HTTP" | "HTTPS" | "TCP" | "DNS" | "PostgreSQL" | "MySQL";
  port?: number;
}

interface ValidationResult { level: "error" | "warning" | "assumption"; message: string;
                             nodeIds?: string[]; edgeIds?: string[]; rule: string; }
```

Validation rules encode the accuracy requirements, for example:

- `attached-to` edges from a Security Group are the only edges a SG may have; a SG may never be the
  `source` or `target` of `routes-to` / `forwards-to`.
- A Target Group may only be the target of `forwards-to` from an ALB/NLB listener rule, and the
  source of `registers` to compute.
- Route 53 may only emit `dns-resolves` edges, drawn as dashed lines, and the request animation
  goes from client → load balancer after resolution, not through Route 53.
- `health-checks` edges are rendered separately from user traffic.
- A node in a private subnet with an internet-bound `routes-to` edge raises an error unless a NAT
  gateway or VPC endpoint is present.

Animation steps reference node and edge IDs and carry a `title`, `explanation`, and `outcome`
(`ok | rejected | failed | failover`), making every scenario deterministic and replayable.

---

## 6. Development milestones

| Phase | Scope | Exit criteria |
|---|---|---|
| **1** (this delivery) | Auth (Cognito + local dev login), dashboard, schema + migrations, category trees, topics with 18 sections, journal editor with autosave + versions + tags, bookmarks, recent views, Postgres FTS | Runs locally and on AWS; journal pages created, edited, versioned and found via search |
| 2 | Architecture Studio: service palette, rule-based generator, graph validation, React Flow editing, undo/redo, versions, SVG/PNG/JSON/Mermaid export | Scenario A, C, D, F |
| 3 | Animation engine + seven simulation modes | Scenario B |
| 4 | Import Center (MD/DOCX/PDF/TXT/HTML/JSON/Mermaid), Paste-from-ChatGPT, AI assistant (Bedrock) | Scenario E |
| 5 | Labs (10 templates), troubleshooting KB, roadmaps | Scenario G |
| 6 | Hardening: WAF, alarms, backup drills, publish selected articles | Scenario H (infra already delivered with Phase 1) |

AWS hosting (Terraform, Docker, CI/CD) is delivered now, ahead of Phase 6, so every later phase
ships through the same pipeline.

---

## 7. Local development

See the README "Run locally" section. Summary:

```bash
cp .env.example .env                 # AUTH_DEV_LOGIN=true for local sign-in
docker compose up -d db              # Postgres 16 on :5432
npm install
npx prisma migrate deploy && npm run db:seed
npm run dev                          # http://localhost:3000
```
