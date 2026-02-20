# Indian Realtor Agentic App (with wacli)

This project now includes an agentic workflow for Indian realtors, powered by:

- Lead Intake Agent (extracts requirement from lead text)
- Property Match Agent (scores Indian listings against requirement)
- Follow-up Agent (builds WhatsApp-ready response and action checklist)
- `wacli` tool integration (send/search WhatsApp through CLI)

The `wacli-1.0.0` ZIP you shared is a skill definition. This app uses those command patterns directly (`send text`, `messages search`, `chats list`, `doctor`).

## New: Realtor Suite Agent Engine (Option A slice)

This repo now includes a tool-planned chat endpoint (`POST /agent/chat`) that can orchestrate:

- `post_to_99acres` (demo portal publish flow)
- `match_property_to_buyer` (lead -> shortlist)
- `send_whatsapp_followup` (uses `wacli`, respects dry-run)
- `schedule_site_visit` (demo scheduler)
- `generate_performance_report` (snapshot from stored listing/visit activity)

Persistence notes:
- If `DATABASE_URL` is set, `POST /agent/chat` tools persist to PostgreSQL tables:
  - `listings`
  - `visits`
  - `agent_actions`
- Tables are auto-created on first write.
- If `DATABASE_URL` is not set, the app falls back to in-memory storage.

99acres integration naming:
- Adapter interface: `PropaiLiveAdapter`
- Concrete bridge: `PropaiLiveBridge`
- `post_to_99acres` uses this bridge and falls back to simulated publish when bridge config is missing.

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
   - `http://localhost:8080/app`

## Tests

- Run: `npm test`
- Coverage focus:
  - planner tool-selection behavior
  - toolkit listing/visit/report behavior
  - `/agent/chat` integration (dry-run + validation + auth/RBAC)

## Agentic API

- `GET /health`
- `GET /properties`
- `POST /agent/run`
- `POST /agent/chat`
- `POST /wacli/send`
- `POST /wacli/search`
- `POST /wacli/chats`
- `POST /wacli/doctor`
- `POST /whatsapp/pairing/approve`

### Example: run orchestrator

```bash
curl -X POST http://localhost:8080/agent/run \
  -H "Content-Type: application/json" \
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
    "message": "Post my 3 BHK in Wakad to 99acres and send WhatsApp follow-up",
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

### Example: OpenRouter CLI

```bash
npm run openrouter:chat -- "Draft a short WhatsApp follow-up for a 2 BHK buyer in Whitefield"
```

### Example: send WhatsApp via wacli

```bash
curl -X POST http://localhost:8080/wacli/send \
  -H "Content-Type: application/json" \
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
- `PROPAI_LIVE_POST_URL` (optional, real publish endpoint for Propai Live bridge)
- `PROPAI_LIVE_API_KEY` (optional, sent as `X-API-Key`)
- `PROPAI_LIVE_TIMEOUT_MS` (default `8000`, request timeout per attempt)
- `PROPAI_LIVE_MAX_RETRIES` (default `2`, retries on 429/5xx and transient failures)
- `PROPAI_LIVE_RETRY_BACKOFF_MS` (default `300`, linear backoff base)
- `AGENT_API_KEY` (optional, when set `/agent/chat` requires `x-agent-api-key`)
- `AGENT_ALLOWED_ROLES` (optional CSV, default `realtor_admin,ops`; checks `x-agent-role` when provided)
- `CORS_ORIGIN` (default `*`)
- `OPENROUTER_API_KEY` (required to enable OpenRouter in backend + CLI)
- `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`)
- `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `OPENROUTER_TIMEOUT_MS` (default `30000`)
- `OPENROUTER_APP_NAME` / `OPENROUTER_APP_URL` (metadata headers for OpenRouter)
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
- `pairing` mode requires `DATABASE_URL` (startup fails fast without it)
- Runtime config is validated centrally at startup (`validateRuntimeConfigOrThrow`)
