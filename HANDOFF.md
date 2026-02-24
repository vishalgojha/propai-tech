# PropAI Tech - Handoff

Date: 2026-02-24  
Project root: `C:\Users\visha\propai-tech`  
Branch: `main`  
Audience: next developer/AI agent continuing product and infra work

## Current Snapshot

PropAI Tech is a realtor-focused agentic system with:

- API server (`/agent/chat`, `/connectors/health`, `/health`, `/app`)
- Terminal UX (classic + Vue TermUI)
- Branded CLI wrapper (`propai`)
- Guardrailed tool planner/executor
- Hybrid LLM routing (OpenRouter first, Ollama fallback)
- WhatsApp transport integration via `wacli`
- Portal publishing bridge for:
  - `99acres`
  - `magicbricks`

Latest verified test status:

- `npm test` passes (`10/10`)

## Tooling Contract (`/agent/chat`)

Planner/executor lives in `src/agentic/suite/`.

Current tool names:

- `post_to_99acres`
- `post_to_magicbricks`
- `match_property_to_buyer`
- `group_requirement_match_scan`
- `ads_lead_qualification`
- `send_whatsapp_followup`
- `schedule_site_visit`
- `generate_performance_report`

Contract shape (stable):

- `assistantMessage`
- `plan`
- `toolResults`
- `events`
- `suggestedNextPrompts`

Guardrails:

- blocks PII scraping/export requests
- blocks guaranteed-return style non-compliant claims
- blocks unsafe bulk/auto send patterns unless approval flow is explicitly followed

## Publishing Flow (99acres + MagicBricks)

Key files:

- `src/agentic/suite/propai-live-adapter.ts`
- `src/agentic/suite/propai-live-bridge.ts`
- `src/agentic/suite/toolkit.ts`
- `src/agentic/suite/store.ts`
- `src/agentic/suite/planner.ts`
- `src/agentic/suite/types.ts`

Behavior:

- Planner detects publish intent for both portals.
- Bridge supports:
  - shared URL: `PROPAI_LIVE_POST_URL`
  - optional portal-specific overrides:
    - `PROPAI_LIVE_99ACRES_POST_URL`
    - `PROPAI_LIVE_MAGICBRICKS_POST_URL`
- If publish URL is missing or dry run is enabled, flow uses safe simulated publish.
- Store persists portal-aware listing IDs:
  - `A99-xxxxx` for 99acres
  - `MB-xxxxx` for magicbricks

## Runtime Entry Points

API / web:

- `npm run dev` -> `http://localhost:8080/app`
- `npm run start` (built runtime)

Terminal:

- `npm run terminal` (TUI)
- `npm run terminal:classic`
- `npm run terminal:menu`

CLI wrapper:

- `npm run propai -- doctor`
- `npm run propai -- connectors --json`
- `npm run propai -- chat`

## Important Environment Variables

Core:

- `PORT`
- `DATABASE_URL`
- `AGENT_API_KEY`
- `AGENT_ALLOWED_ROLES`
- `CORS_ORIGIN`

LLM:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_TIMEOUT_MS`
- `OLLAMA_ENABLED`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`

Publishing:

- `PROPAI_LIVE_POST_URL`
- `PROPAI_LIVE_99ACRES_POST_URL`
- `PROPAI_LIVE_MAGICBRICKS_POST_URL`
- `PROPAI_LIVE_API_KEY`
- `PROPAI_LIVE_TIMEOUT_MS`
- `PROPAI_LIVE_MAX_RETRIES`
- `PROPAI_LIVE_RETRY_BACKOFF_MS`

Transport / gateway:

- `WACLI_DRY_RUN`
- `WACLI_BIN`
- `OPENCLAW_GATEWAY_HTTP_URL`
- `OPENCLAW_GATEWAY_WS_URL`
- `OPENCLAW_GATEWAY_TIMEOUT_MS`
- `OPENCLAW_GATEWAY_API_KEY`

DM policy:

- `WHATSAPP_DM_POLICY`
- `WHATSAPP_ALLOW_FROM`

## Quick Verification Checklist

1. `npm install`
2. `npm run build`
3. `npm test`
4. `npm run dev`
5. verify:
   - `GET http://localhost:8080/health`
   - `GET http://localhost:8080/connectors/health`
   - open `http://localhost:8080/app`

## Suggested Next Work

1. Real provider hardening
- Replace simulated fallback with strict provider contract checks and error surfaces per portal.

2. Approval UX hardening
- Add durable pending-action queue and operator decision endpoints/UI.

3. Better normalization for India broker slang
- Expand location alias map and budget parsing confidence signals.

4. Production auth
- Move header-based role checks to signed JWT/session model.

5. Observability
- Add per-tool latency, portal publish success rates, and guardrail metrics.
