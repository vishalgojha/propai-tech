# UX Contract - PropAI Operator Surface

Date: 2026-02-25  
Scope: `/app` web operator experience (primary), CLI as secondary operator surface.

## 1) Purpose

This contract defines non-negotiable UX behavior for non-technical operators.
Any UI change that violates these rules is considered a regression even if it is visually improved.

## 2) Product Promise

1. Safe by default.
2. No hidden execution.
3. Clear role-based control for admin operations.
4. Recoverable errors with concrete next action.
5. Auditable operation history.

## 3) Core UX Rules

1. First run must start in guided onboarding.
2. Default execution mode must not silently perform risky external actions.
3. Every action that needs approval must appear in a visible queue with context.
4. Approve/deny actions must produce visible result state immediately.
5. Admin operations must display auth state (`ready` / `needs_config` / `unauthorized` / `server_unavailable`).
6. Queue-runtime state must be visible (enabled, ready, reason when fallback).
7. Dispatch operations must persist visible run history with per-item detail.
8. Every error shown to operator must include a fix hint, not only raw error text.

## 4) Required UI Surfaces

1. Onboarding wizard:
1. Safety mode selection.
2. Operator defaults.
3. Final review before live usage.
2. Operator request composer:
1. Plain-language request input.
2. Safe mode visibility (`dryRun`, autonomy).
3. Optional advanced settings.
3. Approval queue:
1. Pending count + risk context.
2. Per-item approve/deny.
3. Bulk approve/deny with clear state.
4. Operations:
1. Queue runtime status.
2. Group-posting status and queue management.
3. Dispatch history drilldown.

## 5) API/Behavior Mapping

1. Session flow:
1. `POST /agent/session/start`
2. `POST /agent/session/:id/message`
3. `POST /agent/session/:id/approve`
4. `POST /agent/session/:id/reject`
5. `POST /agent/session/:id/events/token`
6. `GET /agent/session/:id/events`
2. Ops flow:
1. `GET /ops/queue/status`
2. `GET /group-posting/status`
3. `GET /group-posting/queue`
4. `POST /group-posting/dispatch`
5. `POST /group-posting/:id/requeue`

## 6) Acceptance Criteria

1. New operator can complete onboarding and run first safe request without docs.
2. Operator can tell, within 5 seconds, whether queue mode is active or fallback.
3. Admin endpoint auth failures can be diagnosed from UI without logs.
4. Operator can audit latest dispatch outcomes and per-item failures from UI.
5. All critical flows above remain covered by automated tests and manual smoke checks.

## 7) Change Policy

1. Any PR touching `/app` must state which UX contract clauses are affected.
2. If behavior changes, update this contract in same PR.
3. Contract changes require explicit sign-off from product/operator owner.
