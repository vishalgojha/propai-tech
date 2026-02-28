# Continuity Notes - 2026-02-28

Project root: `C:\Users\visha\propai-tech`  
Prepared for: next Codex/agent session

## Local Git State

- Branch: `handoff`
- HEAD: `c1e88a4` (`chore: harden deps and railway deployment setup`)
- Working tree: clean
- Pushed branch: `origin/handoff` includes:
  - `package.json`: added `railway:build` and `overrides.got=11.8.6`
  - `railway.json`: added explicit `build.buildCommand = npm run railway:build`
  - `README.md`: updated Railway deployment instructions
  - `.gitignore`: added `tokens`

## Railway State Snapshot

- Project: `propai-live`
- Project ID: `59751f37-9b05-4c15-8782-c569dfd7ba7a`
- Environment: `production`
- Environment ID: `7ac2610c-9565-4b2d-b5e3-c11fd3163e30`
- App service: `propai-tech`
- Service ID: `59c309d6-6e1f-4469-8b0a-f31643d62491`
- Services currently present: `propai-tech`, `Postgres`

## Deployment History (recent)

- `b5f2b729-af93-4acf-b83a-4069cf384ea0` -> `SUCCESS`
- `b62fc963-fb76-43f3-94e0-4be13cb7c2e9` -> `FAILED`
  - Failure reason: frontend build failed during `npm run railway:build` due Tailwind optional native binding issue while builder used Node 18.
- Last successful runtime log confirms app boot:
  - `PropAI Tech Agentic App running on http://localhost:8080`

## Railway Variables Confirmed On App Service

- `NIXPACKS_NODE_VERSION` (set)
- `WHATSAPP_DM_POLICY` (set to `allowlist`)
- `DATABASE_URL` is not confirmed as set yet

## Known Gaps To Finish

1. Confirm `DATABASE_URL` is wired from `Postgres` to `propai-tech`.
2. Ensure production deploy uses the `handoff` code (or equivalent) that includes `buildCommand: npm run railway:build`.
3. Verify frontend route `/app` serves React bundle (not fallback UI).

## Resume Checklist (next agent)

1. Check Railway variables for `propai-tech` and set DB if missing:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
2. Trigger deploy that includes handoff changes:
   - Option A: Railway GitHub deploy from branch `handoff`
   - Option B: CLI deploy from local `handoff` branch
3. Verify deployment metadata includes:
   - `buildCommand: npm run railway:build`
   - `startCommand: npm run start`
4. Verify health and app endpoints on Railway public domain:
   - `/health`
   - `/app`
5. If `/app` still shows fallback UI, inspect build logs for `web` build stage.

## Security Note

- Tokens were provided in chat during this session for CLI actions.
- Rotate/revoke any temporary Railway token after handoff completion.
