import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileCheck2,
  FlaskConical,
  Gauge,
  Loader2,
  PlayCircle,
  RefreshCcw,
  ScrollText,
  Send,
  Settings2,
  ShieldCheck
} from "lucide-react";

type ModuleScreen = "ops" | "broadcast" | "agent" | "queue" | "settings";
type OpsView = "dashboard" | "consents" | "intent_lab" | "audit";
type BroadcastView = "campaign_create" | "campaign_ops";
type AgentRole = "realtor_admin" | "ops";
type ConsentStatus = "opted_in" | "opted_out";
type CampaignCategory = "utility" | "marketing";
type ConsentMode = "required" | "optional" | "disabled";
type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "stopped";
type NoticeTone = "success" | "error" | "info";
type Severity = "info" | "success" | "warn" | "error";
type GroupPostStatus = "queued" | "processing" | "sent" | "failed";

type ApiEnvelope<T> = { ok: boolean; result?: T; error?: string };
type ApiConfig = { baseUrl: string; apiKey: string; role: AgentRole };
type ConsentRecord = { phoneE164: string; status: ConsentStatus; source: string; purpose: string; updatedAtIso: string };
type Campaign = {
  id: string;
  name: string;
  client: string;
  createdAtIso: string;
  status: CampaignStatus;
  template: { name: string; language: string; category: CampaignCategory };
  compliance: { consentMode: ConsentMode; requireApproval: boolean; approvedBy?: string; reraProjectId?: string };
  audience: string[];
  progress: { processed: number; sent: number; optedOut: number; blockedByPolicy: number };
  lastPolicyCheck?: { atIso: string; ok: boolean; reasons: string[]; warnings: string[] };
  lastRunAtIso?: string;
};
type RunRecipient = { phone: string; action: "sent" | "opted_out" | "blocked"; reason?: string };
type IntentResult = {
  intent: "site_visit" | "price_sheet" | "loan_help" | "callback" | "brochure_request" | "not_interested" | "stop" | "general_query";
  confidence: number;
  route: string;
  fields: Record<string, unknown>;
  provider: "heuristic" | "ai" | "heuristic_fallback";
};
type Notice = { tone: NoticeTone; message: string };
type Audit = { id: string; atIso: string; action: string; severity: Severity; details: string };
type CampaignForm = {
  name: string;
  client: string;
  templateName: string;
  language: string;
  category: CampaignCategory;
  consentMode: ConsentMode;
  requireApproval: boolean;
  reraProjectId: string;
  audienceRaw: string;
};
type ConnectorHealthStatus = "healthy" | "degraded" | "unhealthy" | "unconfigured";
type ConnectorHealthSnapshot = {
  generatedAtIso: string;
  connectors: Array<{
    connector: { id: string; name: string; provider: string; domain: string };
    status: ConnectorHealthStatus;
    checks: Array<{ name: string; ok: boolean; detail: string }>;
  }>;
};
type GroupPostQueueItem = {
  id: string;
  kind: "listing" | "requirement";
  priority: "normal" | "high";
  content: string;
  status: GroupPostStatus;
  nextPostAtIso: string;
  attempts: number;
  lastError?: string;
  targets: string[];
};
type GroupPostingServiceStatus = {
  scheduler: {
    enabled: boolean;
    running: boolean;
    intervalMs: number;
    batchSize: number;
    defaultTargets: string[];
  };
  queue: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    nextDueAtIso?: string;
  };
};
type QueueRuntimeStatus = {
  enabled: boolean;
  ready: boolean;
  redisConfigured: boolean;
  queueName: string;
  attempts: number;
  backoffMs: number;
  concurrency: number;
  timeoutMs: number;
  reason?: string;
};
type PendingActionView = {
  id: string;
  tool: string;
  reason: string;
  requestMessage: string;
  createdAtIso: string;
  risk?: "low" | "medium" | "high";
};
type AgentSessionSnapshot = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  turns: number;
  pendingActions: PendingActionView[];
  transcript: Array<{ role: "user" | "assistant" | "system"; content: string; timestampIso: string }>;
};
type BulkUploadMode = "append" | "replace";

const STORE = { api: "propai.realtor.ui.api.v1", audit: "propai.realtor.ui.audit.v1" } as const;
const DATE_FMT = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
  apiKey: "",
  role: "realtor_admin"
};
const DEFAULT_FORM: CampaignForm = {
  name: "",
  client: "default",
  templateName: "",
  language: "en",
  category: "marketing",
  consentMode: "required",
  requireApproval: true,
  reraProjectId: "",
  audienceRaw: ""
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
function normalizeConfig(value: Partial<ApiConfig> | null | undefined): ApiConfig {
  const baseUrl = String(value?.baseUrl || DEFAULT_CONFIG.baseUrl).trim().replace(/\/+$/, "");
  return { baseUrl: baseUrl || DEFAULT_CONFIG.baseUrl, apiKey: String(value?.apiKey || "").trim(), role: value?.role === "ops" ? "ops" : "realtor_admin" };
}
function fmt(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}
function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function parseAudience(raw: string) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\n,;]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}
function statusClass(status: CampaignStatus) {
  if (status === "running") return "bg-amber-100 text-amber-800";
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "stopped") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}
function noticeClass(tone: NoticeTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}
function connectorStatusClass(status: ConnectorHealthStatus) {
  if (status === "healthy") return "bg-emerald-100 text-emerald-800";
  if (status === "degraded") return "bg-amber-100 text-amber-800";
  if (status === "unconfigured") return "bg-slate-100 text-slate-700";
  return "bg-rose-100 text-rose-800";
}
function groupStatusClass(status: GroupPostStatus) {
  if (status === "queued") return "bg-slate-100 text-slate-700";
  if (status === "processing") return "bg-sky-100 text-sky-800";
  if (status === "sent") return "bg-emerald-100 text-emerald-800";
  return "bg-rose-100 text-rose-800";
}
function normalizePhoneToken(token: string): string | null {
  const trimmed = token.trim().replace(/^["']+|["']+$/g, "");
  if (!trimmed) return null;
  let compact = trimmed.replace(/[^\d+]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^\d{8,15}$/.test(compact)) return `+${compact}`;
  return null;
}
function parseBulkAudience(raw: string): { phones: string[]; rejected: number } {
  const tokens = String(raw || "")
    .replace(/\r/g, "\n")
    .split(/[\n,;\t, ]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const normalized = tokens.map((token) => normalizePhoneToken(token));
  const phones = Array.from(new Set(normalized.filter((value): value is string => Boolean(value))));
  return { phones, rejected: Math.max(0, tokens.length - phones.length) };
}
function moduleFromHash(): ModuleScreen {
  if (typeof window === "undefined") return "ops";
  const match = window.location.hash.match(/^#\/(ops|broadcast|agent|queue|settings)$/);
  return match ? (match[1] as ModuleScreen) : "ops";
}

export function App() {
  const [screen, setScreen] = useState<ModuleScreen>(() => moduleFromHash());
  const [opsView, setOpsView] = useState<OpsView>("dashboard");
  const [broadcastView, setBroadcastView] = useState<BroadcastView>("campaign_create");
  const [config, setConfig] = useState<ApiConfig>(() => normalizeConfig(readJson(STORE.api, DEFAULT_CONFIG)));
  const [draftConfig, setDraftConfig] = useState<ApiConfig>(() => normalizeConfig(readJson(STORE.api, DEFAULT_CONFIG)));
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [health, setHealth] = useState<"unknown" | "healthy" | "down">("unknown");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [audit, setAudit] = useState<Audit[]>(() => readJson(STORE.audit, []));
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [consentFilter, setConsentFilter] = useState<"all" | ConsentStatus>("all");
  const [addPhone, setAddPhone] = useState("");
  const [revokePhone, setRevokePhone] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupStatus, setLookupStatus] = useState<string>("");
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(DEFAULT_FORM);
  const [bulkUploadMode, setBulkUploadMode] = useState<BulkUploadMode>("append");
  const [bulkUploadSummary, setBulkUploadSummary] = useState("");
  const [bulkPasteRaw, setBulkPasteRaw] = useState("");
  const [approvedBy, setApprovedBy] = useState("compliance.lead");
  const [approvalNote, setApprovalNote] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [runRecipients, setRunRecipients] = useState<RunRecipient[]>([]);
  const [intentText, setIntentText] = useState("");
  const [intentUseAi, setIntentUseAi] = useState(true);
  const [intentModel, setIntentModel] = useState("");
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [connectorSnapshot, setConnectorSnapshot] = useState<ConnectorHealthSnapshot | null>(null);
  const [groupStatus, setGroupStatus] = useState<GroupPostingServiceStatus | null>(null);
  const [groupQueue, setGroupQueue] = useState<GroupPostQueueItem[]>([]);
  const [groupQueueFilter, setGroupQueueFilter] = useState<"all" | GroupPostStatus>("all");
  const [queueRuntime, setQueueRuntime] = useState<QueueRuntimeStatus | null>(null);
  const [agentSessions, setAgentSessions] = useState<AgentSessionSnapshot[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [agentAutonomy, setAgentAutonomy] = useState<0 | 1 | 2>(1);

  const selectedCampaign = useMemo(() => campaigns.find((c) => c.id === selectedCampaignId) || null, [campaigns, selectedCampaignId]);
  const selectedSession = useMemo(() => agentSessions.find((s) => s.id === selectedSessionId) || null, [agentSessions, selectedSessionId]);
  const consentStats = useMemo(() => ({ total: consents.length, in: consents.filter((c) => c.status === "opted_in").length, out: consents.filter((c) => c.status === "opted_out").length }), [consents]);
  const campaignStats = useMemo(() => ({ total: campaigns.length, run: campaigns.filter((c) => c.status === "running").length, draft: campaigns.filter((c) => c.status === "draft").length }), [campaigns]);
  const audiencePreview = useMemo(() => parseAudience(campaignForm.audienceRaw), [campaignForm.audienceRaw]);
  const connectorStats = useMemo(() => ({
    total: connectorSnapshot?.connectors.length || 0,
    healthy: (connectorSnapshot?.connectors || []).filter((item) => item.status === "healthy").length,
    degraded: (connectorSnapshot?.connectors || []).filter((item) => item.status === "degraded").length,
    unhealthy: (connectorSnapshot?.connectors || []).filter((item) => item.status === "unhealthy").length
  }), [connectorSnapshot]);
  const pendingActionCount = useMemo(() => agentSessions.reduce((sum, session) => sum + session.pendingActions.length, 0), [agentSessions]);

  const addAudit = useCallback((action: string, severity: Severity, details: string) => {
    setAudit((prev) => [{ id: uid("evt"), atIso: new Date().toISOString(), action, severity, details }, ...prev].slice(0, 200));
  }, []);
  const fail = useCallback(
    (action: string, context: string, error: unknown) => {
      const msg = `${context}: ${error instanceof Error ? error.message : "Unexpected error"}`;
      setNotice({ tone: "error", message: msg });
      addAudit(action, "error", msg);
    },
    [addAudit]
  );
  const withBusy = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      return await fn();
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  }, []);

  const requestRaw = useCallback(
    async <T,>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<{ status: number; payload: ApiEnvelope<T> | null }> => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) headers["x-agent-api-key"] = config.apiKey;
      headers["x-agent-role"] = config.role;
      const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;
      const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      let payload: ApiEnvelope<T> | null = null;
      if (text) {
        try {
          payload = JSON.parse(text) as ApiEnvelope<T>;
        } catch {
          payload = null;
        }
      }
      return { status: response.status, payload };
    },
    [config]
  );
  const request = useCallback(
    async <T,>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> => {
      const { status, payload } = await requestRaw<T>(path, method, body);
      if (status >= 400 || !payload?.ok) throw new Error(payload?.error || `HTTP ${status}`);
      return (payload.result ?? ({} as T)) as T;
    },
    [requestRaw]
  );

  const probeHealth = useCallback(async () => {
    const { status, payload } = await requestRaw<{ service: string }>("/health");
    const ok = status === 200 && Boolean(payload?.ok);
    setHealth(ok ? "healthy" : "down");
    return ok;
  }, [requestRaw]);
  const loadConsents = useCallback(async () => {
    const q = consentFilter === "all" ? "" : `?status=${consentFilter}`;
    const data = await request<{ records: ConsentRecord[] }>(`/realtor/consent/list${q}`);
    setConsents(data.records);
  }, [consentFilter, request]);
  const loadCampaigns = useCallback(async () => {
    const data = await request<{ campaigns: Campaign[] }>("/realtor/campaign/list");
    setCampaigns(data.campaigns);
  }, [request]);
  const loadConnectorHealth = useCallback(async () => {
    const data = await request<ConnectorHealthSnapshot>("/connectors/health");
    setConnectorSnapshot(data);
  }, [request]);
  const loadGroupStatus = useCallback(async () => {
    const data = await request<GroupPostingServiceStatus>("/group-posting/status");
    setGroupStatus(data);
  }, [request]);
  const loadGroupQueue = useCallback(async () => {
    const q = groupQueueFilter === "all" ? "" : `?status=${groupQueueFilter}`;
    const data = await request<{ items: GroupPostQueueItem[] }>(`/group-posting/queue${q}`);
    setGroupQueue(data.items);
  }, [groupQueueFilter, request]);
  const loadQueueRuntime = useCallback(async () => {
    const data = await request<QueueRuntimeStatus>("/ops/queue/status");
    setQueueRuntime(data);
  }, [request]);
  const loadAgentSessions = useCallback(async () => {
    const data = await request<{ sessions: AgentSessionSnapshot[] }>("/agent/sessions");
    setAgentSessions(data.sessions);
  }, [request]);
  const loadAgentSession = useCallback(async (id: string) => {
    const data = await request<{ session: AgentSessionSnapshot }>(`/agent/session/${encodeURIComponent(id)}`);
    setAgentSessions((prev) => [data.session, ...prev.filter((item) => item.id !== id)]);
  }, [request]);

  const refreshAll = useCallback(async () => {
    await withBusy("refresh", async () => {
      try {
        const ok = await probeHealth();
        if (!ok) {
          setNotice({ tone: "error", message: "Backend unreachable." });
          return;
        }
        try {
          await loadConnectorHealth();
        } catch {
          // connector snapshot is optional
        }
        if (!config.apiKey) {
          setNotice({ tone: "info", message: "Backend healthy. Add AGENT_API_KEY in Settings for protected endpoints." });
          return;
        }
        await Promise.all([loadConsents(), loadCampaigns(), loadGroupStatus(), loadGroupQueue(), loadQueueRuntime(), loadAgentSessions()]);
        setNotice({ tone: "success", message: "Data synced." });
      } catch (error) {
        fail("refresh", "Refresh failed", error);
      }
    });
  }, [config.apiKey, fail, loadAgentSessions, loadCampaigns, loadConnectorHealth, loadConsents, loadGroupQueue, loadGroupStatus, loadQueueRuntime, probeHealth, withBusy]);

  useEffect(() => {
    writeJson(STORE.audit, audit);
  }, [audit]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!campaigns.length) setSelectedCampaignId("");
    else if (!selectedCampaignId || !campaigns.some((c) => c.id === selectedCampaignId)) setSelectedCampaignId(campaigns[0].id);
  }, [campaigns, selectedCampaignId]);
  useEffect(() => {
    if (!agentSessions.length) setSelectedSessionId("");
    else if (!selectedSessionId || !agentSessions.some((session) => session.id === selectedSessionId)) setSelectedSessionId(agentSessions[0].id);
  }, [agentSessions, selectedSessionId]);
  useEffect(() => {
    const onHashChange = () => setScreen(moduleFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    const target = `#/${screen}`;
    if (window.location.hash !== target) window.history.replaceState(null, "", target);
  }, [screen]);
  useEffect(() => {
    if (!config.apiKey) return;
    void loadGroupQueue().catch(() => undefined);
  }, [config.apiKey, groupQueueFilter, loadGroupQueue]);
  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const nav: Array<{ id: ModuleScreen; label: string; icon: typeof Gauge }> = [
    { id: "ops", label: "Ops", icon: Gauge },
    { id: "agent", label: "Agent", icon: Bot },
    { id: "queue", label: "Queue", icon: PlayCircle },
    { id: "broadcast", label: "Broadcast", icon: Send },
    { id: "settings", label: "Settings", icon: Settings2 }
  ];

  const saveSettings = () => {
    const next = normalizeConfig(draftConfig);
    setConfig(next);
    writeJson(STORE.api, next);
    setNotice({ tone: "success", message: "Settings saved." });
    addAudit("settings", "success", `Updated target ${next.baseUrl}.`);
  };
  const addConsent = async () => {
    if (!addPhone.trim()) return setNotice({ tone: "error", message: "Phone required." });
    await withBusy("add", async () => {
      try {
        await request("/realtor/consent/add", "POST", { phone: addPhone.trim(), source: "manual", purpose: "marketing", channel: "whatsapp" });
        setAddPhone("");
        await loadConsents();
        setNotice({ tone: "success", message: "Consent added." });
        addAudit("consent_add", "success", `Added ${addPhone.trim()}.`);
      } catch (error) {
        fail("consent_add", "Add consent failed", error);
      }
    });
  };
  const revokeConsent = async () => {
    if (!revokePhone.trim()) return setNotice({ tone: "error", message: "Phone required." });
    await withBusy("revoke", async () => {
      try {
        await request("/realtor/consent/revoke", "POST", { phone: revokePhone.trim(), source: "manual", reason: "user-request" });
        setRevokePhone("");
        await loadConsents();
        setNotice({ tone: "success", message: "Consent revoked." });
        addAudit("consent_revoke", "warn", `Revoked ${revokePhone.trim()}.`);
      } catch (error) {
        fail("consent_revoke", "Revoke failed", error);
      }
    });
  };
  const lookupConsent = async () => {
    if (!lookupPhone.trim()) return setNotice({ tone: "error", message: "Phone required." });
    await withBusy("lookup", async () => {
      try {
        const q = encodeURIComponent(lookupPhone.trim());
        const data = await request<{ phone: string; record: ConsentRecord | null; canMessage: boolean }>(`/realtor/consent/status?phone=${q}`);
        setLookupStatus(`${data.record?.status || "not_found"} | canMessage=${data.canMessage ? "yes" : "no"}`);
      } catch (error) {
        fail("consent_lookup", "Lookup failed", error);
      }
    });
  };
  const createCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.templateName.trim()) return setNotice({ tone: "error", message: "Name and template required." });
    await withBusy("create", async () => {
      try {
        const data = await request<{ campaign: Campaign }>("/realtor/campaign/create", "POST", {
          name: campaignForm.name,
          client: campaignForm.client,
          templateName: campaignForm.templateName,
          language: campaignForm.language,
          category: campaignForm.category,
          audience: parseAudience(campaignForm.audienceRaw),
          consentMode: campaignForm.consentMode,
          requireApproval: campaignForm.requireApproval,
          reraProjectId: campaignForm.reraProjectId || undefined
        });
        await loadCampaigns();
        setSelectedCampaignId(data.campaign.id);
        setScreen("broadcast");
        setBroadcastView("campaign_ops");
        setNotice({ tone: "success", message: `Campaign ${data.campaign.id} created.` });
      } catch (error) {
        fail("campaign_create", "Create failed", error);
      }
    });
  };

  const preflightCampaign = async () => {
    if (!selectedCampaignId) return setNotice({ tone: "error", message: "Select a campaign." });
    await withBusy("preflight", async () => {
      try {
        const data = await request<{ preflight: { ok: boolean }; errors: string[] }>("/realtor/campaign/preflight", "POST", { id: selectedCampaignId });
        await loadCampaigns();
        setNotice({ tone: data.preflight.ok ? "success" : "error", message: data.preflight.ok ? "Preflight passed." : `Preflight blocked: ${data.errors.join(" | ")}` });
      } catch (error) {
        fail("campaign_preflight", "Preflight failed", error);
      }
    });
  };
  const approveCampaign = async () => {
    if (!selectedCampaignId) return setNotice({ tone: "error", message: "Select a campaign." });
    if (!approvedBy.trim()) return setNotice({ tone: "error", message: "approvedBy is required." });
    await withBusy("approve", async () => {
      try {
        await request("/realtor/campaign/approve", "POST", { id: selectedCampaignId, approvedBy: approvedBy.trim(), note: approvalNote.trim() || undefined });
        await loadCampaigns();
        setNotice({ tone: "success", message: "Campaign approved." });
      } catch (error) {
        fail("campaign_approve", "Approval failed", error);
      }
    });
  };
  const runCampaign = async () => {
    if (!selectedCampaignId) return setNotice({ tone: "error", message: "Select a campaign." });
    await withBusy("run", async () => {
      try {
        const res = await requestRaw<{ campaign: Campaign; processedRecipients?: RunRecipient[]; errors?: string[] }>("/realtor/campaign/run", "POST", { id: selectedCampaignId, dryRun });
        if (res.status === 200 && res.payload?.ok) {
          setRunRecipients(res.payload.result?.processedRecipients || []);
          await loadCampaigns();
          setNotice({ tone: "success", message: `Run completed (${dryRun ? "dry" : "live"}).` });
          return;
        }
        if (res.status === 409 && res.payload?.result) {
          setRunRecipients([]);
          await loadCampaigns();
          setNotice({ tone: "error", message: `Run blocked: ${(res.payload.result.errors || []).join(" | ") || "policy error"}` });
          return;
        }
        throw new Error(res.payload?.error || `HTTP ${res.status}`);
      } catch (error) {
        fail("campaign_run", "Run failed", error);
      }
    });
  };
  const classifyIntent = async () => {
    if (!intentText.trim()) return setNotice({ tone: "error", message: "Message is required." });
    await withBusy("intent", async () => {
      try {
        const data = await request<IntentResult>("/realtor/intent/classify", "POST", {
          text: intentText.trim(),
          useAi: intentUseAi,
          model: intentModel.trim() || undefined
        });
        setIntentResult(data);
        setNotice({ tone: "success", message: `Intent ${data.intent} (${Math.round(data.confidence * 100)}%).` });
      } catch (error) {
        fail("intent_classify", "Classification failed", error);
      }
    });
  };
  const clearAudit = () => {
    setAudit([]);
    setNotice({ tone: "info", message: "Audit cleared." });
  };
  const applyBulkNumbers = (raw: string, source: string) => {
    const parsed = parseBulkAudience(raw);
    if (parsed.phones.length === 0) {
      setBulkUploadSummary(`No valid numbers found in ${source}.`);
      setNotice({ tone: "error", message: "No valid numbers found for bulk upload." });
      return;
    }
    const existing = parseAudience(campaignForm.audienceRaw);
    const audience = bulkUploadMode === "replace" ? parsed.phones : Array.from(new Set([...existing, ...parsed.phones]));
    setCampaignForm((p) => ({ ...p, audienceRaw: audience.join("\n") }));
    const summary = `${bulkUploadMode === "replace" ? "Replaced" : "Appended"} ${parsed.phones.length} numbers from ${source}. Rejected ${parsed.rejected}.`;
    setBulkUploadSummary(summary);
    setNotice({ tone: "success", message: summary });
    addAudit("campaign_bulk_upload", "info", summary);
  };
  const onBulkFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      applyBulkNumbers(text, file.name);
    } catch (error) {
      fail("campaign_bulk_upload", "Upload parse failed", error);
    } finally {
      event.target.value = "";
    }
  };
  const sendAgentMessage = async () => {
    if (!selectedSessionId) return setNotice({ tone: "error", message: "Select a session." });
    if (!agentMessage.trim()) return setNotice({ tone: "error", message: "Message is required." });
    await withBusy("agent_message", async () => {
      try {
        const data = await request<{ session: AgentSessionSnapshot }>(`/agent/session/${encodeURIComponent(selectedSessionId)}/message`, "POST", {
          message: agentMessage.trim(),
          autonomy: agentAutonomy
        });
        setAgentMessage("");
        setAgentSessions((prev) => [data.session, ...prev.filter((item) => item.id !== data.session.id)]);
        setNotice({ tone: "success", message: "Agent message processed." });
      } catch (error) {
        fail("agent_message", "Agent message failed", error);
      }
    });
  };
  const startAgentSession = async () => {
    await withBusy("agent_start", async () => {
      try {
        const data = await request<{ session: AgentSessionSnapshot }>("/agent/session/start", "POST", {});
        setAgentSessions((prev) => [data.session, ...prev.filter((item) => item.id !== data.session.id)]);
        setSelectedSessionId(data.session.id);
        setNotice({ tone: "success", message: `Session ${data.session.id} started.` });
      } catch (error) {
        fail("agent_start", "Start session failed", error);
      }
    });
  };
  const approveAgentAction = async (actionId?: string) => {
    if (!selectedSessionId) return setNotice({ tone: "error", message: "Select a session." });
    await withBusy("agent_approve", async () => {
      try {
        await request(`/agent/session/${encodeURIComponent(selectedSessionId)}/approve`, "POST", actionId ? { actionId } : { all: true });
        await Promise.all([loadAgentSession(selectedSessionId), loadQueueRuntime()]);
        setNotice({ tone: "success", message: actionId ? "Action approved." : "All actions approved." });
      } catch (error) {
        fail("agent_approve", "Approve failed", error);
      }
    });
  };
  const rejectAgentAction = async (actionId?: string) => {
    if (!selectedSessionId) return setNotice({ tone: "error", message: "Select a session." });
    await withBusy("agent_reject", async () => {
      try {
        await request(`/agent/session/${encodeURIComponent(selectedSessionId)}/reject`, "POST", actionId ? { actionId } : { all: true });
        await loadAgentSession(selectedSessionId);
        setNotice({ tone: "success", message: actionId ? "Action rejected." : "All actions rejected." });
      } catch (error) {
        fail("agent_reject", "Reject failed", error);
      }
    });
  };

  const progress = selectedCampaign?.audience.length
    ? Math.round((selectedCampaign.progress.processed / selectedCampaign.audience.length) * 100)
    : 0;

  return (
    <div className="min-h-screen app-background px-4 py-5 text-slate-900 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="surface-panel fade-rise flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">PropAI Agentic Operations Console</h1>
            <p className="mt-1 text-sm text-slate-600">Ops-first control plane for sessions, queue runtime, and broadcast execution.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${health === "healthy" ? "bg-emerald-100 text-emerald-800" : health === "down" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>
              {health === "healthy" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <AlertCircle className="mr-1 h-3.5 w-3.5" />}
              API {health}
            </span>
            <button type="button" onClick={() => void refreshAll()} disabled={Boolean(busy.refresh)} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-60">
              {busy.refresh ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1 h-3.5 w-3.5" />}Sync
            </button>
          </div>
        </header>

        {notice && <div className={`fade-rise mt-4 rounded-2xl border px-4 py-3 text-sm ${noticeClass(notice.tone)}`}>{notice.message}</div>}

        <div className="mt-5 grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="surface-panel rounded-3xl p-3 lg:sticky lg:top-5 lg:h-[calc(100vh-72px)] lg:overflow-auto">
            <div className="space-y-1">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = screen === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => { setScreen(item.id); if (item.id === "ops") setOpsView("dashboard"); if (item.id === "broadcast") setBroadcastView("campaign_create"); }} className={`w-full rounded-2xl px-3 py-2 text-left ${active ? "bg-emerald-600 text-white" : "hover:bg-slate-100"}`}>
                    <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4" />{item.label}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Live Snapshot</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between"><span>Agent Pending</span><span className="font-semibold text-indigo-700">{pendingActionCount}</span></div>
                <div className="flex justify-between"><span>Queue Ready</span><span className={`font-semibold ${queueRuntime?.ready ? "text-emerald-700" : "text-rose-700"}`}>{queueRuntime ? String(queueRuntime.ready) : "-"}</span></div>
                <div className="flex justify-between"><span>Group Queued</span><span className="font-semibold">{groupStatus?.queue.queued ?? "-"}</span></div>
                <div className="flex justify-between"><span>Campaigns</span><span className="font-semibold text-amber-700">{campaignStats.total}</span></div>
              </div>
            </div>
          </aside>

          <main className="space-y-4">
            {screen === "ops" && (
              <section className="surface-panel rounded-3xl p-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setOpsView("dashboard")} className={`rounded-xl px-3 py-1.5 text-sm ${opsView === "dashboard" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>Dashboard</button>
                  <button type="button" onClick={() => setOpsView("consents")} className={`rounded-xl px-3 py-1.5 text-sm ${opsView === "consents" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>Consents</button>
                  <button type="button" onClick={() => setOpsView("intent_lab")} className={`rounded-xl px-3 py-1.5 text-sm ${opsView === "intent_lab" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>Intent</button>
                  <button type="button" onClick={() => setOpsView("audit")} className={`rounded-xl px-3 py-1.5 text-sm ${opsView === "audit" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>Audit</button>
                </div>
              </section>
            )}

            {screen === "broadcast" && (
              <section className="surface-panel rounded-3xl p-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setBroadcastView("campaign_create")} className={`rounded-xl px-3 py-1.5 text-sm ${broadcastView === "campaign_create" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>Campaign Studio</button>
                  <button type="button" onClick={() => setBroadcastView("campaign_ops")} className={`rounded-xl px-3 py-1.5 text-sm ${broadcastView === "campaign_ops" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white hover:bg-slate-50"}`}>Campaign Ops</button>
                </div>
              </section>
            )}

            {screen === "ops" && opsView === "dashboard" && (
              <section className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Consents</p><p className="mt-1 text-2xl font-semibold">{consentStats.total}</p></div>
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Drafts</p><p className="mt-1 text-2xl font-semibold">{campaignStats.draft}</p></div>
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Running</p><p className="mt-1 text-2xl font-semibold">{campaignStats.run}</p></div>
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Role</p><p className="mt-1 text-lg font-semibold">{config.role}</p><p className="mt-2 text-xs text-slate-600">Connectors: {connectorStats.healthy}/{connectorStats.total}</p></div>
                </div>
                <div className="surface-panel rounded-3xl p-4">
                  <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Connector Health</h2><button type="button" onClick={() => void loadConnectorHealth()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs">Refresh</button></div>
                  <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="pb-2 pr-3">Connector</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Provider</th><th className="pb-2 pr-3">Checks</th></tr></thead><tbody className="divide-y divide-slate-100">{(connectorSnapshot?.connectors || []).map((item) => <tr key={item.connector.id}><td className="py-2 pr-3"><div className="font-medium">{item.connector.name}</div><div className="text-xs text-slate-500">{item.connector.domain}</div></td><td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${connectorStatusClass(item.status)}`}>{item.status}</span></td><td className="py-2 pr-3">{item.connector.provider}</td><td className="py-2 pr-3">{item.checks.map((check) => check.name).join(", ") || "-"}</td></tr>)}{(!connectorSnapshot || connectorSnapshot.connectors.length === 0) && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No connector snapshot.</td></tr>}</tbody></table></div>
                </div>
                <div className="surface-panel rounded-3xl p-4">
                  <h2 className="mb-3 text-base font-semibold">Latest Campaigns</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="pb-2 pr-3">Name</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Audience</th><th className="pb-2 pr-3">Updated</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {campaigns.slice(0, 8).map((c) => <tr key={c.id}><td className="py-2 pr-3"><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.id}</div></td><td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(c.status)}`}>{c.status}</span></td><td className="py-2 pr-3">{c.audience.length}</td><td className="py-2 pr-3 text-slate-600">{fmt(c.lastRunAtIso || c.createdAtIso)}</td></tr>)}
                        {campaigns.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No campaigns yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {screen === "ops" && opsView === "consents" && (
              <section className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Add Consent</h2><input value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="+919876543210" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={() => void addConsent()} disabled={Boolean(busy.add)} className="mt-2 inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60">{busy.add ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}Add</button></div>
                  <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Revoke Consent</h2><input value={revokePhone} onChange={(e) => setRevokePhone(e.target.value)} placeholder="+919876543210" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={() => void revokeConsent()} disabled={Boolean(busy.revoke)} className="mt-2 inline-flex items-center rounded-xl bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-60">{busy.revoke ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <AlertCircle className="mr-1 h-4 w-4" />}Revoke</button></div>
                  <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Lookup</h2><input value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} placeholder="+919876543210" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={() => void lookupConsent()} disabled={Boolean(busy.lookup)} className="mt-2 inline-flex items-center rounded-xl bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-60">Check</button>{lookupStatus && <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs">{lookupStatus}</div>}</div>
                </div>
                <div className="surface-panel rounded-3xl p-4">
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Consent Records</h2><div className="flex gap-2"><select value={consentFilter} onChange={(e) => setConsentFilter(e.target.value as "all" | ConsentStatus)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"><option value="all">all</option><option value="opted_in">opted_in</option><option value="opted_out">opted_out</option></select><button type="button" onClick={() => void loadConsents()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">Refresh</button></div></div>
                  <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="pb-2 pr-3">Phone</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Purpose</th><th className="pb-2 pr-3">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{consents.map((c) => <tr key={c.phoneE164}><td className="py-2 pr-3 font-medium">{c.phoneE164}</td><td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "opted_in" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{c.status}</span></td><td className="py-2 pr-3">{c.purpose}</td><td className="py-2 pr-3 text-slate-600">{fmt(c.updatedAtIso)}</td></tr>)}{consents.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No records.</td></tr>}</tbody></table></div>
                </div>
              </section>
            )}

            {screen === "broadcast" && broadcastView === "campaign_create" && (
              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="surface-panel rounded-3xl p-4">
                  <h2 className="text-base font-semibold">Create Campaign</h2>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input value={campaignForm.name} onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))} placeholder="name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <input value={campaignForm.client} onChange={(e) => setCampaignForm((p) => ({ ...p, client: e.target.value }))} placeholder="client" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <input value={campaignForm.templateName} onChange={(e) => setCampaignForm((p) => ({ ...p, templateName: e.target.value }))} placeholder="templateName" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <input value={campaignForm.language} onChange={(e) => setCampaignForm((p) => ({ ...p, language: e.target.value }))} placeholder="en" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <select value={campaignForm.category} onChange={(e) => { const category = e.target.value as CampaignCategory; setCampaignForm((p) => ({ ...p, category, consentMode: category === "marketing" ? "required" : "optional", requireApproval: category === "marketing" })); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="marketing">marketing</option><option value="utility">utility</option></select>
                    <select value={campaignForm.consentMode} onChange={(e) => setCampaignForm((p) => ({ ...p, consentMode: e.target.value as ConsentMode }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="required">required</option><option value="optional">optional</option><option value="disabled">disabled</option></select>
                  </div>
                  <input value={campaignForm.reraProjectId} onChange={(e) => setCampaignForm((p) => ({ ...p, reraProjectId: e.target.value }))} placeholder="reraProjectId" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Bulk Number Upload</p><select value={bulkUploadMode} onChange={(e) => setBulkUploadMode(e.target.value as BulkUploadMode)} className="rounded-xl border border-slate-200 px-2 py-1 text-xs"><option value="append">append</option><option value="replace">replace</option></select></div>
                    <p className="text-xs text-slate-600">Upload CSV/TXT with numbers. Detected numbers are normalized to E.164 before adding to audience.</p>
                    <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => { void onBulkFileChange(event); }} className="mt-2 block w-full text-sm" />
                    <textarea value={bulkPasteRaw} onChange={(e) => setBulkPasteRaw(e.target.value)} rows={3} placeholder="Or paste numbers/CSV rows here" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => { applyBulkNumbers(bulkPasteRaw, "pasted text"); setBulkPasteRaw(""); }} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs">Apply Pasted</button>{bulkUploadSummary && <span className="text-xs text-slate-600">{bulkUploadSummary}</span>}</div>
                  </div>
                  <textarea value={campaignForm.audienceRaw} onChange={(e) => setCampaignForm((p) => ({ ...p, audienceRaw: e.target.value }))} rows={6} placeholder="+919..., +918..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <label className="mt-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={campaignForm.requireApproval} onChange={(e) => setCampaignForm((p) => ({ ...p, requireApproval: e.target.checked }))} />requireApproval</label>
                  <div className="mt-3"><button type="button" onClick={() => void createCampaign()} disabled={Boolean(busy.create)} className="inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60">{busy.create ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Create Draft</button></div>
                </div>
                <div className="surface-panel rounded-3xl p-4"><h3 className="text-base font-semibold">Preview</h3><div className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><span>audience</span><span className="font-semibold">{audiencePreview.length}</span></div><div className="flex justify-between"><span>category</span><span className="font-semibold">{campaignForm.category}</span></div><div className="flex justify-between"><span>consent</span><span className="font-semibold">{campaignForm.consentMode}</span></div></div></div>
              </section>
            )}

            {screen === "broadcast" && broadcastView === "campaign_ops" && (
              <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="surface-panel rounded-3xl p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Campaigns</h2><button type="button" onClick={() => void loadCampaigns()} className="rounded-xl border border-slate-200 px-2 py-1 text-xs">Refresh</button></div><div className="space-y-2">{campaigns.map((c) => <button key={c.id} type="button" onClick={() => setSelectedCampaignId(c.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${selectedCampaignId === c.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{c.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass(c.status)}`}>{c.status}</span></div><p className="text-xs text-slate-500">{c.id}</p></button>)}{campaigns.length === 0 && <p className="text-sm text-slate-500">No campaigns.</p>}</div></div>
                <div className="space-y-4">
                  <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Selected Campaign</h2>{selectedCampaign ? <div className="mt-3 space-y-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p className="font-medium">{selectedCampaign.name}</p><p className="text-xs text-slate-500">{selectedCampaign.id}</p><p className="text-xs">audience={selectedCampaign.audience.length}</p><p className="text-xs">consentMode={selectedCampaign.compliance.consentMode}</p></div><div><div className="mb-1 flex justify-between text-xs"><span>Run Progress</span><span>{progress}%</span></div><div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div></div>{selectedCampaign.lastPolicyCheck && <div className="rounded-xl border border-slate-200 p-2 text-xs">preflight={selectedCampaign.lastPolicyCheck.ok ? "ok" : "blocked"} at {fmt(selectedCampaign.lastPolicyCheck.atIso)}</div>}</div> : <p className="mt-2 text-sm text-slate-500">Select a campaign.</p>}</div>
                  <div className="surface-panel rounded-3xl p-4"><h3 className="text-base font-semibold">Controls</h3><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => void preflightCampaign()} disabled={!selectedCampaignId || Boolean(busy.preflight)} className="inline-flex items-center rounded-xl bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-60"><FileCheck2 className="mr-1 h-4 w-4" />Preflight</button><button type="button" onClick={() => void approveCampaign()} disabled={!selectedCampaignId || Boolean(busy.approve)} className="inline-flex items-center rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-60"><ShieldCheck className="mr-1 h-4 w-4" />Approve</button><label className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs"><input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />dryRun</label><button type="button" onClick={() => void runCampaign()} disabled={!selectedCampaignId || Boolean(busy.run)} className="inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60">{busy.run ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1 h-4 w-4" />}Run</button></div><div className="mt-2 grid gap-2 md:grid-cols-2"><input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="approvedBy" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="note" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div></div>
                  <div className="surface-panel rounded-3xl p-4"><h3 className="text-base font-semibold">Run Recipients</h3><div className="mt-2 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="pb-2 pr-3">phone</th><th className="pb-2 pr-3">action</th><th className="pb-2 pr-3">reason</th></tr></thead><tbody className="divide-y divide-slate-100">{runRecipients.map((r) => <tr key={`${r.phone}-${r.action}-${r.reason || ""}`}><td className="py-2 pr-3">{r.phone}</td><td className="py-2 pr-3">{r.action}</td><td className="py-2 pr-3 text-slate-600">{r.reason || "-"}</td></tr>)}{runRecipients.length === 0 && <tr><td colSpan={3} className="py-5 text-center text-slate-500">No run output yet.</td></tr>}</tbody></table></div></div>
                </div>
              </section>
            )}

            {screen === "ops" && opsView === "intent_lab" && (
              <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Intent Lab</h2><textarea value={intentText} onChange={(e) => setIntentText(e.target.value)} rows={7} placeholder="Send me 2BHK pricing in Whitefield" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><div className="mt-2 grid gap-2 md:grid-cols-[auto_1fr]"><label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={intentUseAi} onChange={(e) => setIntentUseAi(e.target.checked)} />useAi</label><input value={intentModel} onChange={(e) => setIntentModel(e.target.value)} placeholder="model override" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div><button type="button" onClick={() => void classifyIntent()} disabled={Boolean(busy.intent)} className="mt-2 inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60">{busy.intent ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1 h-4 w-4" />}Classify</button></div>
                <div className="surface-panel rounded-3xl p-4"><h3 className="text-base font-semibold">Output</h3>{intentResult ? <div className="mt-2 space-y-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><p>intent: <span className="font-semibold">{intentResult.intent}</span></p><p>confidence: <span className="font-semibold">{Math.round(intentResult.confidence * 100)}%</span></p><p>route: <span className="font-semibold">{intentResult.route}</span></p><p>provider: <span className="font-semibold">{intentResult.provider}</span></p></div><pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-emerald-200">{JSON.stringify(intentResult.fields, null, 2)}</pre></div> : <p className="mt-2 text-sm text-slate-500">Run classification to inspect fields.</p>}</div>
              </section>
            )}

            {screen === "ops" && opsView === "audit" && (
              <section className="surface-panel rounded-3xl p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Audit Timeline</h2><button type="button" onClick={clearAudit} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs">Clear</button></div><div className="space-y-2">{audit.map((a) => <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{a.action}</p><p className="text-xs text-slate-500">{fmt(a.atIso)}</p></div><p className="mt-1 text-sm text-slate-700">{a.details}</p></div>)}{audit.length === 0 && <p className="text-sm text-slate-500">No events yet.</p>}</div></section>
            )}

            {screen === "agent" && (
              <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="surface-panel rounded-3xl p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Sessions</h2><div className="flex gap-2"><button type="button" onClick={() => void startAgentSession()} disabled={Boolean(busy.agent_start)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-60">{busy.agent_start ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start"}</button><button type="button" onClick={() => void loadAgentSessions()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs">Refresh</button></div></div><div className="space-y-2">{agentSessions.map((session) => <button key={session.id} type="button" onClick={() => setSelectedSessionId(session.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${selectedSessionId === session.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{session.id}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px]">{session.pendingActions.length}</span></div><p className="text-xs text-slate-500">{fmt(session.updatedAtIso)}</p></button>)}{agentSessions.length === 0 && <p className="text-sm text-slate-500">No sessions yet.</p>}</div></div>
                <div className="space-y-4">
                  <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Session Actions</h2>{selectedSession ? <div className="mt-2 space-y-2"><div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{selectedSession.id}</p><p className="text-xs text-slate-600">turns={selectedSession.turns} pending={selectedSession.pendingActions.length}</p></div><div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_auto]"><select value={agentAutonomy} onChange={(e) => setAgentAutonomy(Number(e.target.value) as 0 | 1 | 2)} className="rounded-xl border border-slate-200 px-2 py-2 text-sm"><option value={0}>autonomy 0</option><option value={1}>autonomy 1</option><option value={2}>autonomy 2</option></select><input value={agentMessage} onChange={(e) => setAgentMessage(e.target.value)} placeholder="Send agent message..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={() => void sendAgentMessage()} disabled={Boolean(busy.agent_message)} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60">{busy.agent_message ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}</button></div><div className="flex gap-2"><button type="button" onClick={() => void approveAgentAction()} disabled={!selectedSession.pendingActions.length || Boolean(busy.agent_approve)} className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-60">Approve All</button><button type="button" onClick={() => void rejectAgentAction()} disabled={!selectedSession.pendingActions.length || Boolean(busy.agent_reject)} className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs text-white disabled:opacity-60">Reject All</button><button type="button" onClick={() => void loadAgentSession(selectedSession.id)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs">Refresh Session</button></div><div className="space-y-2">{selectedSession.pendingActions.map((action) => <div key={action.id} className="rounded-xl border border-slate-200 bg-white p-2 text-sm"><div className="flex items-center justify-between"><div><p className="font-medium">{action.tool}</p><p className="text-xs text-slate-600">{action.reason}</p></div><div className="flex gap-1"><button type="button" onClick={() => void approveAgentAction(action.id)} disabled={Boolean(busy.agent_approve)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] text-white disabled:opacity-60">Approve</button><button type="button" onClick={() => void rejectAgentAction(action.id)} disabled={Boolean(busy.agent_reject)} className="rounded-lg bg-rose-600 px-2 py-1 text-[11px] text-white disabled:opacity-60">Reject</button></div></div></div>)}{selectedSession.pendingActions.length === 0 && <p className="text-sm text-slate-500">No pending actions.</p>}</div></div> : <p className="mt-2 text-sm text-slate-500">Select a session to continue.</p>}</div>
                  <div className="surface-panel rounded-3xl p-4"><h3 className="text-base font-semibold">Transcript</h3>{selectedSession ? <div className="mt-2 max-h-[360px] space-y-2 overflow-auto">{selectedSession.transcript.map((item, idx) => <div key={`${item.timestampIso}-${idx}`} className="rounded-xl bg-slate-50 p-2 text-sm"><div className="flex items-center justify-between"><span className="font-medium">{item.role}</span><span className="text-xs text-slate-500">{fmt(item.timestampIso)}</span></div><p className="mt-1 whitespace-pre-wrap text-slate-700">{item.content}</p></div>)}{selectedSession.transcript.length === 0 && <p className="text-sm text-slate-500">No transcript yet.</p>}</div> : <p className="mt-2 text-sm text-slate-500">No selected session.</p>}</div>
                </div>
              </section>
            )}

            {screen === "queue" && (
              <section className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Queue Enabled</p><p className="mt-1 text-2xl font-semibold">{queueRuntime ? String(queueRuntime.enabled) : "-"}</p></div>
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Queue Ready</p><p className="mt-1 text-2xl font-semibold">{queueRuntime ? String(queueRuntime.ready) : "-"}</p></div>
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Group Queued</p><p className="mt-1 text-2xl font-semibold">{groupStatus ? groupStatus.queue.queued : "-"}</p></div>
                  <div className="surface-panel rounded-3xl p-4"><p className="text-xs uppercase text-slate-500">Agent Pending</p><p className="mt-1 text-2xl font-semibold">{pendingActionCount}</p></div>
                </div>
                <div className="surface-panel rounded-3xl p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Queue Runtime + Group Queue</h2><div className="flex gap-2"><select value={groupQueueFilter} onChange={(e) => setGroupQueueFilter(e.target.value as "all" | GroupPostStatus)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"><option value="all">all</option><option value="queued">queued</option><option value="processing">processing</option><option value="sent">sent</option><option value="failed">failed</option></select><button type="button" onClick={() => void Promise.all([loadQueueRuntime(), loadGroupStatus(), loadGroupQueue()])} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">Refresh</button></div></div><div className="grid gap-4 xl:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3 text-sm">{queueRuntime ? <div className="space-y-1"><p>queueName: <span className="font-semibold">{queueRuntime.queueName}</span></p><p>attempts: <span className="font-semibold">{queueRuntime.attempts}</span></p><p>concurrency: <span className="font-semibold">{queueRuntime.concurrency}</span></p><p>timeoutMs: <span className="font-semibold">{queueRuntime.timeoutMs}</span></p><p>reason: <span className="font-semibold">{queueRuntime.reason || "-"}</span></p></div> : <p className="text-slate-500">No runtime data.</p>}</div><div className="rounded-xl bg-slate-50 p-3 text-sm">{groupStatus ? <div className="space-y-1"><p>schedulerEnabled: <span className="font-semibold">{String(groupStatus.scheduler.enabled)}</span></p><p>running: <span className="font-semibold">{String(groupStatus.scheduler.running)}</span></p><p>intervalMs: <span className="font-semibold">{groupStatus.scheduler.intervalMs}</span></p><p>batchSize: <span className="font-semibold">{groupStatus.scheduler.batchSize}</span></p><p>nextDue: <span className="font-semibold">{fmt(groupStatus.queue.nextDueAtIso)}</span></p></div> : <p className="text-slate-500">No group status.</p>}</div></div><div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="pb-2 pr-3">Item</th><th className="pb-2 pr-3">Status</th><th className="pb-2 pr-3">Next</th><th className="pb-2 pr-3">Attempts</th><th className="pb-2 pr-3">Targets</th></tr></thead><tbody className="divide-y divide-slate-100">{groupQueue.map((item) => <tr key={item.id}><td className="py-2 pr-3"><div className="font-medium">{item.id}</div><div className="line-clamp-2 text-xs text-slate-500">{item.content}</div></td><td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${groupStatusClass(item.status)}`}>{item.status}</span></td><td className="py-2 pr-3 text-slate-600">{fmt(item.nextPostAtIso)}</td><td className="py-2 pr-3">{item.attempts}</td><td className="py-2 pr-3 text-slate-600">{item.targets.length}</td></tr>)}{groupQueue.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No queue items.</td></tr>}</tbody></table></div></div>
              </section>
            )}

            {screen === "settings" && (
              <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                <div className="surface-panel rounded-3xl p-4"><h2 className="text-base font-semibold">Settings</h2><div className="mt-2 space-y-2"><input value={draftConfig.baseUrl} onChange={(e) => setDraftConfig((p) => ({ ...p, baseUrl: e.target.value }))} placeholder="base URL" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><input type="password" value={draftConfig.apiKey} onChange={(e) => setDraftConfig((p) => ({ ...p, apiKey: e.target.value }))} placeholder="AGENT_API_KEY" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><select value={draftConfig.role} onChange={(e) => setDraftConfig((p) => ({ ...p, role: e.target.value as AgentRole }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="realtor_admin">realtor_admin</option><option value="ops">ops</option></select><div className="flex gap-2"><button type="button" onClick={saveSettings} className="inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white"><Settings2 className="mr-1 h-4 w-4" />Save</button><button type="button" onClick={() => void probeHealth()} className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><RefreshCcw className="mr-1 h-4 w-4" />Ping</button></div></div></div>
                <div className="surface-panel rounded-3xl p-4"><h3 className="text-base font-semibold">Guardrails</h3><div className="mt-2 space-y-2 text-sm"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Use valid `x-agent-api-key` and `x-agent-role` headers.</div><div className="rounded-xl bg-sky-50 p-3 text-sky-900">Run preflight and approval before run.</div><div className="rounded-xl bg-amber-50 p-3 text-amber-900">Marketing should keep consentMode=required.</div></div></div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
