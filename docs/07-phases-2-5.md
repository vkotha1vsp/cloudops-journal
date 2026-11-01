# Phases 2–5: Studio, flows, import, AI, labs, troubleshooting, roadmaps

All four phases ship in the same image as Phase 1. **No database migration is needed**: the Phase 1 schema already
contained every table (diagrams, versions, nodes, edges, animation scenarios and steps, labs, lab steps, troubleshooting
cases, imports, AI jobs). Updating the live site is a normal image build + deploy (see "Updating the live site").

## Feature map

| Requirement | Where | Notes |
|---|---|---|
| **Architecture Studio, mode A** (natural language) | `src/domain/architecture/parse.ts`, `build.ts` | Recognises services, counts ("two EC2 instances") and flags (multi-AZ, private, HTTPS, engine). Adds supporting components (ALB, target group, ACM, IGW, SGs, NAT/endpoints…) and lists every addition as an assumption |
| **Mode B** (service palette) | `src/components/architecture/studio-editor.tsx` | Searchable AWS / Azure palette with counts → Generate |
| Typed graph model | `src/domain/architecture/graph.ts` | Boundaries (region, VPC/VNet, AZ, public/private subnet), nodes (traffic vs config), typed relations (`dns-resolves`, `forwards-to`, `attached-to`, `health-checks`, `failover`…) |
| Accuracy rules | `validateGraph` | Security groups only `attached-to`; Route 53 resolves, never proxies; target groups are listener config; health checks separate from requests; private subnets have no implicit internet; databases not public; load balancers need targets |
| Editing | Studio | Drag, connect (relation inferred, editable), delete, inspector for ports/protocols/labels, boundaries, auto-layout, undo/redo, collapsible side panels |
| Versions | `src/server/diagrams.ts` | Every save is a new version with optimistic concurrency (`expectedVersion` → 409 on stale writes) |
| Export | Studio toolbar | PNG, SVG, JSON (graph), Mermaid |
| Concept library | `src/domain/architecture/library.ts` | 11 interactive reference architectures (ALB web app, CloudFront+S3, serverless API, NAT egress, VPC endpoint, ECS Fargate, Route 53 failover, this site, CI/CD, two Azure designs). Shown on matching topic pages, insertable into journal pages, copyable into My diagrams |
| **Animated flows** | `src/domain/architecture/scenarios.ts`, `flow-player.tsx` | Deterministic step model per mode: normal, health-check failure, SG rejection, backend failure, multi-AZ failover, Route 53 failover, routing failure. Play/pause/step/restart/speed, highlighted nodes and animated edges, explanation per step, a permanent "Simulation" banner. Steps are also stored in `AnimationScenario/Step` on save |
| Journal embeds | `src/components/journal/embeds.tsx` | `architectureEmbed` node (diagram or concept, with Diagram/Animate tabs); Mermaid code blocks render a live preview (`securityLevel: "strict"`) |
| Save as page (scenario C) | `POST /api/diagrams/:id/page` | Page with the embed, component list, request flow and assumptions, filed under the chosen topic |
| **Import Center** | `src/server/imports.ts`, `src/domain/import/convert.ts` | Markdown, DOCX (mammoth), PDF (text only, unpdf), TXT, HTML, JSON (our Tiptap JSON or `{title, markdown}`), Mermaid. Everything passes through `sanitize-html` (no scripts, styles, iframes, event handlers, images, `javascript:` links). Mermaid and code languages kept, GFM tables and task lists converted. Topic detection + suggested category + "Suggest an architecture" link. Editable preview, nothing saved until approved; saved pages start with an attribution callout; `Import` rows keep history. Originals go to the private S3 bucket when configured |
| Paste from ChatGPT | Import Center tab | Paste Markdown from ChatGPT's copy button |
| **AI assistant** | `src/server/ai.ts`, `/assistant` | Providers: Amazon Bedrock (Converse API, instance role), OpenAI (server-side key), or none. Retrieval from your journal (full-text search + optional page / diagram context). Answers have two sections: *From your journal* with `[S1]` citations and *General guidance*. Every call recorded in `AIJob`; 10 requests/minute and `AI_DAILY_LIMIT`/day. Drafts are saved only when you click "Save as draft page". Nothing is executed |
| **Labs** | `src/server/labs.ts`, `/labs` | 10 starter templates (spec list), objective, prerequisites, cost estimate, steps with commands / expected / actual / done, observations, errors, root cause, resolution, checklist, Terraform, cleanup, status with start/complete timestamps, screenshots via presigned S3 upload, linked topic and architecture. Autosaves |
| **Troubleshooting KB** | `src/server/cases.ts`, `/troubleshooting` | All fields from the spec, area filters (AWS, Azure, Kubernetes, Docker, Jenkins, Terraform, networking, security), text search, links to labs and architectures, "Log a troubleshooting case" from a lab pre-fills it. Error text is in global search |
| **Roadmaps** | `src/domain/roadmaps.ts`, `/roadmaps` | Three curated paths matched against *your* topic tree, progress from topic status, links to concept diagrams and lab templates |

## Acceptance scenarios

| | How to check in the UI | Automated |
|---|---|---|
| A | Studio → New → paste the Route 53 / ALB / TG / 2× EC2 / SG / RDS sentence → Generate | `tests/architecture-engine.test.ts`, `tests/phases.integration.test.ts` |
| B | Animate tab, or Animated Process Flows → step through | step titles asserted in engine tests |
| C | Save → "Save as page" → choose *Application Load Balancer* | integration test (page under topic, contains embed) |
| D | Reopen from Studio, move/rename, Save → version 2; stale tab gets a conflict | integration test (409) |
| E | Import Center → upload a ChatGPT DOCX or paste Markdown → correct → Save as page | integration test with `tests/fixtures/chatgpt-export.docx` |
| F | Studio → Azure palette or "Front Door, Application Gateway, two VMs and Azure SQL" → Save as page under an Azure topic | integration test |
| G | Search "health check" → case, lab and page; case links the lab and diagram | integration + smoke test |

## Verification commands

```bash
npm run typecheck && npm run lint
TEST_DATABASE_URL=postgresql://…/cloudops_test npx vitest run      # 110 tests
npm run build
BASE=http://localhost:3000 EMAIL=you@example.com PASSWORD=… ./scripts/smoke-test.sh   # 70 checks
```

## Updating the live site (EC2 + CodeBuild setup)

1. Push the code to `main` on GitHub.
2. AWS Console → CodeBuild → `cloudops-journal-build` → **Start build** (or let the GitHub workflow do it once the
   repository variables from Step 14 are set). Wait for *Succeeded*.
3. Systems Manager → Session Manager → connect to the instance → `sudo /opt/cloudops/deploy.sh latest`.
   The script pulls the image, runs migrations (none are pending for this release), restarts the app and rolls back
   automatically if `/api/health` does not come up.

## Turning on the AI assistant (optional, costs per request)

1. Bedrock console → *Model access* → enable a text model in your region (for example an Anthropic Claude model). Note
   its model ID, or the inference profile ID if the console shows one (newer models require the profile ID).
2. IAM → role `cloudops-journal-ec2-role` → add an inline policy from `infra/console/iam/5-optional-bedrock-policy.json`
   with the placeholders replaced. Scope it to that one model.
3. On the instance (Session Manager):
   ```bash
   sudo tee -a /opt/cloudops/config.env <<'EOF'
   AI_PROVIDER=bedrock
   BEDROCK_MODEL_ID=<model-or-inference-profile-id>
   EOF
   ```
   The live instance's `/opt/cloudops/compose.yml` was written before this release; add these three lines under
   `app: environment:` once (new instances get them from the updated user data):
   ```yaml
         AI_PROVIDER: ${AI_PROVIDER:-none}
         BEDROCK_MODEL_ID: ${BEDROCK_MODEL_ID:-}
         BEDROCK_REGION: ${BEDROCK_REGION:-}
   ```
4. `sudo /opt/cloudops/deploy.sh latest`, then Settings shows the provider and the assistant answers.

To turn it off again set `AI_PROVIDER=none` (or remove the lines) and redeploy. Retrieval from your journal keeps working
without a provider.

## Known limits

* Generated architectures are teaching models, not a deployment plan; validation checks relationships, not quotas,
  CIDR overlaps or IAM.
* PDF import extracts text only; scanned PDFs are rejected (no OCR). Word columns, text boxes and images are not carried over.
* Simulations are deterministic models of documented behaviour; they never read your AWS account.
