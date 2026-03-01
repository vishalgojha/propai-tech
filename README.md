# Indian Realtor Agentic App (with wacli)

Handoff:
- `HANDOFF.md` (current implementation snapshot, operational checklist, and next backlog)

This project now includes an agentic workflow for Indian realtors, powered by:

- Lead Intake Agent (extracts requirement from lead text)
- Property Match Agent (scores Indian listings against requirement)
- Follow-up Agent (builds WhatsApp-ready response and action checklist)
- `wacli` tool integration (send/search WhatsApp through CLI)

The `wacli-1.0.0` ZIP you shared is a skill definition. This app uses those command patterns directly (`send text`, `messages search`, `chats list`, `doctor`).

## New: Realtor Suite Agent Engine (Option A slice)

This repo now includes a tool-planned chat endpoint (`POST /agent/chat`) that can orchestrate:

- `post_to_99acres` (demo portal publish flow)
- `post_to_magicbricks` (demo portal publish flow)
- `match_property_to_buyer` (lead -> shortlist)
- `send_whatsapp_followup` (uses `wacli`, respects dry-run)
- `schedule_site_visit` (demo scheduler)
- `generate_performance_report` (snapshot from stored listing/visit activity)
- `group_requirement_match_scan` (monitor broker-group requirement text and shortlist matching properties)
- `ads_lead_qualification` (score ad leads hot/warm/cold and return next action)
- built-in scheduled group posting workflow (intake queue + automatic dispatch windows)
- `send_whatsapp_followup` now uses resale playbook assets (EN/HI templates + 1/3/7/14 nurture sequence hints)
- Session approval APIs for stateful operator flow:
  - `POST /agent/session/start`
  - `POST /agent/session/:id/message`
  - `POST /agent/session/:id/approve`
  - `POST /agent/session/:id/reject`
  - `POST /agent/session/:id/events/token` (issue short-lived event token)
  - `GET /agent/session/:id/events` (SSE live updates)
  - `GET /guided/state?sessionId=<session-id>`
  - `POST /guided/start`
  - `POST /guided/answer`

## New: Modular Skill Pack (`skills/`)

This repo now includes a ClawHub-compatible skill suite under `skills/`:

- `message-parser`
- `lead-extractor`
- `india-location-normalizer`
- `sentiment-priority-scorer`
- `summary-generator`
- `action-suggester`
- `lead-storage`

Recommended chain:

```text
message-parser
  -> lead-extractor
  -> india-location-normalizer
  -> sentiment-priority-scorer
  -> summary-generator
  -> action-suggester
  -> (Supervisor approval)
  -> lead-storage
```

Notes:
- Skills are separated by permission boundary (read-only analysis vs confirmed writes).
- `lead-storage` requires supervisor confirmation token for writes.
- Current evaluation mode is broker-group oriented (`dataset_mode=broker_group`) with explicit `record_type` handling.
- Runtime wiring: `/agent/chat` and `/agent/session/:id/message` now return `skillsPipeline` output containing deterministic stage results for the full chain (storage stage remains confirmation-gated).

## Guardrails (enforced in `/agent/chat`)

- Blocks requests that attempt PII scraping/export (phone/contact/personal data leakage).
- Blocks non-compliant claims such as guaranteed/assured return language.
- Blocks bulk/auto outbound messaging unless explicit human approval workflow is used.
- Applies request rate limiting on POST execution routes (`/agent/chat`, `/agent/session/*`, `/wacli/*`, `/whatsapp/pairing/approve`).
- On block, contract stays intact: response returns `assistantMessage`, empty `plan`, empty `toolResults`, and safe next prompts.

Persistence notes:
- If `DATABASE_URL` is set, `POST /agent/chat` tools persist to PostgreSQL tables:
  - `listings`
  - `visits`
  - `agent_actions`
  - `group_post_queue` (scheduled group posting intake/dispatch queue)
- Session state/approval queue persists to:
  - `agent_sessions`
- Tables are auto-created on first write.
- If `DATABASE_URL` is not set, the app falls back to in-memory storage.

Resale playbook assets:
- `src/agentic/data/resale-assets.ts` includes domain prompt, EN/HI templates, and nurture buckets.
- `runSendWhatsappFollowup` uses this playbook to select language-aware template drafts and nurture next actions.

Publishing integration naming:
- Adapter interface: `PropaiLiveAdapter`
- Concrete bridge: `PropaiLiveBridge`
- `post_to_99acres` and `post_to_magicbricks` use this bridge and fall back to simulated publish when bridge config is missing.

Python template decision (`realtor-suite-agent.py`):
- Chosen path: **port selected tool-schema ideas to TypeScript**, no Python sidecar.
- Why:
  - keeps deployment single-runtime (Node.js only)
  - avoids cross-process/network coordination between Node and Python
  - preserves current `/agent/chat` contract and existing operational flow
- Scope:
  - use Python file as reference for future tool expansion naming/schema
  - do not execute Python agent in production path for current iteration

## Quick Start

1. Install dependencies:
   - `npm install`
2. Copy env:
   - `cp .env.example .env` (or create `.env` manually on Windows)
3. Start app:
   - `npm run dev`
4. Check health:
   - `GET http://localhost:8080/health`
5. Open frontend console:
   - `http://localhost:8080/app` (session-aware approval queue + operator log)
   - If `web/dist` exists, `/app` serves the React shell; otherwise it falls back to legacy inline HTML.

## Canonical Dev Path

To avoid Windows/WSL path and line-ending drift, use this as the default local workflow:

1. Use Node `25.x` (`.node-version`, `package.json.engines`).
2. Use npm `11.x`.
3. Use PowerShell from repo root (`C:\Users\visha\propai-tech`).
4. Run:
   - `npm install`
   - `npm test`
   - `npm run dev`

Consistency guardrails:

- `.gitattributes` enforces line endings by file type.
- `.editorconfig` enforces shared editor defaults.

## One-Click Installer (Windows)

Double-click:

- `Install-PropAI.bat`

Or run directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install\install-propai.ps1 -FromSource
```

Installer behavior:

- One-click path installs from local source by default (`npm install`, `npm run build`, local shim).
- During source install, it auto-checks for updates using `git pull --ff-only` when the repo is clean and tracking an upstream.
- Source install defaults to local shim at `.local-bin\propai.cmd` (more reliable on Windows permission-restricted setups).
- If global install is blocked, it creates a local shim.
- Runs `propai doctor` after install (unless `-SkipDoctor` is used).

Optional flags:

- `-PackageName "@vishalgojha/propai-cli"` (or your published package name)
- `-FromSource` (force local source install)
- (Without `-FromSource`, installer tries global npm package first)
- `-TryNpmLink` (attempt `npm link` during source install before fallback to local shim)
- `-SkipSourceUpdate` (disable source auto-update check before source install)
- `-SkipDoctor`

## Interactive Terminal

Primary terminal (new lively TUI, built with optional `vue-termui` runtime):

- `npm run terminal`
- `npm run terminal:tui` (same command)

Branded command wrapper (OpenClaw-style command surface):

- `npm run propai -- doctor`
- `npm run propai -- chat`
- `npm run propai -- ui`
- `npm run propai -- classic`

Classic terminal (previous readline UI):

- `npm run terminal:classic`
- `npm run terminal:menu` (classic with menu)

Mode split:

- `propai chat` = terminal agent mode.
- `npm run dev` = API/Web mode (`http://localhost:8080/app`).
- `quick-launch.bat web [port]` = Windows helper that auto-frees the port, starts API in a new window, and opens `/app`.
- If TUI deps are missing, `propai chat` auto-falls back to classic terminal.

TUI capabilities:

- Stateful agentic chat loop in one screen (conversation, session state, activity feed, command list).
- Autonomy controls:
  - `0` suggest-only
  - `1` execution with approvals for local writes, external actions blocked
  - `2` execution with approvals for local and external actions
- Guided workflow commands: `/guided start publish_listing`, `/guided state`, `/guided answer <value>`.
- Operator mode command: `/mode <guided|expert>`.
- Approval queue commands (new TUI runtime): `/pending`, `/approve`, `/deny`, `/a`, `/d`.
- Session controls: `/help`, `/state`, `/llm`, `/set ...`, `/clear`, `/back`.
- Direct send shortcut (autonomy 2): `msg +919820056180 your message`.

Notes:

- Uses `.env` values (including `WACLI_DRY_RUN`, `WACLI_BIN`).
- `WACLI_DRY_RUN=true` remains safest for testing.
- LLM provider order is: OpenRouter (if configured) -> xAI (if configured) -> Ollama local.
- Fallback chat templates are disabled. If no provider is available, terminal returns an explicit LLM-unavailable error.
- If optional TUI deps are missing and it falls back to classic terminal, approvals are handled by inline prompts instead of `/pending`/`/approve` commands.

## PropAI CLI Commands

`propai` is a command wrapper for branded operations:

- `propai doctor`:
  - Probes OpenClaw gateway over HTTP + WebSocket via `OpenClawGatewayClient`.
  - Probes local PropAI API `/health`.
  - Reports OpenRouter/xAI/Ollama availability.
- `propai connectors`:
  - Returns connector inventory health (connectors, credentials, connector-credential pairs).
  - Supports `--json` for automation.
- `propai chat` / `propai ui` / `propai tui`:
  - Launches the new PropAI interactive TUI.
- `propai classic`:
  - Launches legacy readline terminal.

Doctor flags:

- `--json`
- `--http <url>` (OpenClaw HTTP gateway URL)
- `--ws <url>` (OpenClaw WebSocket URL)
- `--timeout <ms>`
- `--propai-url <url>` (PropAI API base URL)

Example:

```bash
npm run propai -- doctor --http http://127.0.0.1:19001 --ws ws://127.0.0.1:19001 --json
```

```bash
npm run propai -- connectors --json
```

## Tests

- Run: `npm test`
- Coverage focus:
  - planner tool-selection behavior
  - toolkit listing/visit/report behavior
  - `/agent/chat` integration (dry-run + validation + auth/RBAC)
  - approval-gated behavior contract (bulk/auto-send blocked + approval-required scan path)
  - session queue flow (`start -> queue -> approve/reject`)

## Release Flow

Single scripted path:

1. `npm run release:check -- patch`
2. `npm run release -- patch`

What it automates:

- `npm test`
- version bump (`package.json`, `package-lock.json`)
- changelog update (`CHANGELOG.md`)
- git commit + tag
- git push (unless `--skip-push`)
- npm publish (skipped automatically when `private=true`, or with `--skip-publish`)

Dry run:

- `npm run release:dry -- patch`

## KPI + Governance

- KPI contract: `docs/kpi-contract.md`
- Data governance policy: `docs/data-governance.md`
- Frontend migration criteria: `docs/frontend-migration-plan.md`
- Queue setup runbook: `docs/queue-setup.md`
- UX contract: `docs/ux-contract.md`

## React Web Shell (Optional)

Build and run the separate React frontend:

```bash
npm run web:install
npm run web:dev
```

Build for server hosting:

```bash
npm run web:build
```

Then start backend:

```bash
npm run dev
```

The Node server serves `web/dist` on `/app` and `/app/*` when build output exists.

## Deploy (Railway)

This repo is preconfigured for Railway via `railway.json`:
- Build: `npm run railway:build` (installs/builds `web` and compiles backend)
- Start: `npm run start`
- Health check: `GET /health`

1. Create or link a Railway project:

```bash
npx @railway/cli login
npx @railway/cli init   # or: npx @railway/cli link
```

2. Add these variables in Railway:

| Variable | Required | Example |
|---|---|---|
| `PORT` | Yes | `8080` |
| `OPENROUTER_API_KEY` | Yes | `sk-or-...` |
| `OPENROUTER_MODEL` | Yes | `openai/gpt-4o-mini` |
| `XAI_API_KEY` | Optional | `xai-...` |
| `XAI_MODEL` | Optional | `grok-2-latest` |
| `AGENT_API_KEY` | Recommended | `your-strong-key` |
| `AGENT_ALLOWED_ROLES` | Recommended | `realtor_admin,ops` |
| `CORS_ORIGIN` | Yes (prod) | `https://propai.live` |
| `WACLI_DRY_RUN` | Recommended | `true` |
| `WHATSAPP_DM_POLICY` | Recommended | `allowlist` |
| `WHATSAPP_ALLOW_FROM` | If allowlist | `+919999999999,+14155550123` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Optional (webhook) | `your-verify-token` |
| `WHATSAPP_APP_SECRET` | Optional (webhook signature) | `your-meta-app-secret` |
| `DATABASE_URL` | If pairing mode | `postgres://...` |
| `PROPAI_QUEUE_ENABLED` | Optional | `true` |
| `REDIS_URL` | If queue enabled | `redis://...` |

3. Optional vars for integrations:
- `PROPAI_LIVE_POST_URL`
- `PROPAI_LIVE_99ACRES_POST_URL`
- `PROPAI_LIVE_MAGICBRICKS_POST_URL`
- `PROPAI_LIVE_API_KEY`
- `PROPAI_LIVE_TIMEOUT_MS`
- `PROPAI_LIVE_MAX_RETRIES`
- `PROPAI_LIVE_RETRY_BACKOFF_MS`

4. Deploy:

```bash
npx @railway/cli up
```

5. Verify:
- `GET https://<your-railway-domain>/health`
- Open `https://<your-railway-domain>/app`

## Agentic API

- `GET /health`
- `GET /connectors/health`
- `GET /properties`
- `POST /agent/run`
- `POST /agent/chat`
- `GET /agent/sessions`
- `GET /guided/state?sessionId=<session-id>`
- `POST /guided/start`
- `POST /guided/answer`
- `POST /agent/session/start`
- `GET /agent/session/:id`
- `POST /agent/session/:id/message`
- `POST /agent/session/:id/approve`
- `POST /agent/session/:id/reject`
- `POST /agent/session/:id/events/token` (issue short-lived SSE token)
- `GET /agent/session/:id/events` (SSE)
- `POST /wacli/send`
- `POST /wacli/search`
- `POST /wacli/chats`
- `POST /wacli/doctor`
- `GET /group-posting/status`
- `GET /group-posting/queue`
- `POST /group-posting/intake`
- `POST /group-posting/dispatch`
- `POST /group-posting/:id/requeue`
- `GET /ops/queue/status`
- `POST /whatsapp/pairing/approve`
- `GET /whatsapp/webhook` (Meta verify challenge)
- `POST /whatsapp/webhook` (Meta events + optional signature verification)
- `POST /realtor/intent/classify`
- `POST /realtor/consent/add`
- `POST /realtor/consent/revoke`
- `GET /realtor/consent/status?phone=<e164>`
- `GET /realtor/consent/list`
- `POST /realtor/campaign/create`
- `POST /realtor/campaign/approve`
- `POST /realtor/campaign/preflight`
- `POST /realtor/campaign/run`
- `GET /realtor/campaign/status?id=<campaign-id>`
- `GET /realtor/campaign/list`

### Example: run orchestrator

```bash
curl -X POST http://localhost:8080/agent/run \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "lead": {
      "name": "Arjun",
      "message": "Need 2 BHK in Whitefield, budget under 1.2 cr, immediate move, for buying",
      "preferredLanguage": "hinglish"
    },
    "sendWhatsApp": false
  }'
```

### Example: agent chat orchestration

```bash
curl -X POST http://localhost:8080/agent/chat \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "message": "Post my 3 BHK in Wakad to 99acres and MagicBricks, then send WhatsApp follow-up",
    "recipient": "+919999999999",
    "dryRun": true
  }'
```

### Example: agent chat with OpenRouter model override

```bash
curl -X POST http://localhost:8080/agent/chat \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "message": "Summarize completed actions and suggest next step",
    "model": "openai/gpt-4o-mini",
    "dryRun": true
  }'
```

### Example: realtor campaign preflight flow

```bash
curl -X POST http://localhost:8080/realtor/consent/add \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "phone": "+919812345678",
    "source": "website-form",
    "purpose": "marketing"
  }'

curl -X POST http://localhost:8080/realtor/campaign/create \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "name": "March Warm Lead Push",
    "client": "acme",
    "templateName": "resale_marketing_nudge",
    "category": "marketing",
    "reraProjectId": "P52100012345",
    "audience": ["+919812345678"]
  }'

curl -X POST http://localhost:8080/realtor/campaign/preflight \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{"id":"<campaign-id>"}'
```

### Example: session-based queue flow

Start or resume a session:

```bash
curl -X POST http://localhost:8080/agent/session/start \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{}'
```

Queue actions (autonomy 1 blocks external actions, queues local-write actions):

```bash
curl -X POST http://localhost:8080/agent/session/<session-id>/message \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "message": "Schedule site visit tomorrow in Wakad",
    "autonomy": 1,
    "dryRun": true
  }'
```

Approve one queued action:

```bash
curl -X POST http://localhost:8080/agent/session/<session-id>/approve \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{"actionId":"act-..."}'
```

If `PROPAI_QUEUE_ENABLED=true`, approve responses include a top-level `queue` object:
- `enabled: true` with `jobId` when BullMQ+Redis is active
- `enabled: false` with fallback reason when queue infra is unavailable

Queue runtime observability endpoint:
- `GET /ops/queue/status` returns configured queue mode, readiness, retry settings, and fallback reason.

Stream live session updates (Server-Sent Events):

Issue token first:

```bash
curl -X POST http://localhost:8080/agent/session/<session-id>/events/token \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{}'
```

Then connect with token:

```bash
curl -N "http://localhost:8080/agent/session/<session-id>/events?token=<event-token>"
```

### Example: guided publish-listing flow

Start or resume a session:

```bash
curl -X POST http://localhost:8080/agent/session/start \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{}'
```

Start guided flow (`flowId` currently supports `publish_listing`):

```bash
curl -X POST http://localhost:8080/guided/start \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "sessionId": "<session-id>",
    "flowId": "publish_listing"
  }'
```

Check current guided step:

```bash
curl "http://localhost:8080/guided/state?sessionId=<session-id>" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin"
```

Answer a guided step (`stepId` must match `guidedFlow.currentStepId`):

```bash
curl -X POST http://localhost:8080/guided/answer \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "sessionId": "<session-id>",
    "stepId": "title",
    "answer": "3BHK Sea Facing in Bandra West"
  }'
```

When the flow reaches `status=completed`, use `guidedFlow.completion.suggestedExecution` to execute the generated request in the same session.

### Example: OpenRouter CLI

```bash
npm run openrouter:chat -- "Draft a short WhatsApp follow-up for a 2 BHK buyer in Whitefield"
```

### Example: group scan workflow

```bash
curl -X POST http://localhost:8080/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Monitor WhatsApp broker group and match requirement with properties in Wakad"
  }'
```

### Example: ads lead qualification workflow

```bash
curl -X POST http://localhost:8080/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Do ads lead qualification for this lead looking for 2 BHK in Whitefield under 1.2 cr"
  }'
```

### Example: queue a listing for scheduled group posting

```bash
curl -X POST http://localhost:8080/group-posting/intake \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "content": "New 3 BHK in Wakad, 1.25 Cr, immediate possession",
    "targets": ["sales-team@g.us","buyers-desk@g.us"],
    "scheduleMode": "daily",
    "repeatCount": 3,
    "source": "api",
    "idempotencyKey": "broker-msg-12345"
  }'
```

### Example: run due scheduled group posts now

```bash
curl -X POST http://localhost:8080/group-posting/dispatch \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{
    "dryRun": true
  }'
```

### Example: send WhatsApp via wacli

```bash
curl -X POST http://localhost:8080/wacli/send \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{"to":"+919999999999","message":"Hello from Realtor Agentic App"}'
```

### Example: approve WhatsApp pairing code

```bash
curl -X POST http://localhost:8080/whatsapp/pairing/approve \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: your-key" \
  -H "x-agent-role: realtor_admin" \
  -d '{"code":"123456"}'
```

## Configuration

### Existing legacy config (kept)

- `PROPAI_SEND_URL`
- `PROPAI_API_KEY`
- `PROPAI_PARSE_PROPERTY_URL`
- `PROPAI_PARSE_REQUIREMENT_URL`
- `WPP_SESSION_NAME`

### New agentic config

- `PORT` (default: `8080`)
- `DATABASE_URL` (optional, enables PostgreSQL persistence)
- `PROPAI_LIVE_POST_URL` (optional, shared publish endpoint for Propai Live bridge)
- `PROPAI_LIVE_99ACRES_POST_URL` (optional, overrides shared publish endpoint for 99acres)
- `PROPAI_LIVE_MAGICBRICKS_POST_URL` (optional, overrides shared publish endpoint for MagicBricks)
- `PROPAI_LIVE_API_KEY` (optional, sent as `X-API-Key`)
- `PROPAI_LIVE_TIMEOUT_MS` (default `8000`, request timeout per attempt)
- `PROPAI_LIVE_MAX_RETRIES` (default `2`, retries on 429/5xx and transient failures)
- `PROPAI_LIVE_RETRY_BACKOFF_MS` (default `300`, linear backoff base)
- `AGENT_API_KEY` (optional; when set it is enforced for `/agent/chat`, `/agent/run`, `/agent/session/*`, `/wacli/*`, and `/realtor/*`. Required for admin actions such as `/group-posting/*`, `/realtor/campaign/*`, and `/whatsapp/pairing/approve`)
- `AGENT_ALLOWED_ROLES` (optional CSV, default `realtor_admin,ops`; checks `x-agent-role` when provided)
- `AGENT_RATE_LIMIT_WINDOW_MS` (default `60000`, rate-limit window for POST execution routes)
- `AGENT_RATE_LIMIT_MAX` (default `180`, max POST execution requests per window per IP+route key)
- `AGENT_MAX_BODY_BYTES` (default `1048576`, rejects larger request bodies with `413 payload_too_large`)
- `SKILLS_PIPELINE_ENABLED` (default `true`, toggles deterministic skill-chain output in chat/session responses)
- `PROPAI_QUEUE_ENABLED` (default `false`; when true, approve execution attempts BullMQ queue mode)
- `PROPAI_QUEUE_NAME` (default `propai-session-execution`)
- `PROPAI_QUEUE_ATTEMPTS` (default `3`)
- `PROPAI_QUEUE_BACKOFF_MS` (default `1000`)
- `PROPAI_QUEUE_CONCURRENCY` (default `2`)
- `PROPAI_QUEUE_TIMEOUT_MS` (default `45000`)
- `REDIS_URL` (required when queue mode is enabled)
- `GROUP_POSTING_ENABLED` (default `false`; enables background scheduled group posting worker)
- `GROUP_POSTING_INTERVAL_MS` (default `900000`; queue scan interval in milliseconds)
- `GROUP_POSTING_BATCH_SIZE` (default `10`; max queued items processed per scan)
- `GROUP_POSTING_PROCESSING_LEASE_MS` (default `600000`; stale `processing` rows older than this are auto-recovered to `queued`)
- `GROUP_POSTING_DEFAULT_TARGETS` (optional CSV of default WhatsApp group IDs/chats for dispatch)
- `GROUP_POSTING_SCHEDULER_DRY_RUN` (default follows `WACLI_DRY_RUN`; simulate dispatches without sending)
- `GROUP_POSTING_INTAKE_ENABLED` (default `false`; enables WhatsApp group intake in single-agent helper mode)
- `GROUP_POSTING_INPUT_CHATS` (optional CSV of allowed WhatsApp input group IDs; supports `*` for all groups)
- `GROUP_POSTING_ACK_INPUT` (default `false`; sends intake acknowledgment to input group)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (optional, enables `GET /whatsapp/webhook` challenge verification)
- `WHATSAPP_APP_SECRET` (optional, verifies `X-Hub-Signature-256` on `POST /whatsapp/webhook`)
- `CORS_ORIGIN` (default `*`)
- `OPENROUTER_API_KEY` (required to enable OpenRouter in backend + CLI)
- `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`)
- `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `OPENROUTER_TIMEOUT_MS` (default `30000`)
- `OPENROUTER_APP_NAME` / `OPENROUTER_APP_URL` (metadata headers for OpenRouter)
- `XAI_API_KEY` (optional; enables xAI as cloud LLM provider fallback)
- `XAI_MODEL` (default `grok-2-latest`)
- `XAI_BASE_URL` (default `https://api.x.ai/v1`)
- `XAI_TIMEOUT_MS` (default `30000`)
- `OLLAMA_ENABLED` (default `auto`; set `true` to force local Ollama attempts, `false` to disable)
- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` (default `llama3.1:8b`)
- `OLLAMA_TIMEOUT_MS` (default `12000`)
- `OPENCLAW_GATEWAY_HTTP_URL` (default `http://127.0.0.1:19001`; used by `propai doctor`)
- `OPENCLAW_GATEWAY_WS_URL` (default derived from HTTP URL; e.g. `ws://127.0.0.1:19001`)
- `OPENCLAW_GATEWAY_TIMEOUT_MS` (default `3500`)
- `OPENCLAW_GATEWAY_API_KEY` (optional bearer token for protected gateway health endpoints)
- `WACLI_DRY_RUN` (default: `true`)
- `WACLI_BIN` (default: `wacli`)

## Running with real wacli

1. Install/authenticate `wacli` (`wacli auth`).
2. Set `WACLI_DRY_RUN=false` in `.env`.
3. Restart app.
4. Use `/wacli/doctor` to verify CLI access.

## Legacy listener

The older WPPConnect listener is still available:

- Dev: `npm run dev:legacy`
- Prod: `npm run start:legacy`

## Single-Agent WhatsApp Helper

`npm run dev:legacy` now runs a single WhatsApp helper flow for one realtor agent:
- inbound DM -> policy gate -> `RealtorSuiteAgentEngine` -> WhatsApp reply
- no multi-agent routing

Policy envs:
- `WHATSAPP_DM_POLICY` = `pairing | allowlist | open | disabled`
- `WHATSAPP_ALLOW_FROM` = comma-separated E.164 allowlist
- In `pairing` mode, approve codes with `POST /whatsapp/pairing/approve`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` enables `GET /whatsapp/webhook` challenge verification
- `WHATSAPP_APP_SECRET` enables `X-Hub-Signature-256` verification on `POST /whatsapp/webhook`
- `pairing` mode requires `DATABASE_URL` (startup fails fast without it)
- Runtime config is validated centrally at startup (`loadRuntimeConfigOrThrow`)
