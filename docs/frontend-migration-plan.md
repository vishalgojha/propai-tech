# Frontend Migration Plan

Current decision:

- Keep `/app` (server-rendered HTML/CSS/JS) as the default operator console.

Move to React only when at least one of these becomes a hard requirement:

- real-time execution timeline with log streaming
- stateful approval queue UI across sessions
- connector health dashboard with polling or WebSocket updates
- authenticated multi-user console

Migration constraints:

1. Keep backend contracts unchanged (`/agent/chat`, `/connectors/health`, `/whatsapp/pairing/approve`).
2. Build React under `web/` as a separate frontend package.
3. Serve built assets from the same Node server.
4. Migrate one screen at a time; avoid full rewrite.
