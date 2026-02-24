# Queue Setup (BullMQ + Redis)

This project already supports queue-backed approval execution behind env flags.  
Queue is optional and falls back to direct execution when unavailable.

## 1) Install dependency

From repo root:

```powershell
npm install bullmq
```

If npm cache permission issues occur on Windows:

```powershell
npm install bullmq --cache ./.npm-cache
```

## 2) Start Redis locally

Option A (Docker):

```powershell
docker run --name propai-redis -p 6379:6379 -d redis:7
```

Option B (existing Redis service):
- Ensure Redis is reachable.
- Copy connection URL.

## 3) Configure env

In `.env`:

```env
PROPAI_QUEUE_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
PROPAI_QUEUE_NAME=propai-session-execution
PROPAI_QUEUE_ATTEMPTS=3
PROPAI_QUEUE_BACKOFF_MS=1000
PROPAI_QUEUE_CONCURRENCY=2
PROPAI_QUEUE_TIMEOUT_MS=45000
```

## 4) Run app

```powershell
npm run dev
```

## 5) Verify queue mode

1. Start a session:

```powershell
curl -X POST http://localhost:8080/agent/session/start -H "Content-Type: application/json" -d "{}"
```

2. Queue an approval-required action:

```powershell
curl -X POST http://localhost:8080/agent/session/<session-id>/message `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"Schedule site visit tomorrow in Wakad\",\"autonomy\":1,\"dryRun\":true}"
```

3. Approve:

```powershell
curl -X POST http://localhost:8080/agent/session/<session-id>/approve `
  -H "Content-Type: application/json" `
  -d "{\"actionId\":\"<action-id>\"}"
```

Expected in response:
- `queue.enabled = true`
- `queue.jobId` exists

If you get `queue.enabled = false`, fallback is active (queue infra missing/misconfigured).

## 6) Production notes

- Keep `PROPAI_QUEUE_ENABLED=true` only when Redis is stable.
- Use managed Redis in production.
- Start with default retries/backoff, then tune from real failure rates.
- Keep fallback behavior; do not fail approvals purely due queue outages.
