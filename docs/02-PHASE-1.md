# Phase 1: what was built and how to verify it

Scope from the master prompt: **authentication, dashboard, database, journal editor, categories, search.**
AWS hosting (Phase 6 infrastructure) was delivered early so every later phase ships through the same pipeline.

## Feature map

| Requirement | Where | Notes |
|---|---|---|
| Cognito authentication | `src/lib/auth.ts`, `src/app/login/` | OIDC with PKCE, state and nonce. Single-admin allow-list (`ALLOWED_EMAILS`). Local email/password login only when `AUTH_DEV_LOGIN=true`, refused at startup if Cognito is also configured |
| Server-side authorization | `src/server/*` | Every query filters by `ownerId`; route handlers never touch Prisma directly. Integration tests prove cross-user reads, writes, deletes, nesting, bookmarks and search are all blocked |
| Sessions | NextAuth JWT, 12 h | HttpOnly, SameSite=Lax cookies; Secure on HTTPS |
| CSRF | `src/lib/api.ts` `assertSameOrigin` | Mutations must carry a same-origin `Origin`/`Referer` and a JSON body |
| Rate limits | `src/lib/rate-limit.ts` | Per user, route and method (120 writes / 600 reads per minute; autosave 300) |
| Input validation | `src/lib/validation.ts`, `src/domain/tiptap.ts` | zod everywhere; editor JSON is schema-checked (strict keys, size caps) |
| Sanitization | Tiptap renders only schema nodes; links limited to https/http/mailto/internal paths (`src/domain/links.ts`); search snippets are rendered as text segments, never HTML |
| Security headers | `next.config.ts` | HSTS, nosniff, frame deny, referrer and permissions policy |
| Dashboard | `src/app/(app)/dashboard/` | Recent pages, review queue, AWS/Azure progress by category, recent architectures, active labs, saved troubleshooting, recently viewed, quick actions |
| Knowledge trees | `src/app/(app)/learn/[track]/`, `src/components/learn/` | AWS (14 categories), Azure (8), DevOps (9) created on first sign-in. Unlimited nesting; add, rename, delete in the UI |
| Learning topics | `src/components/learn/topic-view.tsx` | All 18 sections, each a rich-text editor with autosave; section 18 (revision history) is generated automatically. Status, confidence (1–5) and spaced review dates |
| Journal editor | `src/components/journal/` | Headings, lists, checklists, tables, code blocks with syntax highlighting, callouts, quotes, links; nested pages; tags; draft/published/archived; autosave with conflict detection; named versions; history with preview and non-destructive restore |
| Search | `src/server/search.ts` | PostgreSQL full-text (`websearch_to_tsquery`: phrases, OR, -exclusion) over pages, topics, labs, troubleshooting cases, diagrams and tags, with a substring fallback for exact error output. GIN indexes in `prisma/migrations/*_fulltext_search` |
| Bookmarks, recently viewed | `src/server/bookmarks.ts` | Labels and links resolved server-side from owned records |
| Attachments API | `src/server/attachments.ts` | Presigned S3 PUT/GET (5 min), MIME/extension allow-list, size cap, per-user key prefix. Editor upload UI arrives with imports in Phase 4 |
| Database | `prisma/schema.prisma` | All 21 entities from Section 14 plus `RecentView` and `ArchitectureDiagramVersion`; cascades and SetNull rules defined; Prisma migrations |
| Graph model (Phase 2 contract) | `src/domain/architecture/` | Typed nodes, edges, boundaries and validation rules, with sample AWS and Azure graphs and tests |
| Later modules | `src/app/(app)/[module]/` | Studio, flows, labs, troubleshooting, import and roadmaps show what is coming and in which phase; no fake UIs |

## Verify locally

```bash
cp .env.example .env               # set ALLOWED_EMAILS and SEED_ADMIN_EMAIL to your email
docker compose up -d db
npm install
npx prisma migrate deploy          # expected: "All migrations have been successfully applied."
npm run db:seed                    # expected: "Seed complete." (safe to re-run)
npm run dev                        # http://localhost:3000, sign in with your email + AUTH_DEV_PASSWORD
```

Automated checks:

```bash
npm run typecheck                  # no output = pass
npm run lint                       # ✔ No ESLint warnings or errors
TEST_DATABASE_URL=$DATABASE_URL npm test          # 64 tests (unit, API/service, architecture)
npm run build && npx next start &
BASE=http://localhost:3000 EMAIL=<you> PASSWORD=<AUTH_DEV_PASSWORD> ./scripts/smoke-test.sh   # 42 passed, 0 failed
```

> Use a disposable database for `TEST_DATABASE_URL`: the integration tests create and delete their own users.

## Manual walkthrough (expected results)

1. **Sign in** → dashboard with stats, review queue and AWS/Azure progress bars.
2. **My AWS Learning Journey → Load Balancing → Application Load Balancer** → seeded sections show green dots;
   click *Mark reviewed*, the review date moves forward.
3. Hover a category in the tree → **+** adds a topic, folder icon adds a sub-category, pencil renames.
4. **My Technical Journal → New page** → type, add a table and a code block. The header shows
   *Saving… → All changes saved*. Add tags with Enter.
5. **Version → name it**, edit more, open **History** (clock icon), preview v1, *Restore*. The current state is
   saved as a version first.
6. Open the same page in two tabs, edit both → the second shows *Changed elsewhere, reload* instead of
   overwriting.
7. Search `Target.ResponseCodeMismatch` (Ctrl/⌘ K) → journal page, troubleshooting case and ALB topic, with
   highlighted matches (acceptance scenario G's data path).
8. ☆ a page → appears under **Saved & Bookmarks**.
9. Toggle light/dark mode (sun/moon). Resize to phone width → sidebar becomes a menu.

## Known limits in Phase 1

- Attachments have an API but no upload button in the editor yet (Phase 4 with the Import Center).
- Mermaid diagrams, architecture embeds and animated-flow embeds in pages arrive with Phases 2–3.
- Single-user by design today; the `Workspace` and `Visibility` columns are in place for publishing later.
- The initial migration SQL was written by hand (the build sandbox could not download Prisma's migration
  engine). CI's `npm run db:drift` compares the migrated database to `schema.prisma` on every push and fails
  on any difference, so a mismatch cannot reach production unnoticed.
