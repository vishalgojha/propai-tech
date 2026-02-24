import "dotenv/config";
import {
  runAdsLeadQualification,
  runGeneratePerformanceReport,
  runGroupRequirementMatchScan,
  runMatchPropertyToBuyer,
  runPostToMagicBricks,
  runPostTo99Acres,
  runScheduleSiteVisit,
  runSendWhatsappFollowup
} from "../agentic/suite/toolkit.js";
import { evaluateGuardrails } from "../agentic/suite/guardrails.js";
import { planToolCalls } from "../agentic/suite/planner.js";
import { RealtorOrchestrator } from "../agentic/agents/orchestrator.js";
import { generateAssistantText } from "../llm/chat.js";
import { getOllamaStatus } from "../llm/ollama.js";
import { isOpenRouterEnabled } from "../llm/openrouter.js";
import type { PreferredLanguage } from "../agentic/types.js";
import type { ChatMessage } from "../llm/chat.js";
import type {
  ChatRequest,
  PlannedToolCall,
  ToolExecutionRecord,
  ToolName
} from "../agentic/suite/types.js";

type AnyRecord = Record<string, unknown>;
type AutonomyLevel = 0 | 1 | 2;
type MessageRole = "user" | "assistant" | "system";
type StatusKind = "info" | "success" | "warning" | "error";

type UiMessage = {
  role: MessageRole;
  text: string;
  at: string;
};

type LeadDefaults = {
  name?: string;
  phone?: string;
  city?: string;
  preferredLanguage?: PreferredLanguage;
};

type SessionState = {
  autonomy: AutonomyLevel;
  dryRun: boolean;
  recipient?: string;
  model?: string;
  leadDefaults: LeadDefaults;
  input: string;
  busy: boolean;
  pulse: boolean;
  provider: "openrouter" | "ollama" | "none";
  statusText: string;
  statusKind: StatusKind;
  turns: number;
  messages: UiMessage[];
  activities: string[];
  history: ChatMessage[];
  pendingApproval: PendingApproval | null;
};

type PendingApproval = {
  request: ChatRequest;
  steps: PlannedToolCall[];
};

type DirectSendCommand = {
  to: string;
  body?: string;
};

type VueRuntime = {
  defineComponent: (options: AnyRecord) => unknown;
  reactive: <T extends object>(value: T) => T;
  computed: <T>(getter: () => T) => { value: T };
  onMounted: (fn: () => void) => void;
  onBeforeUnmount: (fn: () => void) => void;
  h: (...args: unknown[]) => unknown;
};

type TermUiRuntime = {
  createApp: (...args: unknown[]) => AnyRecord;
  TuiBox?: unknown;
  TuiText?: unknown;
  TuiInput?: unknown;
  TuiList?: unknown;
  TuiStatus?: unknown;
  TuiSeparator?: unknown;
  TuiMarquee?: unknown;
  TuiLoading?: unknown;
};

type ComponentSet = {
  Box: unknown;
  Text: unknown;
  Input: unknown;
  List: unknown;
  Status: unknown;
  Separator: unknown;
  Marquee: unknown;
  Loading: unknown | null;
};

const DEFAULT_DRY_RUN = process.env.WACLI_DRY_RUN !== "false";
const LOCAL_WRITE_TOOLS: ToolName[] = ["schedule_site_visit"];
const EXTERNAL_TOOLS: ToolName[] = ["post_to_99acres", "post_to_magicbricks", "send_whatsapp_followup"];
const orchestrator = new RealtorOrchestrator();

const HELP_TEXT = [
  "Commands:",
  "  /help",
  "  /state",
  "  /llm",
  "  /approve",
  "  /deny",
  "  /set autonomy <0|1|2>",
  "  /set dryrun <on|off>",
  "  /set recipient <+E164|none>",
  "  /set model <model-id|none>",
  "  /set name <text>",
  "  /set phone <text>",
  "  /set city <text>",
  "  /set lang <en|hi|hinglish>",
  "  /clear",
  "  /back (exit shell)",
  "Direct send: msg +919820056180 Hi, sharing shortlisted options."
].join("\n");

async function main() {
  const vue = await loadVueRuntime();
  const termui = await loadTermUiRuntime();

  if (!vue || !termui) {
    // eslint-disable-next-line no-console
    console.error(
      [
        "Missing TUI runtime packages.",
        "Install with:",
        "  npm install vue @vue-termui/core",
        "Then run:",
        "  npm run terminal:tui"
      ].join("\n")
    );
    process.exit(1);
  }

  const components = resolveComponents(termui);
  const Root = createRootComponent(vue, components);
  const app = termui.createApp(Root) as AnyRecord;

  const stop = () => {
    const maybeStop = app.stop;
    if (typeof maybeStop === "function") {
      maybeStop.call(app);
    }
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const run = app.run;
  if (typeof run === "function") {
    run.call(app);
    return;
  }

  const mount = app.mount;
  if (typeof mount === "function") {
    mount.call(app);
    return;
  }

  // eslint-disable-next-line no-console
  console.error("Unable to start terminal UI: createApp returned unknown app shape.");
  process.exit(1);
}

function createRootComponent(vue: VueRuntime, ui: ComponentSet): unknown {
  const { defineComponent, reactive, computed, onMounted, onBeforeUnmount, h } = vue;

  return defineComponent({
    name: "PropAiTermUi",
    setup() {
      const state = reactive<SessionState>({
        autonomy: 1,
        dryRun: DEFAULT_DRY_RUN,
        recipient: undefined,
        model: undefined,
        leadDefaults: {},
        input: "",
        busy: false,
        pulse: true,
        provider: "none",
        statusText: "ready",
        statusKind: "info",
        turns: 0,
        messages: [],
        activities: [],
        history: [],
        pendingApproval: null
      });

      const quickCommands = computed(() => [
        "/state",
        "/llm",
        "/set autonomy 0",
        "/set autonomy 1",
        "/set autonomy 2",
        "/approve",
        "/deny",
        "msg +9198... Hi"
      ]);

      const sidebarFacts = computed(() => [
        `autonomy=${state.autonomy}`,
        `dryRun=${String(state.dryRun)}`,
        `recipient=${state.recipient || "none"}`,
        `model=${state.model || "default"}`,
        `provider=${state.provider}`
      ]);

      const headerTicker = computed(() => {
        const pulse = state.pulse ? "[live]" : "[....]";
        return `${pulse} PropAI Command Deck | LLM-first realtor copilot | approvals enforced`;
      });

      const visibleMessages = computed(() => {
        const maxLines = 20;
        return state.messages.slice(-maxLines);
      });

      const visibleActivities = computed(() => {
        return state.activities.slice(-8).reverse();
      });

      let pulseTimer: ReturnType<typeof setInterval> | null = null;

      onMounted(() => {
        addMessage(state, "assistant", "PropAI TUI online. Type a request or /help.");
        addActivity(state, "Session started");
        pulseTimer = setInterval(() => {
          state.pulse = !state.pulse;
        }, 700);
      });

      onBeforeUnmount(() => {
        if (pulseTimer) {
          clearInterval(pulseTimer);
        }
      });

      const submitInput = async (submitted?: string) => {
        if (state.busy) {
          addMessage(state, "system", "Busy on previous task. Wait for completion.");
          return;
        }

        const raw = (typeof submitted === "string" ? submitted : state.input).trim();
        if (!raw) return;
        state.input = "";
        state.turns += 1;
        addMessage(state, "user", raw);

        if (raw.startsWith("/")) {
          await handleSlashCommand(state, raw);
          return;
        }

        const direct = parseDirectSendCommand(raw);
        if (direct) {
          await handleDirectSend(state, direct);
          return;
        }

        await handleAgentTurn(state, raw);
      };

      return () =>
        h(ui.Box, { flexDirection: "column", height: "100%" }, [
          h(ui.Box, { bordered: true, borderStyle: "double", borderColor: "cyan", padding: 1 }, [
            h(ui.Text, {
              text: "PropAI Terminal",
              color: "cyan",
              bold: true
            }),
            h(ui.Marquee, {
              text: headerTicker.value,
              color: "green",
              speed: 26
            })
          ]),
          h(ui.Box, { flexDirection: "row", grow: 1, gap: 1, padding: 1 }, [
            h(ui.Box, { grow: 3, bordered: true, borderColor: "magenta", padding: 1 }, [
              h(ui.Text, { text: "Conversation", color: "yellow", bold: true }),
              h(ui.Separator),
              h(
                ui.Box,
                { flexDirection: "column", grow: 1, margin: 0, padding: 0 },
                visibleMessages.value.map((item) =>
                  h(ui.Text, {
                    text: `${item.at} ${labelForRole(item.role)} ${item.text}`,
                    color: colorForRole(item.role),
                    wrap: true
                  })
                )
              )
            ]),
            h(ui.Box, { grow: 2, flexDirection: "column", gap: 1 }, [
              h(ui.Box, { bordered: true, borderColor: "blue", padding: 1 }, [
                h(ui.Text, { text: "Session", color: "cyan", bold: true }),
                h(ui.Status, { text: state.statusText, status: state.statusKind }),
                ...sidebarFacts.value.map((line) =>
                  h(ui.Text, {
                    text: line,
                    color: "white"
                  })
                )
              ]),
              h(ui.Box, { bordered: true, borderColor: "green", padding: 1, grow: 1 }, [
                h(ui.Text, { text: "Recent Activity", color: "green", bold: true }),
                ...visibleActivities.value.map((line) =>
                  h(ui.Text, {
                    text: `- ${line}`,
                    color: "gray"
                  })
                )
              ]),
              h(ui.Box, { bordered: true, borderColor: "yellow", padding: 1 }, [
                h(ui.Text, { text: "Quick Commands", color: "yellow", bold: true }),
                h(ui.List, { items: quickCommands.value })
              ])
            ])
          ]),
          h(ui.Box, { bordered: true, borderColor: state.busy ? "yellow" : "green", padding: 1 }, [
            state.busy && ui.Loading
              ? h(ui.Loading, {
                  text: "Thinking...",
                  animationType: "dots",
                  color: "yellow"
                })
              : null,
            h(ui.Input, {
              modelValue: state.input,
              focused: true,
              color: "white",
              onSubmit: (value: string) => {
                void submitInput(value);
              },
              "onUpdate:modelValue": (value: string) => {
                state.input = value;
              }
            }),
            h(ui.Text, {
              text: "Enter to send | /help for commands | /back to exit",
              color: "gray"
            })
          ])
        ]);
    }
  });
}

async function handleSlashCommand(state: SessionState, raw: string) {
  const text = raw.slice(1).trim();
  const [commandRaw, ...rest] = text.split(/\s+/);
  const command = (commandRaw || "").toLowerCase();
  const value = rest.join(" ").trim();

  if (!command) return;

  if (command === "help") {
    addMessage(state, "assistant", HELP_TEXT);
    addActivity(state, "Displayed help");
    return;
  }

  if (command === "state") {
    addMessage(
      state,
      "assistant",
      JSON.stringify(
        {
          autonomy: state.autonomy,
          dryRun: state.dryRun,
          recipient: state.recipient || null,
          model: state.model || null,
          leadDefaults: state.leadDefaults,
          turns: state.turns,
          pendingApprovalSteps: state.pendingApproval?.steps.length || 0
        },
        null,
        2
      )
    );
    addActivity(state, "Printed state");
    return;
  }

  if (command === "llm") {
    state.busy = true;
    try {
      const ollama = await getOllamaStatus();
      const openrouter = isOpenRouterEnabled();
      const line = [
        `OpenRouter=${openrouter ? "enabled" : "disabled"}`,
        `Ollama=${ollama.enabled ? "enabled" : "disabled"}`,
        `reachable=${ollama.reachable}`,
        `model=${ollama.selectedModel}`
      ].join(" | ");
      addMessage(state, "assistant", line);
      if (ollama.availableModels.length > 0) {
        addMessage(state, "assistant", `Ollama models: ${ollama.availableModels.join(", ")}`);
      }
      setStatus(state, "LLM status refreshed", "success");
      addActivity(state, "Checked LLM status");
    } finally {
      state.busy = false;
    }
    return;
  }

  if (command === "approve") {
    await approvePendingSteps(state);
    return;
  }

  if (command === "deny") {
    if (!state.pendingApproval) {
      addMessage(state, "assistant", "No pending steps to deny.");
      return;
    }
    const denied = state.pendingApproval.steps.map((step) => step.tool).join(", ");
    state.pendingApproval = null;
    addMessage(state, "assistant", `Denied pending steps: ${denied}`);
    setStatus(state, "Pending steps denied", "warning");
    addActivity(state, "Denied pending approval queue");
    return;
  }

  if (command === "clear") {
    state.messages = [];
    state.activities = [];
    state.history = [];
    state.pendingApproval = null;
    addMessage(state, "assistant", "Session cleared.");
    addActivity(state, "Cleared session");
    return;
  }

  if (command === "back" || command === "exit" || command === "quit") {
    addMessage(state, "assistant", "Closing PropAI TUI...");
    addActivity(state, "Session closed");
    setTimeout(() => {
      process.exit(0);
    }, 50);
    return;
  }

  if (command === "set") {
    applySetCommand(state, value);
    return;
  }

  addMessage(state, "assistant", `Unknown command: /${command}. Use /help.`);
}

function applySetCommand(state: SessionState, value: string) {
  const [keyRaw, ...rest] = value.split(/\s+/);
  const key = (keyRaw || "").toLowerCase();
  const val = rest.join(" ").trim();

  if (!key) {
    addMessage(state, "assistant", "Usage: /set <autonomy|dryrun|recipient|model|name|phone|city|lang> <value>");
    return;
  }

  if (key === "autonomy") {
    if (val === "0" || val === "1" || val === "2") {
      state.autonomy = Number(val) as AutonomyLevel;
      addMessage(state, "assistant", `autonomy=${state.autonomy}`);
      addActivity(state, `Set autonomy to ${state.autonomy}`);
      return;
    }
    addMessage(state, "assistant", "autonomy must be 0, 1, or 2.");
    return;
  }

  if (key === "dryrun") {
    const parsed = parseBoolean(val);
    if (parsed === null) {
      addMessage(state, "assistant", "dryrun must be on/off.");
      return;
    }
    state.dryRun = parsed;
    addMessage(state, "assistant", `dryRun=${state.dryRun}`);
    addActivity(state, `Set dryRun=${state.dryRun}`);
    return;
  }

  if (key === "recipient") {
    state.recipient = val && val.toLowerCase() !== "none" ? val : undefined;
    addMessage(state, "assistant", `recipient=${state.recipient || "none"}`);
    addActivity(state, `Set recipient=${state.recipient || "none"}`);
    return;
  }

  if (key === "model") {
    state.model = val && val.toLowerCase() !== "none" ? val : undefined;
    addMessage(state, "assistant", `model=${state.model || "default"}`);
    addActivity(state, `Set model=${state.model || "default"}`);
    return;
  }

  if (key === "name") {
    state.leadDefaults.name = val || undefined;
    addMessage(state, "assistant", `lead.name=${state.leadDefaults.name || "none"}`);
    return;
  }

  if (key === "phone") {
    state.leadDefaults.phone = val || undefined;
    addMessage(state, "assistant", `lead.phone=${state.leadDefaults.phone || "none"}`);
    return;
  }

  if (key === "city") {
    state.leadDefaults.city = val || undefined;
    addMessage(state, "assistant", `lead.city=${state.leadDefaults.city || "none"}`);
    return;
  }

  if (key === "lang" || key === "language") {
    const parsed = parsePreferredLanguage(val);
    if (!parsed && val) {
      addMessage(state, "assistant", "lang must be en, hi, or hinglish.");
      return;
    }
    state.leadDefaults.preferredLanguage = parsed;
    addMessage(state, "assistant", `lead.preferredLanguage=${parsed || "none"}`);
    return;
  }

  addMessage(state, "assistant", `Unknown set key: ${key}`);
}

async function handleAgentTurn(state: SessionState, message: string) {
  state.busy = true;
  setStatus(state, "processing request", "info");

  try {
    const request: ChatRequest = {
      message,
      recipient: state.recipient,
      dryRun: state.dryRun,
      model: state.model,
      lead: {
        message,
        ...state.leadDefaults
      }
    };

    const guardrail = evaluateGuardrails(request);
    if (!guardrail.allow) {
      const reply = await buildAssistantReply(state, request, [], [], guardrail.reason || "Blocked by guardrails.");
      addMessage(state, "assistant", reply);
      addActivity(state, "Guardrail blocked request");
      setStatus(state, "blocked by guardrails", "warning");
      return;
    }

    const plan = planToolCalls(message);
    if (plan.length === 0) {
      const reply = await buildAssistantReply(state, request, [], [], "No tool plan triggered.");
      addMessage(state, "assistant", reply);
      addActivity(state, "No plan; replied conversationally");
      setStatus(state, "conversation reply", "success");
      return;
    }

    if (state.autonomy === 0) {
      const reply = await buildAssistantReply(
        state,
        request,
        plan,
        [],
        "Autonomy L0 suggest-only: tools were planned but not executed."
      );
      addMessage(state, "assistant", reply);
      addActivity(state, "Suggest-only turn (L0)");
      setStatus(state, "suggest-only mode", "info");
      return;
    }

    const immediateSteps: PlannedToolCall[] = [];
    const approvalSteps: PlannedToolCall[] = [];
    const blockedSteps: PlannedToolCall[] = [];
    for (const step of plan) {
      if (isExternalAction(step.tool, request) && state.autonomy < 2) {
        blockedSteps.push(step);
      } else if (requiresApproval(state, request, step.tool)) {
        approvalSteps.push(step);
      } else {
        immediateSteps.push(step);
      }
    }

    let results: ToolExecutionRecord[] = [];
    for (const step of immediateSteps) {
      const result = await executeStep(step, request);
      results.push(result);
      addActivity(state, `${step.tool}: ${result.ok ? "ok" : "fail"}`);
      if (!result.ok) {
        setStatus(state, `${step.tool} failed`, "warning");
      }
    }

    for (const step of blockedSteps) {
      results.push({
        tool: step.tool,
        ok: false,
        summary: "Blocked: autonomy level blocks external action. Use /set autonomy 2."
      });
      addActivity(state, `Blocked ${step.tool} at autonomy ${state.autonomy}`);
    }

    if (approvalSteps.length > 0) {
      state.pendingApproval = {
        request,
        steps: approvalSteps
      };
      const queue = approvalSteps.map((item) => item.tool).join(", ");
      addMessage(
        state,
        "system",
        `Approval needed for: ${queue}. Run /approve to execute or /deny to skip.`
      );
      addActivity(state, `Queued approvals: ${queue}`);
    }

    const note = approvalSteps.length > 0 ? "Some steps are pending explicit approval." : "Plan executed.";
    const reply = await buildAssistantReply(state, request, plan, results, note);
    addMessage(state, "assistant", reply);
    setStatus(state, "turn completed", "success");
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    addMessage(state, "assistant", `Execution error: ${messageText}`);
    setStatus(state, "execution error", "error");
    addActivity(state, "Turn failed");
  } finally {
    state.busy = false;
  }
}

async function approvePendingSteps(state: SessionState) {
  if (!state.pendingApproval) {
    addMessage(state, "assistant", "No pending steps.");
    return;
  }

  if (state.autonomy === 0) {
    addMessage(state, "assistant", "Autonomy L0 blocks execution. Use /set autonomy 1 or 2.");
    return;
  }

  state.busy = true;
  setStatus(state, "running approved steps", "info");

  try {
    const pending = state.pendingApproval;
    state.pendingApproval = null;
    const results: ToolExecutionRecord[] = [];

    for (const step of pending.steps) {
      if (isExternalAction(step.tool, pending.request) && state.autonomy < 2) {
        results.push({
          tool: step.tool,
          ok: false,
          summary: "Blocked during approval: external steps require autonomy 2."
        });
        addActivity(state, `Approval blocked for ${step.tool} due to autonomy`);
        continue;
      }

      const result = await executeStep(step, pending.request);
      results.push(result);
      addActivity(state, `approved ${step.tool}: ${result.ok ? "ok" : "fail"}`);
    }

    const reply = await buildAssistantReply(
      state,
      pending.request,
      pending.steps,
      results,
      "Approved steps executed."
    );
    addMessage(state, "assistant", reply);
    setStatus(state, "approved steps completed", "success");
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    addMessage(state, "assistant", `Approval execution failed: ${messageText}`);
    setStatus(state, "approval execution failed", "error");
  } finally {
    state.busy = false;
  }
}

function requiresApproval(state: SessionState, request: ChatRequest, tool: ToolName): boolean {
  if (state.autonomy === 0) return true;

  const localWrite = LOCAL_WRITE_TOOLS.includes(tool);
  const external = isExternalAction(tool, request);

  if (localWrite) {
    return true;
  }

  if (external) {
    return true;
  }

  return false;
}

function isExternalAction(tool: ToolName, request: ChatRequest): boolean {
  if (!EXTERNAL_TOOLS.includes(tool)) return false;
  if (tool === "send_whatsapp_followup") {
    return Boolean(request.recipient);
  }
  return true;
}

async function executeStep(step: PlannedToolCall, request: ChatRequest): Promise<ToolExecutionRecord> {
  switch (step.tool) {
    case "post_to_99acres":
      return runPostTo99Acres(request);
    case "post_to_magicbricks":
      return runPostToMagicBricks(request);
    case "match_property_to_buyer":
      return runMatchPropertyToBuyer(request);
    case "group_requirement_match_scan":
      return runGroupRequirementMatchScan(request);
    case "ads_lead_qualification":
      return runAdsLeadQualification(request);
    case "send_whatsapp_followup":
      return runSendWhatsappFollowup(request);
    case "schedule_site_visit":
      return runScheduleSiteVisit(request);
    case "generate_performance_report":
      return runGeneratePerformanceReport();
    default:
      return {
        tool: step.tool,
        ok: false,
        summary: "Tool is not implemented."
      };
  }
}

async function buildAssistantReply(
  state: SessionState,
  request: ChatRequest,
  plan: PlannedToolCall[],
  results: ToolExecutionRecord[],
  note: string
): Promise<string> {
  const context = {
    autonomy: state.autonomy,
    dryRun: state.dryRun,
    recipient: request.recipient || null,
    plan: plan.map((item) => ({ tool: item.tool, reason: item.reason })),
    results: results.map((item) => ({ tool: item.tool, ok: item.ok, summary: item.summary })),
    note
  };

  const llmMessages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are PropAI terminal copilot. Reply naturally like a real chat operator assistant. Keep responses concise, practical, and action-oriented."
    },
    ...state.history.slice(-12),
    {
      role: "user",
      content: request.message
    },
    {
      role: "user",
      content: `Execution context: ${JSON.stringify(context)}`
    }
  ];

  const llm = await generateAssistantText(llmMessages, {
    model: request.model,
    temperature: 0.2,
    maxTokens: 220
  });

  state.provider = llm.provider;
  if (llm.text && llm.text.trim()) {
    return llm.text.trim();
  }
  return "LLM unavailable. No fallback replies are enabled. Run /llm, fix provider configuration, then retry.";
}

async function handleDirectSend(state: SessionState, command: DirectSendCommand) {
  if (!command.body) {
    addMessage(
      state,
      "assistant",
      "Send format: msg <phone> <message>. Example: msg +919820056180 Hi, sharing 2 options in Wakad."
    );
    return;
  }

  if (state.autonomy < 2) {
    addMessage(
      state,
      "assistant",
      "Direct send requires autonomy=2. Run /set autonomy 2 and retry."
    );
    return;
  }

  state.busy = true;
  setStatus(state, "sending direct message", "info");
  addActivity(state, `Direct send requested to ${command.to}`);

  try {
    const result = await orchestrator.sendManualMessage(command.to, command.body);
    if (result.ok) {
      addMessage(state, "assistant", `Message sent to ${command.to}.`);
      setStatus(state, "message sent", "success");
      addActivity(state, `Message sent to ${command.to}`);
    } else {
      addMessage(state, "assistant", `Send failed for ${command.to}. ${result.stderr || "Check wacli status."}`);
      setStatus(state, "message send failed", "error");
      addActivity(state, `Send failed to ${command.to}`);
    }
  } finally {
    state.busy = false;
  }
}

function parseDirectSendCommand(raw: string): DirectSendCommand | null {
  const match = raw
    .trim()
    .match(/^(?:msg|message|send)\s+([+]?\d[\d\s-]{7,20})(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const digits = match[1].replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const body = match[2]?.trim();

  return {
    to: `+${digits}`,
    body: body && body.length > 0 ? body : undefined
  };
}

function addMessage(state: SessionState, role: MessageRole, text: string) {
  state.messages.push({
    role,
    text,
    at: formatClock(new Date())
  });
  pushHistory(state, role, text);
}

function pushHistory(state: SessionState, role: MessageRole, content: string) {
  if (role === "system") return;
  const llmRole: ChatMessage["role"] = role === "assistant" ? "assistant" : "user";
  state.history.push({
    role: llmRole,
    content
  });
  if (state.history.length > 24) {
    state.history = state.history.slice(-24);
  }
}

function addActivity(state: SessionState, text: string) {
  state.activities.push(`${formatClock(new Date())} ${text}`);
  if (state.activities.length > 40) {
    state.activities = state.activities.slice(-40);
  }
}

function setStatus(state: SessionState, text: string, kind: StatusKind) {
  state.statusText = text;
  state.statusKind = kind;
}

function labelForRole(role: MessageRole): string {
  if (role === "assistant") return "assistant>";
  if (role === "system") return "system>";
  return "you>";
}

function colorForRole(role: MessageRole): string {
  if (role === "assistant") return "green";
  if (role === "system") return "yellow";
  return "cyan";
}

function parsePreferredLanguage(raw: string): PreferredLanguage | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "en" || normalized === "hi" || normalized === "hinglish") {
    return normalized;
  }
  return undefined;
}

function parseBoolean(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function formatClock(value: Date): string {
  const hh = String(value.getHours()).padStart(2, "0");
  const mm = String(value.getMinutes()).padStart(2, "0");
  const ss = String(value.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function resolveComponents(termui: TermUiRuntime): ComponentSet {
  const Box = termui.TuiBox;
  const Text = termui.TuiText;
  const Input = termui.TuiInput;

  if (!Box || !Text || !Input) {
    throw new Error("TermUI package found but required components are missing (TuiBox/TuiText/TuiInput).");
  }

  return {
    Box,
    Text,
    Input,
    List: termui.TuiList || Text,
    Status: termui.TuiStatus || Text,
    Separator: termui.TuiSeparator || Text,
    Marquee: termui.TuiMarquee || Text,
    Loading: termui.TuiLoading || null
  };
}

async function loadVueRuntime(): Promise<VueRuntime | null> {
  const vueName = "vue";
  const mod = (await safeImport(vueName)) as AnyRecord | null;
  if (!mod) return null;

  const required = ["defineComponent", "reactive", "computed", "onMounted", "onBeforeUnmount", "h"];
  for (const key of required) {
    if (typeof mod[key] !== "function") {
      return null;
    }
  }

  return mod as unknown as VueRuntime;
}

async function loadTermUiRuntime(): Promise<TermUiRuntime | null> {
  const candidates = ["@vue-termui/core", "vue-termui"];

  for (const name of candidates) {
    const mod = (await safeImport(name)) as AnyRecord | null;
    if (!mod) continue;
    const normalized = normalizeTermUiModule(mod);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeTermUiModule(mod: AnyRecord): TermUiRuntime | null {
  const direct = mod;
  if (typeof direct.createApp === "function") {
    return direct as unknown as TermUiRuntime;
  }

  const asDefault = mod.default as AnyRecord | undefined;
  if (asDefault && typeof asDefault.createApp === "function") {
    return asDefault as unknown as TermUiRuntime;
  }

  return null;
}

async function safeImport(moduleName: string): Promise<unknown | null> {
  try {
    return await import(moduleName);
  } catch {
    return null;
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
