export const FRONTEND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PropAI Live Console</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <p class="eyebrow">PropAI Live</p>
        <h1>Realtor Agent Console</h1>
        <p class="sub">Run tools, approve pairing, and test OpenRouter-backed /agent/chat.</p>
      </header>

      <section class="grid">
        <article class="card">
          <div class="card-head">
            <h2>Agent Chat</h2>
            <button id="healthBtn" class="ghost" type="button">Check Health</button>
          </div>
          <form id="chatForm" class="stack">
            <label>Message</label>
            <textarea id="message" rows="4" placeholder="Post my 3 BHK in Wakad to 99acres and send WhatsApp follow-up"></textarea>
            <div class="split">
              <div>
                <label>Recipient (optional)</label>
                <input id="recipient" placeholder="+919999999999" />
              </div>
              <div>
                <label>Dry Run</label>
                <select id="dryRun">
                  <option value="true" selected>true</option>
                  <option value="false">false</option>
                </select>
              </div>
            </div>
            <div class="split">
              <div>
                <label>API Key (optional)</label>
                <input id="apiKey" placeholder="x-agent-api-key" />
              </div>
              <div>
                <label>Role (optional)</label>
                <input id="role" placeholder="realtor_admin" />
              </div>
            </div>
            <div>
              <label>OpenRouter Model (optional)</label>
              <input id="model" placeholder="openai/gpt-4o-mini" />
            </div>
            <button class="primary" type="submit">Run /agent/chat</button>
          </form>
        </article>

        <article class="card">
          <h2>Pairing Approval</h2>
          <form id="pairForm" class="stack">
            <label>Pairing Code</label>
            <input id="pairCode" maxlength="6" placeholder="123456" />
            <button class="primary" type="submit">Approve Pairing</button>
          </form>
          <p class="hint">Requires <code>WHATSAPP_DM_POLICY=pairing</code> and admin headers.</p>
        </article>
      </section>

      <section class="card output">
        <div class="card-head">
          <h2>Response</h2>
          <button id="clearBtn" class="ghost" type="button">Clear</button>
        </div>
        <pre id="output">Ready.</pre>
      </section>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
`;

export const FRONTEND_CSS = `:root{
  --bg:#f1f5ef;
  --ink:#1e2a21;
  --muted:#5c6f61;
  --card:#ffffffd9;
  --line:#c9d6ca;
  --accent:#1f7a45;
  --accent-2:#0f5130;
}
*{box-sizing:border-box}
body{
  margin:0;
  font-family:"Space Grotesk","Aptos","Segoe UI",sans-serif;
  color:var(--ink);
  background:
    radial-gradient(1200px 500px at -10% -20%, #bddbc2 0%, transparent 60%),
    radial-gradient(900px 500px at 110% 10%, #e8d8b0 0%, transparent 50%),
    var(--bg);
}
.shell{max-width:1040px;margin:0 auto;padding:28px 18px 40px}
.hero h1{margin:6px 0 6px;font-size:2rem;letter-spacing:.2px}
.hero .sub{margin:0 0 18px;color:var(--muted)}
.eyebrow{margin:0;color:var(--accent-2);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.grid{display:grid;gap:14px;grid-template-columns:2fr 1fr}
.card{
  backdrop-filter: blur(2px);
  background:var(--card);
  border:1px solid var(--line);
  border-radius:14px;
  padding:14px;
  box-shadow:0 8px 28px #5b785d1e;
}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
h2{margin:0 0 10px;font-size:1rem}
.stack{display:grid;gap:8px}
.split{display:grid;gap:8px;grid-template-columns:1fr 1fr}
label{font-size:.82rem;color:var(--muted)}
input,textarea,select{
  width:100%;
  border:1px solid var(--line);
  border-radius:10px;
  padding:10px 11px;
  font:inherit;
  background:#fff;
}
textarea{resize:vertical}
.primary,.ghost{
  font:inherit;
  border-radius:10px;
  padding:10px 12px;
  cursor:pointer;
}
.primary{
  border:0;
  color:#fff;
  background:linear-gradient(135deg,var(--accent),var(--accent-2));
  transition:transform .12s ease;
}
.primary:hover{transform:translateY(-1px)}
.ghost{border:1px solid var(--line);background:#fff;color:var(--ink)}
.output pre{
  margin:0;
  min-height:150px;
  max-height:460px;
  overflow:auto;
  background:#0f1712;
  color:#daf5df;
  border-radius:10px;
  padding:12px;
  white-space:pre-wrap;
}
.hint{color:var(--muted);font-size:.84rem}
@media (max-width:900px){
  .grid{grid-template-columns:1fr}
  .split{grid-template-columns:1fr}
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

function print(label, value) {
  const line = "[" + new Date().toLocaleTimeString() + "] " + label + "\\n" +
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
`;
