# CloudOps Journal

A self-hosted DevOps learning platform: a private technical journal, AWS / Azure / DevOps knowledge trees,
an interactive architecture studio, animated request-flow simulations, hands-on labs, a troubleshooting
knowledge base, ChatGPT document import, learning roadmaps and an optional AI assistant grounded in your journal.
It runs entirely in your own AWS account on your own domain.

**Status: Phases 1–6 delivered** (Phase 6 hosting is live on EC2 + CodeBuild; the ECS Fargate Terraform path is also included).

| Doc | What's in it |
|---|---|
| [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | System design, repo structure, schema, wireframes, graph model, milestones |
| [docs/02-PHASE-1.md](docs/02-PHASE-1.md) | What Phase 1 delivers, where it lives, how to verify it |
| [docs/03-DEPLOYMENT.md](docs/03-DEPLOYMENT.md) | Deploy to AWS: ECS Fargate (Terraform) or a single EC2 |
| [docs/04-OPERATIONS.md](docs/04-OPERATIONS.md) | Backups, recovery procedures, maintenance, cleanup |
| [docs/05-EC2-CODEBUILD.md](docs/05-EC2-CODEBUILD.md) | **Active deploy path:** GitHub Actions → CodeBuild → ECR → EC2 behind ALB/ACM with Cognito login |
| [docs/06-CONSOLE-SETUP.md](docs/06-CONSOLE-SETUP.md) | The same stack built by hand in the AWS Console |
| [docs/07-phases-2-5.md](docs/07-phases-2-5.md) | Studio, animated flows, import, AI assistant, labs, troubleshooting, roadmaps; how to update the live site and enable Bedrock |

## Stack

Next.js 15 (App Router, TypeScript) · React 19 · Tailwind + shadcn/ui-style components · Tiptap ·
PostgreSQL 16 + Prisma 7 · NextAuth with Amazon Cognito · S3 presigned uploads · Docker ·
Terraform (VPC, ALB, ACM, Route 53, ECS Fargate, RDS, S3, Cognito, Secrets Manager, CloudWatch) ·
GitHub Actions with OIDC.

React Flow (XYFlow) for diagrams, Framer Motion for flow animation, Mermaid (strict mode) for diagram-as-code,
mammoth / unpdf / marked / sanitize-html for imports, Amazon Bedrock (optional) for the assistant.

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
infra/ec2-terraform/  EC2 + CodeBuild stack (default deploy) · infra/terraform/  ECS Fargate · infra/ec2-compose/  manual EC2
.github/workflows/  ci.yml, deploy-ec2.yml (push to main), deploy.yml (ECS, manual)
buildspec.yml       CodeBuild: build images, push to ECR
```

## Security model (summary)

Private by default, single allow-listed admin, Cognito with optional TOTP MFA, owner checks in every query,
same-origin enforcement on all writes, rate limits, strict input schemas, no raw HTML rendering,
private encrypted S3 with 5-minute presigned URLs, RDS in isolated subnets with TLS enforced,
secrets only in Secrets Manager / environment, least-privilege task role, and GitHub deploys via OIDC
(no stored AWS keys). Nothing in the app creates or changes AWS infrastructure.

## What's next

Ideas beyond the spec: semantic (embedding) search alongside full-text, publishing selected pages read-only,
and an approved-integration API for pushing structured pages into the journal.
