import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PendingAction = {
  id: string;
  tool: string;
  reason: string;
  requestMessage: string;
  createdAtIso: string;
  risk?: "low" | "medium" | "high";
};

type SessionSnapshot = {
  id: string;
  pendingActions: PendingAction[];
};

type SessionStartResponse = {
  ok: boolean;
  result?: {
    session?: SessionSnapshot;
  };
  error?: string;
};

const SESSION_STORAGE_KEY = "propai_session_id";
const MODEL_STORAGE_KEY = "propai_openrouter_model";

export function App() {
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [autonomy, setAutonomy] = useState<0 | 1 | 2>(1);
  const [apiKey, setApiKey] = useState("");
  const [role, setRole] = useState("");
  const [model, setModel] = useState(localStorage.getItem(MODEL_STORAGE_KEY) || "");
  const [pairCode, setPairCode] = useState("");
  const [sessionId, setSessionId] = useState(localStorage.getItem(SESSION_STORAGE_KEY) || "");
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [logText, setLogText] = useState("Ready.");

  const sessionEventsRef = useRef<EventSource | null>(null);
  const sessionEventsKeyRef = useRef("");
  const sessionStreamErrorLoggedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const nowLabel = useCallback((): string => {
    return new Date().toLocaleTimeString([], { hour12: false });
  }, []);

  const log = useCallback(
    (label: string, value: unknown) => {
      const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      const line = `[${nowLabel()}] ${label}\n${content}\n\n`;
      setLogText((prev) => `${line}${prev}`);
    },
    [nowLabel]
  );

  const headers = useMemo(() => {
    const out: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) out["x-agent-api-key"] = apiKey.trim();
    if (role.trim()) out["x-agent-role"] = role.trim();
    return out;
  }, [apiKey, role]);

  const closeSessionEvents = useCallback(() => {
    if (sessionEventsRef.current) {
      sessionEventsRef.current.close();
      sessionEventsRef.current = null;
    }
    sessionEventsKeyRef.current = "";
    sessionStreamErrorLoggedRef.current = false;
  }, []);

  const connectSessionEvents = useCallback(
    (forceReconnect: boolean) => {
      if (!sessionIdRef.current || typeof EventSource === "undefined") return;

      const params = new URLSearchParams();
      if (apiKey.trim()) params.set("apiKey", apiKey.trim());
      if (role.trim()) params.set("role", role.trim());

      const streamUrl =
        `/agent/session/${encodeURIComponent(sessionIdRef.current)}/events` +
        (params.toString() ? `?${params.toString()}` : "");

      if (
        !forceReconnect &&
        sessionEventsRef.current &&
        sessionEventsKeyRef.current === streamUrl
      ) {
        return;
      }

      closeSessionEvents();
      sessionEventsKeyRef.current = streamUrl;

      const source = new EventSource(streamUrl);
      sessionEventsRef.current = source;

      source.onopen = () => {
        log("GET /agent/session/:id/events (open)", { sessionId: sessionIdRef.current });
      };

      source.onerror = () => {
        if (!sessionStreamErrorLoggedRef.current) {
          sessionStreamErrorLoggedRef.current = true;
          log("GET /agent/session/:id/events (retrying)", "connection lost, reconnecting");
        }
      };

      source.addEventListener("session_snapshot", (event) => {
        try {
          sessionStreamErrorLoggedRef.current = false;
          const payload = JSON.parse((event as MessageEvent).data || "{}") as {
            session?: SessionSnapshot;
          };
          if (!payload.session) return;

          if (payload.session.id && payload.session.id !== sessionIdRef.current) {
            setSessionId(payload.session.id);
            localStorage.setItem(SESSION_STORAGE_KEY, payload.session.id);
          }
          setPendingActions(payload.session.pendingActions || []);
        } catch (error) {
          log("GET /agent/session/:id/events (parse error)", String(error));
        }
      });
    },
    [apiKey, closeSessionEvents, log, role]
  );

  useEffect(() => {
    if (sessionId) {
      connectSessionEvents(false);
    }
  }, [sessionId, apiKey, role, connectSessionEvents]);

  useEffect(() => {
    const onBeforeUnload = () => closeSessionEvents();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      closeSessionEvents();
    };
  }, [closeSessionEvents]);

  const startSession = useCallback(
    async (forceNew: boolean) => {
      const body: { sessionId?: string } = {};
      if (!forceNew && sessionIdRef.current) body.sessionId = sessionIdRef.current;

      const response = await fetch("/agent/session/start", {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as SessionStartResponse;
      if (!payload.ok || !payload.result?.session) {
        throw new Error(payload.error || "Failed to start session");
      }

      const nextSession = payload.result.session;
      setSessionId(nextSession.id);
      sessionIdRef.current = nextSession.id;
      localStorage.setItem(SESSION_STORAGE_KEY, nextSession.id);
      setPendingActions(nextSession.pendingActions || []);
      connectSessionEvents(true);
      log(`POST /agent/session/start (${response.status})`, payload);
    },
    [connectSessionEvents, headers, log]
  );

  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) {
      connectSessionEvents(false);
      return;
    }
    await startSession(false);
  }, [connectSessionEvents, startSession]);

  const normalizePending = useCallback((result: any): PendingAction[] => {
    if (!result) return [];
    if (Array.isArray(result.pendingActions)) return result.pendingActions;
    if (result.response && Array.isArray(result.response.pendingActions)) return result.response.pendingActions;
    if (result.execution && Array.isArray(result.execution.pendingActions)) return result.execution.pendingActions;
    if (result.rejection && Array.isArray(result.rejection.pendingActions)) return result.rejection.pendingActions;
    return [];
  }, []);

  const approvePending = useCallback(
    async (actionId?: string, all = false) => {
      try {
        await ensureSession();
        const response = await fetch(`/agent/session/${encodeURIComponent(sessionIdRef.current)}/approve`, {
          method: "POST",
          headers,
          body: JSON.stringify(all ? { all: true } : { actionId })
        });
        const payload = await response.json();
        setPendingActions(normalizePending(payload.result));
        log(`POST /agent/session/:id/approve (${response.status})`, payload);
      } catch (error) {
        log("POST /agent/session/:id/approve (error)", String(error));
      }
    },
    [ensureSession, headers, log, normalizePending]
  );

  const denyPending = useCallback(
    async (actionId?: string, all = false) => {
      try {
        await ensureSession();
        const response = await fetch(`/agent/session/${encodeURIComponent(sessionIdRef.current)}/reject`, {
          method: "POST",
          headers,
          body: JSON.stringify(all ? { all: true } : { actionId })
        });
        const payload = await response.json();
        setPendingActions(normalizePending(payload.result));
        log(`POST /agent/session/:id/reject (${response.status})`, payload);
      } catch (error) {
        log("POST /agent/session/:id/reject (error)", String(error));
      }
    },
    [ensureSession, headers, log, normalizePending]
  );

  const onSubmitMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        await ensureSession();
        if (model.trim()) {
          localStorage.setItem(MODEL_STORAGE_KEY, model.trim());
        }

        const body = {
          message: message.trim(),
          recipient: recipient.trim() || undefined,
          dryRun,
          model: model.trim() || undefined,
          autonomy
        };

        const response = await fetch(`/agent/session/${encodeURIComponent(sessionIdRef.current)}/message`, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
        const payload = await response.json();
        if (payload?.result?.session?.id) {
          setSessionId(payload.result.session.id);
          sessionIdRef.current = payload.result.session.id;
          localStorage.setItem(SESSION_STORAGE_KEY, payload.result.session.id);
        }
        setPendingActions(normalizePending(payload.result));
        log(`POST /agent/session/:id/message (${response.status})`, payload);
      } catch (error) {
        log("POST /agent/session/:id/message (error)", String(error));
      }
    },
    [autonomy, dryRun, ensureSession, headers, log, message, model, normalizePending, recipient]
  );

  const onSubmitPairing = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        const response = await fetch("/whatsapp/pairing/approve", {
          method: "POST",
          headers,
          body: JSON.stringify({ code: pairCode.trim() })
        });
        const payload = await response.json();
        log(`POST /whatsapp/pairing/approve (${response.status})`, payload);
      } catch (error) {
        log("POST /whatsapp/pairing/approve (error)", String(error));
      }
    },
    [headers, log, pairCode]
  );

  const pingHealth = useCallback(async () => {
    try {
      const response = await fetch("/health");
      const payload = await response.json();
      log(`GET /health (${response.status})`, payload);
    } catch (error) {
      log("GET /health (error)", String(error));
    }
  }, [log]);

  useEffect(() => {
    startSession(false).catch((error) => {
      log("POST /agent/session/start (error)", String(error));
    });
  }, [log, startSession]);

  return (
    <main className="deck">
      <header className="topbar">
        <div>
          <p className="kicker">PropAI Live</p>
          <h1>Command Deck</h1>
          <p className="sub">React shell for session control, approvals, and execution logs.</p>
        </div>
        <div className="chips">
          <span className="chip chip-live">LIVE</span>
          <span className="chip">/agent/session/:id/events</span>
          <span className="chip">/whatsapp/pairing/approve</span>
        </div>
      </header>

      <section className="layout">
        <article className="panel panel-main">
          <div className="panel-head">
            <h2>Agent Console</h2>
            <div className="row-buttons">
              <span className="tiny mono-pill">session: {sessionId || "--"}</span>
              <button className="ghost" type="button" onClick={() => startSession(true)}>
                New Session
              </button>
              <button className="ghost" type="button" onClick={pingHealth}>
                Ping Health
              </button>
            </div>
          </div>

          <form className="form-grid" onSubmit={onSubmitMessage}>
            <label className="label label-full">
              Message
              <textarea
                rows={5}
                placeholder="Post my 3 BHK in Wakad to 99acres and MagicBricks, then send WhatsApp follow-up"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>

            <label className="label">
              Recipient (optional)
              <input
                placeholder="+919999999999"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
              />
            </label>

            <label className="label">
              Dry Run
              <select
                value={String(dryRun)}
                onChange={(event) => setDryRun(event.target.value === "true")}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>

            <label className="label">
              Autonomy
              <select
                value={String(autonomy)}
                onChange={(event) => setAutonomy(Number(event.target.value) as 0 | 1 | 2)}
              >
                <option value="0">0 (suggest only)</option>
                <option value="1">1 (approve local writes)</option>
                <option value="2">2 (approve local + external)</option>
              </select>
            </label>

            <label className="label">
              API Key (optional)
              <input
                placeholder="x-agent-api-key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>

            <label className="label">
              Role (optional)
              <input
                placeholder="realtor_admin"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </label>

            <label className="label label-full">
              Model Override (optional)
              <input
                placeholder="openai/gpt-4o-mini"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>

            <div className="actions">
              <button className="primary" type="submit">
                Execute Agent Plan
              </button>
            </div>
          </form>
        </article>

        <aside className="panel panel-side">
          <h2>Approval Queue</h2>
          <p className="hint">Queued actions stay in this session until approved or denied.</p>
          <div className="tiny">
            {pendingActions.length > 0 ? `${pendingActions.length} pending action(s)` : "No pending actions."}
          </div>
          <div className="stack">
            {pendingActions.map((item) => (
              <div key={item.id} className="pending-item">
                <div className="pending-head">
                  <span className="pending-tool">{item.tool}</span>
                  <span className="tiny">{item.id}</span>
                </div>
                <div className="tiny">{item.reason || "No reason provided"}</div>
                <div className="tiny">{item.requestMessage || ""}</div>
                <div className="pending-actions">
                  <button className="primary" type="button" onClick={() => approvePending(item.id)}>
                    Approve
                  </button>
                  <button className="ghost danger" type="button" onClick={() => denyPending(item.id)}>
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="row-buttons">
            <button className="primary wide" type="button" onClick={() => approvePending(undefined, true)}>
              Approve All
            </button>
            <button className="ghost wide" type="button" onClick={() => denyPending(undefined, true)}>
              Deny All
            </button>
          </div>

          <div className="divider" />
          <h2>Pairing Approval</h2>
          <form className="stack" onSubmit={onSubmitPairing}>
            <label className="label">
              Pairing Code
              <input
                maxLength={6}
                placeholder="123456"
                value={pairCode}
                onChange={(event) => setPairCode(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              Approve Pairing Code
            </button>
          </form>

          <div className="divider" />
          <button className="ghost wide" type="button" onClick={() => setLogText("Ready.")}>
            Clear Log
          </button>
        </aside>
      </section>

      <section className="panel panel-log">
        <div className="panel-head">
          <h2>Execution Log</h2>
          <span className="tiny">Newest first</span>
        </div>
        <pre>{logText}</pre>
      </section>
    </main>
  );
}
