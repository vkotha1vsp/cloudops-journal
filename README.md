# CloudOps Journal

A self-hosted DevOps learning platform: a private technical journal, AWS / Azure / DevOps knowledge trees,
and (in later phases) an architecture studio, animated request-flow simulations, labs, a troubleshooting
knowledge base and ChatGPT document import. It runs entirely in your own AWS account on your own domain.

**Status: Phase 1 complete** (authentication, dashboard, database, journal editor, knowledge trees, search)
plus production AWS infrastructure and CI/CD.

| Doc | What's in it |
|---|---|
| [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | System design, repo structure, schema, wireframes, graph model, milestones |
| [docs/02-PHASE-1.md](docs/02-PHASE-1.md) | What Phase 1 delivers, where it lives, how to verify it |
| [docs/03-DEPLOYMENT.md](docs/03-DEPLOYMENT.md) | Deploy to AWS: ECS Fargate (Terraform) or a single EC2 |
| [docs/04-OPERATIONS.md](docs/04-OPERATIONS.md) | Backups, recovery procedures, maintenance, cleanup |

## Stack

Next.js 15 (App Router, TypeScript) · React 19 · Tailwind + shadcn/ui-style components · Tiptap ·
PostgreSQL 16 + Prisma 7 · NextAuth with Amazon Cognito · S3 presigned uploads · Docker ·
Terraform (VPC, ALB, ACM, Route 53, ECS Fargate, RDS, S3, Cognito, Secrets Manager, CloudWatch) ·
GitHub Actions with OIDC.

React Flow, Mermaid, Framer Motion and Amazon Bedrock join in Phases 2–4, when the features that use them land.

## Run locally

Requires Node 22+ and Docker.

```bash
cp .env.example .env            # put your email in ALLOWED_EMAILS and SEED_ADMIN_EMAIL
docker compose up -d db         # PostgreSQL on localhost:5432
npm install                     # also generates the Prisma client
npx prisma migrate deploy       # create tables
npm run db:seed                 # sample pages, topic content, an ALB troubleshooting case and lab
npm run dev                     # → http://localhost:3000
```

Sign in with your email and `AUTH_DEV_PASSWORD` (local only; production uses Cognito).

Full stack in containers instead: `docker compose --profile app up --build`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run typecheck` / `lint` | Static checks |
| `npm test` | Unit, architecture-validation and (with `TEST_DATABASE_URL`) API/service tests |
| `./scripts/smoke-test.sh` | 42 end-to-end HTTP checks against a running instance |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Idempotent sample data |
| `npm run db:drift` | Fail if migrations and schema disagree (CI runs this) |
| `./scripts/deploy-manual.sh` | Build, push, migrate and deploy to ECS from your machine |

## Repository layout

```
src/app/            routes: (app)/ authenticated pages, api/ route handlers, login/
src/components/     ui/ primitives, layout/, journal/ (Tiptap editor, autosave), learn/ (tree, topics)
src/server/         owner-scoped data access: pages, topics, categories, search, bookmarks, attachments
src/domain/         pure logic: tiptap text, slugs, tracks, topic sections, architecture graph + validation
src/lib/            auth, env, db, API wrapper (auth, CSRF, rate limit, errors), S3
prisma/             schema, migrations, seed
tests/              vitest suites
infra/terraform/    Option B (production) · infra/ec2-compose/  Option A (low cost)
.github/workflows/  ci.yml, deploy.yml
```

## Security model (summary)

Private by default, single allow-listed admin, Cognito with optional TOTP MFA, owner checks in every query,
same-origin enforcement on all writes, rate limits, strict input schemas, no raw HTML rendering,
private encrypted S3 with 5-minute presigned URLs, RDS in isolated subnets with TLS enforced,
secrets only in Secrets Manager / environment, least-privilege task role, and GitHub deploys via OIDC
(no stored AWS keys). Nothing in the app creates or changes AWS infrastructure.

## Next: Phase 2

Architecture Studio: service palette and natural-language input → typed graph (`src/domain/architecture/graph.ts`,
already validated by tests) → React Flow editor with VPC/AZ/subnet boundaries, undo/redo, versions and export.
