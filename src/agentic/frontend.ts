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
            <button id="healthBtn" class="ghost" type="button">Ping Health</button>
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
.stack{display:grid;gap:10px}
.hint{margin:4px 0 12px;color:var(--muted);font-size:.86rem}
.divider{height:1px;background:var(--line);margin:12px 0}
.wide{width:100%}
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
}
`;

export const FRONTEND_JS = `const out = document.getElementById("output");
const chatForm = document.getElementById("chatForm");
const pairForm = document.getElementById("pairForm");
const healthBtn = document.getElementById("healthBtn");
const clearBtn = document.getElementById("clearBtn");
const modelInput = document.getElementById("model");
const savedModel = localStorage.getItem("propai_openrouter_model");
if (savedModel) modelInput.value = savedModel;

function headers() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const role = document.getElementById("role").value.trim();
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

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const model = document.getElementById("model").value.trim();
  if (model) localStorage.setItem("propai_openrouter_model", model);
  const body = {
    message: document.getElementById("message").value.trim(),
    recipient: document.getElementById("recipient").value.trim() || undefined,
    dryRun: document.getElementById("dryRun").value === "true",
    model: model || undefined
  };
  try {
    const res = await fetch("/agent/chat", { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    print("POST /agent/chat (" + res.status + ")", data);
  } catch (err) {
    print("POST /agent/chat (error)", String(err));
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

document.getElementById("message").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    chatForm.requestSubmit();
  }
});
`;
