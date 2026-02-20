# Realtor Suite Agent Engine - AI Handoff

Date: 2026-02-20  
Project root: `C:\Users\Vishal Gopal Ojha\evolution-real-estate-agent`  
Audience: Next AI coding agent continuing implementation

## Mission

Continue Option A (Agent Engine Core) from demo-capable state to production-capable state without breaking existing endpoints.

## Current State (Do Not Re-discover)

Implemented and working:

- New endpoint: `POST /agent/chat`
- Planner + execution pipeline for tool orchestration
- Tool set currently wired:
  - `post_to_99acres` (mock)
  - `match_property_to_buyer`
  - `send_whatsapp_followup`
  - `schedule_site_visit`
  - `generate_performance_report`
- Existing legacy endpoints unchanged and still available
- Build passes: `cmd /c npm run build`
- PostgreSQL persistence support (`listings`, `visits`, `agent_actions`) with in-memory fallback
- `post_to_99acres` wired via `PropaiLiveAdapter` / `PropaiLiveBridge` with simulated fallback
- `/agent/chat` request validation + basic API-key and role guardrails
- Automated tests wired (`npm test`) and passing

Extracted but not integrated:

- `realtor-suite-agent.py` (Python Anthropic tool schema template)

## Exact Files In Scope

Primary:

- `src/agentic/server.ts`
- `src/agentic/suite/engine.ts`
- `src/agentic/suite/planner.ts`
- `src/agentic/suite/toolkit.ts`
- `src/agentic/suite/types.ts`
- `src/agentic/suite/demo-store.ts`

Reference:

- `realtor-suite-agent.py` (tool schema + behavior reference only)

## Behavior Contract: `/agent/chat`

Input:

```json
{
  "message": "string, required",
  "lead": "optional LeadInput",
  "recipient": "optional phone number",
  "dryRun": "optional boolean"
}
```

Output:

- `assistantMessage`
- `plan`
- `toolResults`
- `suggestedNextPrompts`

Do not break this response shape unless explicitly requested.

## Mandatory Constraints For Next Agent

- Preserve existing routes and current response contracts.
- Keep TypeScript strict-mode compatible.
- Prefer incremental edits over rewrites.
- If adding dependencies, update `README.md`.
- Add tests for any non-trivial behavior changes.

## Highest-Priority Pending Work

1. Expand real integrations behind adapters
- Broaden `PropaiLiveBridge` from basic publish call to full provider contract fields/retries/timeout policy.

2. Harden auth model
- Replace header-only role checks with signed token or upstream identity integration.

3. Expand test coverage
- Add negative-path tests for bridge failures and database connection failures.
- Add CI workflow test execution.

4. Python template usage decision (completed)
- Chosen: **port tool-schema concepts into TypeScript**, no Python sidecar for this iteration.
- Rationale: single-runtime deployment, lower operational complexity, easier contract control for `/agent/chat`.

## First 10 Commands To Run

```bash
cd C:\Users\Vishal Gopal Ojha\evolution-real-estate-agent
cmd /c npm install
cmd /c npm run build
cmd /c npm run dev
curl -X GET http://localhost:8080/health
curl -X POST http://localhost:8080/agent/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"Post my 3 BHK in Wakad to 99acres and send WhatsApp follow-up\",\"recipient\":\"+919999999999\",\"dryRun\":true}"
```

## Definition Of Done For Next Iteration

- `/agent/chat` persists actions to DB.
- `post_to_99acres` is no longer mock-only.
- Validation + auth checks exist.
- Added automated tests pass in CI/local build.
- `README.md` updated with new setup/run requirements.

Status note (2026-02-20): Local done items above are implemented and validated with `npm test`; CI wiring remains pending.
