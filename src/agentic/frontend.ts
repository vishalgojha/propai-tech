export const FRONTEND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PropAI Command Deck</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <main class="deck">
      <header class="topbar">
        <div>
          <p class="kicker">PropAI Live</p>
          <h1>Command Deck</h1>
          <p class="sub">Run agent plans, approve operations, and watch execution logs in one place.</p>
        </div>
        <div class="chips">
          <span class="chip chip-live">LIVE</span>
          <span class="chip">/agent/chat</span>
          <span class="chip">/whatsapp/pairing/approve</span>
        </div>
      </header>

      <section class="layout">
        <article class="panel panel-main">
          <div class="panel-head">
            <h2>Agent Console</h2>
            <div class="row-buttons">
              <span id="sessionBadge" class="tiny mono-pill">session: --</span>
              <button id="newSessionBtn" class="ghost" type="button">New Session</button>
              <button id="healthBtn" class="ghost" type="button">Ping Health</button>
            </div>
          </div>

          <form id="chatForm" class="form-grid">
            <label class="label label-full">
              Message
              <textarea
                id="message"
                rows="5"
                placeholder="Post my 3 BHK in Wakad to 99acres and MagicBricks, then send WhatsApp follow-up"
              ></textarea>
            </label>

            <label class="label">
              Recipient (optional)
              <input id="recipient" placeholder="+919999999999" />
            </label>

            <label class="label">
              Dry Run
              <select id="dryRun">
                <option value="true" selected>true</option>
                <option value="false">false</option>
              </select>
            </label>

            <label class="label">
              Autonomy
              <select id="autonomy">
                <option value="0">0 (suggest only)</option>
                <option value="1" selected>1 (approve local writes)</option>
                <option value="2">2 (approve local + external)</option>
              </select>
            </label>

            <label class="label">
              API Key (optional)
              <input id="apiKey" placeholder="x-agent-api-key" />
            </label>

            <label class="label">
              Role (optional)
              <input id="role" placeholder="realtor_admin" />
            </label>

            <label class="label label-full">
              Model Override (optional)
              <input id="model" placeholder="openai/gpt-4o-mini" />
            </label>

            <div class="actions">
              <button class="primary" type="submit">Execute Agent Plan</button>
            </div>
          </form>
        </article>

        <aside class="panel panel-side">
          <h2>Approval Queue</h2>
          <p class="hint">Queued actions stay in this session until approved or denied.</p>

          <div id="pendingMeta" class="tiny">No pending actions.</div>
          <div id="pendingList" class="stack"></div>

          <div class="row-buttons">
            <button id="approveAllBtn" class="primary wide" type="button">Approve All</button>
            <button id="denyAllBtn" class="ghost wide" type="button">Deny All</button>
          </div>

          <div class="divider"></div>

          <h2>Pairing Approval</h2>
          <p class="hint">Approve secure pairing when DM policy is set to <code>pairing</code>.</p>

          <form id="pairForm" class="stack">
            <label class="label">
              Pairing Code
              <input id="pairCode" maxlength="6" placeholder="123456" />
            </label>
            <button class="primary" type="submit">Approve Pairing Code</button>
          </form>

          <div class="divider"></div>
          <button id="clearBtn" class="ghost wide" type="button">Clear Log</button>
        </aside>
      </section>

      <section class="panel panel-log">
        <div class="panel-head">
          <h2>Execution Log</h2>
          <span class="tiny">Newest first</span>
        </div>
        <pre id="output">Ready.</pre>
      </section>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
`;

export const FRONTEND_CSS = `:root{
  --bg:#f2f4ef;
  --bg-2:#e8eee4;
  --ink:#1b251c;
  --muted:#5a6b5f;
  --line:#cad5c8;
  --panel:#fdfdfbe8;
  --panel-strong:#ffffff;
  --accent:#1e7d47;
  --accent-2:#145a33;
  --danger:#8c2f2f;
  --log:#0f1511;
  --log-ink:#dff4e4;
}
*{box-sizing:border-box}
body{
  margin:0;
  color:var(--ink);
  font-family:"Sora","Space Grotesk","Aptos","Segoe UI",sans-serif;
  background:
    radial-gradient(900px 500px at -10% -10%, #c5ddc9 0%, transparent 60%),
    radial-gradient(700px 420px at 105% 0%, #e9d8b5 0%, transparent 55%),
    linear-gradient(180deg,var(--bg),var(--bg-2));
}
.deck{max-width:1160px;margin:0 auto;padding:26px 18px 38px}
.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.kicker{margin:0 0 4px;font-size:.76rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-2);font-weight:700}
h1{margin:0;font-size:2.05rem;line-height:1.1}
.sub{margin:8px 0 0;color:var(--muted);max-width:720px}
.chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.chip{
  border:1px solid var(--line);
  border-radius:999px;
  padding:6px 10px;
  font-size:.74rem;
  letter-spacing:.03em;
  color:#314034;
  background:#ffffffb8;
}
.chip-live{
  border-color:#7fb58e;
  background:#d8f0de;
  color:#145a33;
  font-weight:700;
}
.layout{display:grid;grid-template-columns:2.1fr 1fr;gap:14px}
.panel{
  border:1px solid var(--line);
  border-radius:16px;
  background:var(--panel);
  backdrop-filter:blur(3px);
  box-shadow:0 9px 28px #3645371a;
  padding:14px;
}
.panel-main{background:var(--panel-strong)}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
h2{margin:0;font-size:1.03rem;letter-spacing:.02em}
.tiny{font-size:.75rem;color:var(--muted)}
.row-buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mono-pill{
  border:1px solid var(--line);
  border-radius:999px;
  padding:6px 10px;
  background:#ffffffd9;
  color:#2d4032;
}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.label{display:grid;gap:6px;font-size:.8rem;color:var(--muted)}
.label-full{grid-column:1/-1}
input,textarea,select{
  width:100%;
  border:1px solid var(--line);
  border-radius:12px;
  padding:11px 12px;
  font:inherit;
  color:var(--ink);
  background:#fff;
}
textarea{resize:vertical;min-height:120px}
input:focus,textarea:focus,select:focus{
  outline:2px solid #8fcb9f80;
  border-color:#79b48a;
}
.actions{grid-column:1/-1;display:flex;justify-content:flex-end}
.primary,.ghost{
  border-radius:12px;
  padding:10px 13px;
  font:inherit;
  cursor:pointer;
  transition:transform .12s ease,filter .12s ease;
}
.primary{
  border:0;
  color:#fff;
  font-weight:600;
  background:linear-gradient(135deg,var(--accent),var(--accent-2));
}
.primary:hover{transform:translateY(-1px);filter:saturate(1.08)}
.ghost{
  border:1px solid var(--line);
  background:#fff;
  color:var(--ink);
}
.ghost:hover{transform:translateY(-1px)}
.danger{
  border:1px solid #d8a8a8;
  background:#fff4f4;
  color:#7f2323;
}
.stack{display:grid;gap:10px}
.hint{margin:4px 0 12px;color:var(--muted);font-size:.86rem}
.divider{height:1px;background:var(--line);margin:12px 0}
.wide{width:100%}
.pending-item{
  border:1px solid var(--line);
  border-radius:12px;
  background:#fff;
  padding:10px;
}
.pending-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.pending-tool{
  font-weight:600;
  color:#2b3d2f;
  letter-spacing:.01em;
}
.pending-actions{
  margin-top:8px;
  display:flex;
  gap:8px;
}
.panel-log{margin-top:14px}
#output{
  margin:0;
  min-height:170px;
  max-height:460px;
  overflow:auto;
  border-radius:12px;
  background:var(--log);
  color:var(--log-ink);
  padding:12px 13px;
  font-family:"IBM Plex Mono","Cascadia Code","Consolas",monospace;
  font-size:.85rem;
  line-height:1.5;
  white-space:pre-wrap;
}
@media (max-width:940px){
  .topbar{flex-direction:column}
  .chips{justify-content:flex-start}
  .layout{grid-template-columns:1fr}
}
@media (max-width:680px){
  .deck{padding:18px 12px 28px}
  .form-grid{grid-template-columns:1fr}
  .label-full{grid-column:auto}
  .actions{grid-column:auto;justify-content:stretch}
  .actions .primary{width:100%}
  .pending-actions{flex-direction:column}
  .pending-actions button{width:100%}
}
`;

export const FRONTEND_JS = `const out = document.getElementById("output");
const chatForm = document.getElementById("chatForm");
const pairForm = document.getElementById("pairForm");
const healthBtn = document.getElementById("healthBtn");
const clearBtn = document.getElementById("clearBtn");
const newSessionBtn = document.getElementById("newSessionBtn");
const approveAllBtn = document.getElementById("approveAllBtn");
const denyAllBtn = document.getElementById("denyAllBtn");
const pendingMeta = document.getElementById("pendingMeta");
const pendingList = document.getElementById("pendingList");
const sessionBadge = document.getElementById("sessionBadge");
const modelInput = document.getElementById("model");
const apiKeyInput = document.getElementById("apiKey");
const roleInput = document.getElementById("role");

let sessionId = localStorage.getItem("propai_session_id") || "";
let sessionEvents = null;
let sessionEventsKey = "";
let sessionStreamErrorLogged = false;
const savedModel = localStorage.getItem("propai_openrouter_model");
if (savedModel) modelInput.value = savedModel;

function headers() {
  const apiKey = apiKeyInput.value.trim();
  const role = roleInput.value.trim();
  const h = { "Content-Type": "application/json" };
  if (apiKey) h["x-agent-api-key"] = apiKey;
  if (role) h["x-agent-role"] = role;
  return h;
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function print(label, value) {
  const line = "[" + nowLabel() + "] " + label + "\\n" +
    (typeof value === "string" ? value : JSON.stringify(value, null, 2)) + "\\n\\n";
  out.textContent = line + out.textContent;
}

function setSessionBadge() {
  sessionBadge.textContent = sessionId ? "session: " + sessionId : "session: --";
}

function closeSessionEvents() {
  if (sessionEvents) {
    sessionEvents.close();
    sessionEvents = null;
  }
  sessionEventsKey = "";
  sessionStreamErrorLogged = false;
}

function getSessionEventsUrl() {
  if (!sessionId) return "";
  const params = new URLSearchParams();
  const apiKey = apiKeyInput.value.trim();
  const role = roleInput.value.trim();
  if (apiKey) params.set("apiKey", apiKey);
  if (role) params.set("role", role);
  const query = params.toString();
  return "/agent/session/" + encodeURIComponent(sessionId) + "/events" + (query ? "?" + query : "");
}

function connectSessionEvents(forceReconnect) {
  if (!sessionId || typeof EventSource === "undefined") return;
  const streamUrl = getSessionEventsUrl();
  if (!streamUrl) return;
  if (!forceReconnect && sessionEvents && sessionEventsKey === streamUrl) return;

  closeSessionEvents();
  sessionEventsKey = streamUrl;
  sessionEvents = new EventSource(streamUrl);

  sessionEvents.onopen = () => {
    print("GET /agent/session/:id/events (open)", { sessionId });
  };

  sessionEvents.onerror = () => {
    if (!sessionStreamErrorLogged) {
      sessionStreamErrorLogged = true;
      print("GET /agent/session/:id/events (retrying)", "connection lost, reconnecting");
    }
  };

  sessionEvents.addEventListener("session_snapshot", (event) => {
    try {
      sessionStreamErrorLogged = false;
      const payload = JSON.parse(event.data || "{}");
      if (!payload || !payload.session) return;
      if (payload.session.id && payload.session.id !== sessionId) {
        sessionId = payload.session.id;
        localStorage.setItem("propai_session_id", sessionId);
        setSessionBadge();
      }
      renderPending(payload.session.pendingActions || []);
    } catch (err) {
      print("GET /agent/session/:id/events (parse error)", String(err));
    }
  });
}

function normalizePending(result) {
  if (!result) return [];
  if (Array.isArray(result.pendingActions)) return result.pendingActions;
  if (result.response && Array.isArray(result.response.pendingActions)) return result.response.pendingActions;
  if (result.execution && Array.isArray(result.execution.pendingActions)) return result.execution.pendingActions;
  if (result.rejection && Array.isArray(result.rejection.pendingActions)) return result.rejection.pendingActions;
  return [];
}

function renderPending(actions) {
  const rows = Array.isArray(actions) ? actions : [];
  pendingList.innerHTML = "";

  if (rows.length === 0) {
    pendingMeta.textContent = "No pending actions.";
    return;
  }

  pendingMeta.textContent = rows.length + " pending action(s)";

  rows.forEach((item) => {
    const card = document.createElement("div");
    card.className = "pending-item";

    const head = document.createElement("div");
    head.className = "pending-head";
    head.innerHTML = "<span class='pending-tool'>" + item.tool + "</span><span class='tiny'>" + item.id + "</span>";

    const reason = document.createElement("div");
    reason.className = "tiny";
    reason.textContent = item.reason || "No reason provided";

    const message = document.createElement("div");
    message.className = "tiny";
    message.textContent = item.requestMessage || "";

    const actionsBar = document.createElement("div");
    actionsBar.className = "pending-actions";

    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "primary";
    approve.textContent = "Approve";
    approve.onclick = () => approvePending(item.id);

    const deny = document.createElement("button");
    deny.type = "button";
    deny.className = "ghost danger";
    deny.textContent = "Deny";
    deny.onclick = () => denyPending(item.id);

    actionsBar.appendChild(approve);
    actionsBar.appendChild(deny);

    card.appendChild(head);
    card.appendChild(reason);
    card.appendChild(message);
    card.appendChild(actionsBar);
    pendingList.appendChild(card);
  });
}

async function startSession(forceNew) {
  const body = {};
  if (!forceNew && sessionId) body.sessionId = sessionId;
  const res = await fetch("/agent/session/start", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok || !data.result || !data.result.session) {
    throw new Error("Failed to start session");
  }

  sessionId = data.result.session.id;
  localStorage.setItem("propai_session_id", sessionId);
  setSessionBadge();
  renderPending(data.result.session.pendingActions || []);
  connectSessionEvents(true);
  print("POST /agent/session/start (" + res.status + ")", data);
}

async function ensureSession() {
  if (sessionId) {
    connectSessionEvents(false);
    return;
  }
  await startSession(false);
}

async function approvePending(actionId) {
  try {
    await ensureSession();
    const res = await fetch("/agent/session/" + encodeURIComponent(sessionId) + "/approve", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ actionId })
    });
    const data = await res.json();
    renderPending(normalizePending(data.result));
    print("POST /agent/session/:id/approve (" + res.status + ")", data);
  } catch (err) {
    print("POST /agent/session/:id/approve (error)", String(err));
  }
}

async function denyPending(actionId) {
  try {
    await ensureSession();
    const res = await fetch("/agent/session/" + encodeURIComponent(sessionId) + "/reject", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ actionId })
    });
    const data = await res.json();
    renderPending(normalizePending(data.result));
    print("POST /agent/session/:id/reject (" + res.status + ")", data);
  } catch (err) {
    print("POST /agent/session/:id/reject (error)", String(err));
  }
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await ensureSession();
    const model = document.getElementById("model").value.trim();
    if (model) localStorage.setItem("propai_openrouter_model", model);

    const body = {
      message: document.getElementById("message").value.trim(),
      recipient: document.getElementById("recipient").value.trim() || undefined,
      dryRun: document.getElementById("dryRun").value === "true",
      model: model || undefined,
      autonomy: Number(document.getElementById("autonomy").value)
    };

    const res = await fetch("/agent/session/" + encodeURIComponent(sessionId) + "/message", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.result && data.result.session && data.result.session.id) {
      sessionId = data.result.session.id;
      localStorage.setItem("propai_session_id", sessionId);
      setSessionBadge();
      connectSessionEvents(false);
    }
    renderPending(normalizePending(data.result));
    print("POST /agent/session/:id/message (" + res.status + ")", data);
  } catch (err) {
    print("POST /agent/session/:id/message (error)", String(err));
  }
});

approveAllBtn.addEventListener("click", async () => {
  try {
    await ensureSession();
    const res = await fetch("/agent/session/" + encodeURIComponent(sessionId) + "/approve", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ all: true })
    });
    const data = await res.json();
    renderPending(normalizePending(data.result));
    print("POST /agent/session/:id/approve all (" + res.status + ")", data);
  } catch (err) {
    print("POST /agent/session/:id/approve all (error)", String(err));
  }
});

denyAllBtn.addEventListener("click", async () => {
  try {
    await ensureSession();
    const res = await fetch("/agent/session/" + encodeURIComponent(sessionId) + "/reject", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ all: true })
    });
    const data = await res.json();
    renderPending(normalizePending(data.result));
    print("POST /agent/session/:id/reject all (" + res.status + ")", data);
  } catch (err) {
    print("POST /agent/session/:id/reject all (error)", String(err));
  }
});

newSessionBtn.addEventListener("click", async () => {
  try {
    await startSession(true);
  } catch (err) {
    print("POST /agent/session/start (error)", String(err));
  }
});

pairForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("pairCode").value.trim();
  try {
    const res = await fetch("/whatsapp/pairing/approve", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    print("POST /whatsapp/pairing/approve (" + res.status + ")", data);
  } catch (err) {
    print("POST /whatsapp/pairing/approve (error)", String(err));
  }
});

healthBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    print("GET /health (" + res.status + ")", data);
  } catch (err) {
    print("GET /health (error)", String(err));
  }
});

clearBtn.addEventListener("click", () => {
  out.textContent = "Ready.";
});

apiKeyInput.addEventListener("change", () => {
  connectSessionEvents(true);
});

roleInput.addEventListener("change", () => {
  connectSessionEvents(true);
});

window.addEventListener("beforeunload", () => {
  closeSessionEvents();
});

document.getElementById("message").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    chatForm.requestSubmit();
  }
});

setSessionBadge();
startSession(false).catch((err) => {
  print("POST /agent/session/start (error)", String(err));
});
`;
