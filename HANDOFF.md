# PropAI Tech - AI Handoff

Date: 2026-02-20  
Project root: `C:\Users\Vishal Gopal Ojha\propai-tech`  
Audience: Next AI coding agent continuing implementation

## Mission

Continue single-agent realtor assistant development with strict guardrails, OpenRouter-backed reasoning, and production deployment readiness.

## Current State (Do Not Re-discover)

Implemented and verified:

- `POST /agent/chat` orchestration endpoint with validation/auth checks.
- Tool planner + execution pipeline in `src/agentic/suite/*`.
- Toolset includes:
  - `post_to_99acres`
  - `match_property_to_buyer`
  - `group_requirement_match_scan`
  - `ads_lead_qualification`
  - `send_whatsapp_followup`
  - `schedule_site_visit`
  - `generate_performance_report`
- Guardrails enforced before execution:
  - blocks PII scraping/export style requests
  - blocks non-compliant guaranteed-return claims
  - blocks bulk/auto outbound messaging without approval workflow
- OpenRouter integration live across:
  - backend assistant summary generation
  - WhatsApp parser fallback JSON extraction
  - CLI command `npm run openrouter:chat -- "..."`.
- Built-in frontend console served from backend:
  - `GET /app`
  - assets: `/app.css`, `/app.js`
- CI configured:
  - `.github/workflows/ci.yml` (`npm ci`, `npm run build`, `npm test`).
- Railway config added:
  - `railway.json` with `npm run start` and `/health` check.
- Local launcher added:
  - `quick-launch.bat` (api/api-bg/legacy/legacy-bg/openrouter modes).
- Branding cleanup completed:
  - package name is `propai-tech`
  - startup logs mention PropAI Tech
  - logger path uses repo-relative `logs/audit`.

Validation:

- `npm run build` passes.
- `npm test` passes (`8/8`).

## Core Files In Scope

- `src/agentic/server.ts`
- `src/agentic/frontend.ts`
- `src/agentic/suite/engine.ts`
- `src/agentic/suite/planner.ts`
- `src/agentic/suite/toolkit.ts`
- `src/agentic/suite/types.ts`
- `src/agentic/suite/guardrails.ts`
- `src/whatsapp/message-parser.ts`
- `src/llm/openrouter.ts`
- `src/cli/openrouter-chat.ts`
- `AGENT_GUARDRAILS_AND_SKILLS.md`

## Behavior Contract: `/agent/chat`

Input:

```json
{
  "message": "string, required",
  "lead": "optional LeadInput",
  "recipient": "optional phone number",
  "dryRun": "optional boolean",
  "model": "optional OpenRouter model override"
}
```

Output contract (must remain stable):

- `assistantMessage`
- `plan`
- `toolResults`
- `suggestedNextPrompts`

Guardrail block behavior:

- Returns normal 200 response shape with:
  - safe `assistantMessage`
  - empty `plan`
  - empty `toolResults`
  - safe suggestions

## Deployment Notes

Railway:

- Uses `railway.json`
- Health path: `/health`
- Start: `npm run start`

Important envs:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `AGENT_API_KEY`
- `AGENT_ALLOWED_ROLES`
- `CORS_ORIGIN`
- `WHATSAPP_DM_POLICY`
- `WHATSAPP_ALLOW_FROM` (if allowlist)
- `DATABASE_URL` (required for pairing mode)

## Priority Next Work

1. Approval Queue for blocked bulk actions
- Add persistence + endpoints for pending approval actions.
- Enable operator approve/reject flow in `/app`.

2. Provider hardening
- Move `post_to_99acres` from fallback-heavy mode to fully integrated provider contract.

3. Auth hardening
- Replace header-only role model with signed token/JWT or upstream identity.

4. Observability
- Add structured metrics/traces for guardrail blocks, tool latency, and OpenRouter failures.

## Quick Start Commands

```bash
cd C:\Users\Vishal Gopal Ojha\propai-tech
npm install --ignore-scripts
npm run build
npm run start
```

Verify:

- `GET http://localhost:8080/health`
- Open `http://localhost:8080/app`

Optional:

- `quick-launch.bat api 1310`
- `quick-launch.bat openrouter "Draft follow-up for warm lead"`
