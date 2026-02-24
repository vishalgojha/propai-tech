# waba-agent Reuse Map for propai-tech

## Goal
Reuse proven pieces from `waba-agent` without stalling current `propai-tech` delivery.

## Quick Verdict
- Reuse now: session safety model, action risk taxonomy, webhook signature verification, resale domain assets.
- Reuse later: async execution queue (BullMQ/Redis), gateway UI patterns.
- Skip for now: full CLI command surface and multi-tenant config framework.

## Current Fit Snapshot
- `propai-tech` already has:
  - session APIs with persistence (`src/agentic/suite/session-manager.ts`, `src/agentic/suite/session-store.ts`)
  - approval queue and live updates (`src/agentic/server.ts`, `src/agentic/frontend.ts`)
  - API rate limiting (`src/agentic/http-rate-limit.ts`)
  - redaction helpers (`src/agentic/utils/redact.ts`)
- `waba-agent` adds stronger primitives around:
  - tool-level risk metadata
  - queue-backed execution fallback
  - webhook signature validation
  - domain-ready resale prompts/templates/flows

## Reuse Matrix

### 1) Rate limit middleware
- Source: `C:\Users\visha\waba-agent\src\lib\http-rate-limit.js`
- Target: `C:\Users\visha\propai-tech\src\agentic\http-rate-limit.ts`
- Decision: keep current implementation; copy only client-key idea if needed.
- Why: behavior is already near-equivalent and typed TS version is cleaner in `propai-tech`.

### 2) Redaction helpers
- Source: `C:\Users\visha\waba-agent\src\lib\redact.js`
- Target: `C:\Users\visha\propai-tech\src\agentic\utils\redact.ts`
- Decision: keep current implementation; no direct port required.
- Why: `propai-tech` already supports secret/phone/command redaction.

### 3) Session + approval model
- Source: `C:\Users\visha\waba-agent\src\lib\chat\gateway.js`
- Target: `C:\Users\visha\propai-tech\src\agentic\suite\session-manager.ts`
- Decision: partially port.
- Port candidates:
  - explicit high-risk tool set contract
  - richer pending-action schema fields for observability (`tool`, `args`, `created_at`, `reason`)
  - standardized execution summaries for audit trails

### 4) Queue execution (BullMQ)
- Source: `C:\Users\visha\waba-agent\src\lib\queue\execution-queue.js`
- Target: new file `src/agentic/suite/execution-queue.ts`
- Decision: port later (Phase 2).
- Why: valuable for burst safety and retries, but introduces Redis and operational overhead.
- Suggested envs:
  - `PROPAI_QUEUE_ENABLED`
  - `REDIS_URL`
  - `PROPAI_QUEUE_NAME`
  - `PROPAI_QUEUE_ATTEMPTS`
  - `PROPAI_QUEUE_BACKOFF_MS`
  - `PROPAI_QUEUE_TIMEOUT_MS`

### 5) Webhook signature verification
- Source: `C:\Users\visha\waba-agent\src\lib\webhook\signature.js`
- Target: new file `src/agentic/whatsapp/inbound/signature.ts`
- Decision: port now.
- Why: this is low-risk, high-value hardening for inbound webhook handling.

### 6) Tool registry with risk metadata
- Source: `C:\Users\visha\waba-agent\src\lib\tools\registry.js` and `src\lib\tools\builtins\*.js`
- Target: `src/agentic/suite/toolkit.ts` and `src/agentic/suite/types.ts`
- Decision: port selectively.
- Port candidates:
  - add per-tool risk (`low|medium|high`)
  - central registry map for tool metadata + executor
  - policy gate based on risk/autonomy instead of only hardcoded lists

### 7) Resale domain assets (best ROI)
- Source:
  - `C:\Users\visha\waba-agent\domain\real-estate-resale\intents\system-prompt.txt`
  - `C:\Users\visha\waba-agent\domain\real-estate-resale\templates\templates.en.json`
  - `C:\Users\visha\waba-agent\domain\real-estate-resale\templates\templates.hi.json`
  - `C:\Users\visha\waba-agent\domain\real-estate-resale\flows\nurture-sequences.json`
- Target: `src/agentic/data/resale/*`
- Decision: port now.
- Why: instantly improves lead follow-up quality and conversion playbooks without architecture churn.

### 8) React resale UI components
- Source: `C:\Users\visha\waba-agent\domain\real-estate-resale\ui-components\*.jsx`
- Target: future `web/src/features/resale/*`
- Decision: reuse patterns, not drop-in code.
- Why: components assume gateway endpoints (`/api/resale/*`) and project-specific styling/state.

## Recommended Sequence
1. Port webhook signature verification and add tests.
2. Add tool risk metadata to suite tools and gate execution centrally.
3. Import resale prompts/templates/nurture flow as data assets.
4. Add queue adapter behind feature flag (`PROPAI_QUEUE_ENABLED`).
5. If React app starts, port resale UI components after APIs are stable.

Implementation status (current workspace):
- Step 1 completed.
- Step 2 completed.
- Step 3 completed.
- Step 4 completed (feature-flagged queue adapter with direct-execution fallback).

## Anti-Patterns to Avoid
- Do not copy entire `waba-agent` command architecture into `propai-tech`.
- Do not merge both repos at package level.
- Do not add Redis queue until baseline session flow metrics are stable.
- Do not migrate UI components before API contracts are finalized.

## KPI Impact Estimate
- Webhook signature check: security/compliance hardening; low effort.
- Risk-typed tools: fewer unsafe action regressions; medium effort.
- Resale templates + nurture flow: highest immediate conversion ROI; low-medium effort.
- Queue execution: stability under load; medium-high effort + ops cost.
