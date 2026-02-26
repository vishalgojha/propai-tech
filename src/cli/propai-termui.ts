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
import { isXaiEnabled } from "../llm/xai.js";
import { findClosestTerm } from "./command-hints.js";
import { getPropaiLogoLines } from "./branding.js";
import {
  DEFAULT_THEME,
  getTerminalTheme,
  listTerminalThemes,
  parseTerminalThemeId,
  type TerminalThemeId
} from "./theme-pack.js";
import {
  getTerminalPrefsPath,
  loadTerminalUserPrefs,
  saveTerminalUserPrefs,
  type TerminalUserPrefs
} from "./user-prefs.js";
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
type OperatorMode = "guided" | "expert";
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
  operatorMode: OperatorMode;
  theme: TerminalThemeId;
  autonomy: AutonomyLevel;
  dryRun: boolean;
  recipient?: string;
  model?: string;
  leadDefaults: LeadDefaults;
  input: string;
  busy: boolean;
  pulse: boolean;
  provider: "openrouter" | "xai" | "ollama" | "none";
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
const COMMANDS = [
  "help",
  "state",
  "llm",
  "pending",
  "approve",
  "deny",
  "a",
  "d",
  "set",
  "mode",
  "clear",
  "back",
  "exit",
  "quit"
] as const;
const SET_KEYS = ["autonomy", "dryrun", "recipient", "model", "name", "phone", "city", "lang", "language", "wizard", "theme"] as const;

const HELP_TEXT = [
  "Commands:",
  "  /help",
  "  /state",
  "  /llm",
  "  /pending",
  "  /approve",
  "  /approve <index|next|all>",
  "  /deny",
  "  /deny <index|next|all>",
  "  /a  (approve next pending)",
  "  /d  (deny next pending)",
  "  /mode <guided|expert>",
  "  /set autonomy <0|1|2>",
  "  /set dryrun <on|off>",
  "  /set recipient <+E164|none>",
  "  /set model <model-id|none>",
  "  /set name <text>",
  "  /set phone <text>",
  "  /set city <text>",
  "  /set lang <en|hi|hinglish>",
  "  /set theme <pro|calm|contrast>",
  "  /set wizard",
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
        "  npm install vue vue-termui",
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
  const logoLines = getPropaiLogoLines();

  return defineComponent({
    name: "PropAiTermUi",
    setup() {
      const state = reactive<SessionState>({
        operatorMode: "guided",
        theme: DEFAULT_THEME,
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
        "/mode expert",
        "/set theme calm",
        "/state",
        "/llm",
        "/pending",
        "/a",
        "/d",
        "/approve all",
        "/set wizard",
        "msg +9198... Hi"
      ]);

      const sidebarFacts = computed(() => [
        `mode=${state.operatorMode}`,
        `theme=${state.theme}`,
        `autonomy=${state.autonomy}`,
        `dryRun=${String(state.dryRun)}`,
        `recipient=${state.recipient || "none"}`,
        `model=${state.model || "default"}`
      ]);

      const palette = computed(() => getTerminalTheme(state.theme).tui);

      const pendingFacts = computed(() => {
        if (!state.pendingApproval || state.pendingApproval.steps.length === 0) {
          return ["none"];
        }
        return state.pendingApproval.steps.map((step, index) => `${index + 1}. ${step.tool}`);
      });

      const headerTicker = computed(() => {
        const pulse = state.pulse ? "[live]" : "[....]";
        return `${pulse} PropAI Command Deck | non-technical safe mode ready | approvals enforced`;
      });

      const statusStrip = computed(() => {
        const waMode = state.dryRun ? "wa=simulated" : "wa=live";
        const approvalCount = state.pendingApproval?.steps.length || 0;
        const approvalText = approvalCount > 0 ? `approvals=${approvalCount}` : "approvals=0";
        return `Mode=${state.operatorMode} | Theme=${state.theme} | A=${state.autonomy} | dryRun=${state.dryRun ? "on" : "off"} | LLM=${state.provider} | ${waMode} | ${approvalText}`;
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
        addMessage(
          state,
          "assistant",
          "PropAI TUI online in guided mode. Type a request in plain English, or run /help for commands."
        );
        addActivity(state, "Session started");
        void hydrateTermUiPrefs(state);
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
          h(ui.Box, { bordered: true, borderStyle: "double", borderColor: palette.value.headerBorder, padding: 1 }, [
            h(ui.Text, {
              text: "PropAI Terminal",
              color: palette.value.brandText,
              bold: true
            }),
            ...logoLines.map((line) =>
              h(ui.Text, {
                text: line,
                color: palette.value.brandText
              })
            ),
            h(ui.Marquee, {
              text: headerTicker.value,
              color: palette.value.tickerText,
              speed: 26
            }),
            h(ui.Text, {
              text: statusStrip.value,
              color: palette.value.statusText,
              bold: true
            })
          ]),
          h(ui.Box, { flexDirection: "row", grow: 1, gap: 1, padding: 1 }, [
            h(ui.Box, { grow: 3, bordered: true, borderColor: palette.value.conversationBorder, padding: 1 }, [
              h(ui.Text, { text: "Conversation", color: palette.value.conversationTitle, bold: true }),
              h(ui.Separator),
              h(
                ui.Box,
                { flexDirection: "column", grow: 1, margin: 0, padding: 0 },
                visibleMessages.value.map((item) =>
                  h(ui.Text, {
                    text: `${item.at} ${labelForRole(item.role)} ${item.text}`,
                    color: colorForRole(item.role, state.theme),
                    wrap: true
                  })
                )
              )
            ]),
            h(ui.Box, { grow: 2, flexDirection: "column", gap: 1 }, [
              h(ui.Box, { bordered: true, borderColor: palette.value.sessionBorder, padding: 1 }, [
                h(ui.Text, { text: "Session", color: palette.value.brandText, bold: true }),
                h(ui.Status, { text: state.statusText, status: state.statusKind }),
                ...sidebarFacts.value.map((line) =>
                  h(ui.Text, {
                    text: line,
                    color: "white"
                  })
                )
              ]),
              h(ui.Box, { bordered: true, borderColor: palette.value.approvalBorder, padding: 1 }, [
                h(ui.Text, { text: "Approval Queue", color: palette.value.approvalBorder, bold: true }),
                ...pendingFacts.value.map((line) =>
                  h(ui.Text, {
                    text: line,
                    color: line === "none" ? palette.value.pendingEmpty : palette.value.pendingItem
                  })
                )
              ]),
              h(ui.Box, { bordered: true, borderColor: palette.value.activityBorder, padding: 1, grow: 1 }, [
                h(ui.Text, { text: "Recent Activity", color: palette.value.activityBorder, bold: true }),
                ...visibleActivities.value.map((line) =>
                  h(ui.Text, {
                    text: `- ${line}`,
                    color: palette.value.activityText
                  })
                )
              ]),
              h(ui.Box, { bordered: true, borderColor: palette.value.quickBorder, padding: 1 }, [
                h(ui.Text, { text: "Quick Commands", color: palette.value.quickBorder, bold: true }),
                h(ui.List, { items: quickCommands.value })
              ])
            ])
          ]),
          h(ui.Box, { bordered: true, borderColor: state.busy ? palette.value.inputBusy : palette.value.inputIdle, padding: 1 }, [
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
  const inputCommand = (commandRaw || "").toLowerCase();
  const normalizedCommand = normalizeCommand(inputCommand);
  const command = resolveCommand(state, normalizedCommand);
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
          mode: state.operatorMode,
          theme: state.theme,
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
      const xai = isXaiEnabled();
      const line = [
        `OpenRouter=${openrouter ? "enabled" : "disabled"}`,
        `xAI=${xai ? "enabled" : "disabled"}`,
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

  if (command === "pending") {
    showPendingQueue(state);
    return;
  }

  if (command === "a") {
    await approvePendingSteps(state, value || "next");
    return;
  }

  if (command === "d") {
    denyPendingSteps(state, value || "next");
    return;
  }

  if (command === "approve") {
    await approvePendingSteps(state, value || "all");
    return;
  }

  if (command === "deny") {
    denyPendingSteps(state, value || "all");
    return;
  }

  if (command === "clear") {
    state.messages = [];
    state.activities = [];
    state.history = [];
    state.pendingApproval = null;
    addMessage(state, "assistant", "Session cleared.");
    addActivity(state, "Cleared session");
    void persistTermUiPrefs(state);
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

  if (command === "mode") {
    applyModeCommand(state, value);
    void persistTermUiPrefs(state);
    return;
  }

  const suggestion = findClosestTerm(inputCommand, COMMANDS, 2);
  if (suggestion) {
    addMessage(state, "assistant", `Unknown command: /${inputCommand}. Did you mean /${suggestion}?`);
    return;
  }

  addMessage(state, "assistant", `Unknown command: /${inputCommand}. Use /help.`);
}

function normalizeCommand(command: string): string {
  if (command === "a") return "a";
  if (command === "d") return "d";
  if (command === "q") return "back";
  return command;
}

function resolveCommand(state: SessionState, command: string): string | null {
  if (!command) return null;
  if (COMMANDS.includes(command as (typeof COMMANDS)[number])) {
    return command;
  }

  const suggestion = findClosestTerm(command, COMMANDS, 2);
  if (!suggestion) return command;

  if (state.operatorMode === "guided") {
    addMessage(state, "system", `Interpreting /${command} as /${suggestion}.`);
    return suggestion;
  }

  return command;
}

function normalizeSetKey(key: string): string {
  if (key === "language") return "lang";
  return key;
}

function applyModeCommand(state: SessionState, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    addMessage(state, "assistant", `mode=${state.operatorMode}. Use /mode guided or /mode expert.`);
    return;
  }

  if (normalized === "guided" || normalized === "expert") {
    state.operatorMode = normalized;
    addMessage(state, "assistant", `mode=${state.operatorMode}`);
    addActivity(state, `Switched mode to ${state.operatorMode}`);
    return;
  }

  const suggestion = findClosestTerm(normalized, ["guided", "expert"], 2);
  if (suggestion) {
    state.operatorMode = suggestion as OperatorMode;
    addMessage(state, "assistant", `mode=${state.operatorMode} (auto-corrected)`);
    addActivity(state, `Switched mode to ${state.operatorMode}`);
    return;
  }

  addMessage(state, "assistant", "mode must be guided or expert.");
}

function showPendingQueue(state: SessionState) {
  if (!state.pendingApproval || state.pendingApproval.steps.length === 0) {
    addMessage(state, "assistant", "No pending approvals.");
    return;
  }

  const lines = state.pendingApproval.steps
    .map((step, index) => `${index + 1}. ${step.tool} - ${step.reason}`)
    .join("\n");
  addMessage(
    state,
    "assistant",
    `Pending approvals:\n${lines}\nUse /approve <index|next|all> or /deny <index|next|all>.`
  );
}

async function hydrateTermUiPrefs(state: SessionState): Promise<void> {
  try {
    const prefs = await loadTerminalUserPrefs();
    if (!prefs) {
      await persistTermUiPrefs(state, false);
      return;
    }

    applyPrefsToTermUiState(state, prefs);
    addMessage(state, "system", `Loaded saved defaults from ${getTerminalPrefsPath()}`);
    addActivity(state, "Loaded saved defaults");
  } catch (error) {
    addActivity(
      state,
      `Could not load saved defaults: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function applyPrefsToTermUiState(state: SessionState, prefs: TerminalUserPrefs): void {
  if (prefs.operatorMode) state.operatorMode = prefs.operatorMode;
  if (prefs.theme) state.theme = prefs.theme;
  if (prefs.autonomy === 0 || prefs.autonomy === 1 || prefs.autonomy === 2) {
    state.autonomy = prefs.autonomy;
  }
  if (typeof prefs.dryRun === "boolean") state.dryRun = prefs.dryRun;
  state.recipient = prefs.recipient || undefined;
  state.model = prefs.model || undefined;

  const lead = prefs.leadDefaults || {};
  state.leadDefaults = {
    name: lead.name || undefined,
    phone: lead.phone || undefined,
    city: lead.city || undefined,
    preferredLanguage: lead.preferredLanguage
  };
}

function buildTermUiPrefs(state: SessionState): TerminalUserPrefs {
  return {
    version: 1,
    operatorMode: state.operatorMode,
    theme: state.theme,
    autonomy: state.autonomy,
    dryRun: state.dryRun,
    recipient: state.recipient,
    model: state.model,
    leadDefaults: {
      name: state.leadDefaults.name,
      phone: state.leadDefaults.phone,
      city: state.leadDefaults.city,
      preferredLanguage: state.leadDefaults.preferredLanguage
    }
  };
}

async function persistTermUiPrefs(state: SessionState, reportErrors = true): Promise<void> {
  try {
    await saveTerminalUserPrefs(buildTermUiPrefs(state));
  } catch (error) {
    if (!reportErrors) return;
    addActivity(
      state,
      `Could not save defaults: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function applySetCommand(state: SessionState, value: string) {
  const [keyRaw, ...rest] = value.split(/\s+/);
  const inputKey = (keyRaw || "").toLowerCase();
  const key = normalizeSetKey(inputKey);
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
      void persistTermUiPrefs(state);
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
    void persistTermUiPrefs(state);
    return;
  }

  if (key === "recipient") {
    state.recipient = val && val.toLowerCase() !== "none" ? val : undefined;
    addMessage(state, "assistant", `recipient=${state.recipient || "none"}`);
    addActivity(state, `Set recipient=${state.recipient || "none"}`);
    void persistTermUiPrefs(state);
    return;
  }

  if (key === "model") {
    state.model = val && val.toLowerCase() !== "none" ? val : undefined;
    addMessage(state, "assistant", `model=${state.model || "default"}`);
    addActivity(state, `Set model=${state.model || "default"}`);
    void persistTermUiPrefs(state);
    return;
  }

  if (key === "name") {
    state.leadDefaults.name = val || undefined;
    addMessage(state, "assistant", `lead.name=${state.leadDefaults.name || "none"}`);
    void persistTermUiPrefs(state);
    return;
  }

  if (key === "phone") {
    state.leadDefaults.phone = val || undefined;
    addMessage(state, "assistant", `lead.phone=${state.leadDefaults.phone || "none"}`);
    void persistTermUiPrefs(state);
    return;
  }

  if (key === "city") {
    state.leadDefaults.city = val || undefined;
    addMessage(state, "assistant", `lead.city=${state.leadDefaults.city || "none"}`);
    void persistTermUiPrefs(state);
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
    void persistTermUiPrefs(state);
    return;
  }

  if (key === "theme") {
    if (!val) {
      addMessage(
        state,
        "assistant",
        `theme=${state.theme}. Options: ${listTerminalThemes().map((item) => item.id).join(", ")}`
      );
      return;
    }

    const parsedTheme = parseTerminalThemeId(val);
    if (parsedTheme) {
      state.theme = parsedTheme;
      const theme = getTerminalTheme(parsedTheme);
      addMessage(state, "assistant", `theme=${theme.id} (${theme.label})`);
      addActivity(state, `Theme set to ${theme.id}`);
      void persistTermUiPrefs(state);
      return;
    }

    const suggestion = findClosestTerm(val.toLowerCase(), listTerminalThemes().map((item) => item.id), 3);
    if (suggestion) {
      state.theme = suggestion as TerminalThemeId;
      const theme = getTerminalTheme(state.theme);
      addMessage(state, "assistant", `theme=${theme.id} (${theme.label}) (auto-corrected)`);
      addActivity(state, `Theme set to ${theme.id}`);
      void persistTermUiPrefs(state);
      return;
    }

    addMessage(
      state,
      "assistant",
      `Unknown theme '${val}'. Options: ${listTerminalThemes().map((item) => item.id).join(", ")}`
    );
    return;
  }

  if (key === "wizard") {
    addMessage(
      state,
      "assistant",
      "Wizard quick path: /set name <text>, /set phone <text>, /set city <text>, /set lang <en|hi|hinglish>."
    );
    return;
  }

  const suggestion = findClosestTerm(inputKey, SET_KEYS, 2);
  if (suggestion) {
    addMessage(state, "assistant", `Unknown set key: ${inputKey}. Applying ${suggestion}.`);
    applySetCommand(state, `${suggestion} ${val}`.trim());
    return;
  }

  addMessage(state, "assistant", `Unknown set key: ${inputKey}`);
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
      const lines = approvalSteps.map((item, index) => `${index + 1}. ${item.tool} - ${item.reason}`).join("\n");
      addMessage(
        state,
        "system",
        `Approval queue:\n${lines}\nRun /approve <index|next|all> or /deny <index|next|all>. Shortcuts: /a, /d`
      );
      addActivity(state, `Queued ${approvalSteps.length} approval step(s)`);
      setStatus(state, `awaiting ${approvalSteps.length} approval(s)`, "warning");
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

async function approvePendingSteps(state: SessionState, targetRaw: string) {
  if (!state.pendingApproval || state.pendingApproval.steps.length === 0) {
    addMessage(state, "assistant", "No pending steps.");
    return;
  }

  if (state.autonomy === 0) {
    addMessage(state, "assistant", "Autonomy L0 blocks execution. Use /set autonomy 1 or 2.");
    return;
  }

  const selection = parseApprovalSelection(targetRaw, state.pendingApproval.steps.length);
  if (!selection.ok) {
    addMessage(state, "assistant", selection.error || "Invalid approval selection.");
    return;
  }

  state.busy = true;
  setStatus(state, "running approved steps", "info");

  try {
    const pending = state.pendingApproval;
    const chosenIndexes = selection.all ? pending.steps.map((_, idx) => idx) : [selection.index];
    const chosenSet = new Set(chosenIndexes);
    const selectedSteps = pending.steps.filter((_, idx) => chosenSet.has(idx));
    const remainingSteps = pending.steps.filter((_, idx) => !chosenSet.has(idx));
    state.pendingApproval = remainingSteps.length > 0 ? { ...pending, steps: remainingSteps } : null;

    const results: ToolExecutionRecord[] = [];

    for (const step of selectedSteps) {
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
      selectedSteps,
      results,
      `Approved ${selectedSteps.length} pending step(s).`
    );
    addMessage(state, "assistant", reply);

    if (state.pendingApproval && state.pendingApproval.steps.length > 0) {
      addMessage(
        state,
        "system",
        `Still pending: ${state.pendingApproval.steps.length} step(s). Use /pending, /a, /d, /approve, or /deny.`
      );
      setStatus(state, `awaiting ${state.pendingApproval.steps.length} approval(s)`, "warning");
    } else {
      setStatus(state, "approved steps completed", "success");
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    addMessage(state, "assistant", `Approval execution failed: ${messageText}`);
    setStatus(state, "approval execution failed", "error");
  } finally {
    state.busy = false;
  }
}

function denyPendingSteps(state: SessionState, targetRaw: string) {
  if (!state.pendingApproval || state.pendingApproval.steps.length === 0) {
    addMessage(state, "assistant", "No pending steps to deny.");
    return;
  }

  const selection = parseApprovalSelection(targetRaw, state.pendingApproval.steps.length);
  if (!selection.ok) {
    addMessage(state, "assistant", selection.error || "Invalid deny selection.");
    return;
  }

  const pending = state.pendingApproval;
  const chosenIndexes = selection.all ? pending.steps.map((_, idx) => idx) : [selection.index];
  const chosenSet = new Set(chosenIndexes);
  const denied = pending.steps.filter((_, idx) => chosenSet.has(idx));
  const remainingSteps = pending.steps.filter((_, idx) => !chosenSet.has(idx));
  state.pendingApproval = remainingSteps.length > 0 ? { ...pending, steps: remainingSteps } : null;

  const deniedList = denied.map((step) => step.tool).join(", ");
  addMessage(state, "assistant", `Denied: ${deniedList}`);
  addActivity(state, `Denied ${denied.length} pending step(s)`);

  if (state.pendingApproval && state.pendingApproval.steps.length > 0) {
    setStatus(state, `awaiting ${state.pendingApproval.steps.length} approval(s)`, "warning");
    addMessage(state, "system", `Still pending: ${state.pendingApproval.steps.length} step(s). Run /pending.`);
  } else {
    setStatus(state, "pending steps denied", "warning");
  }
}

function parseApprovalSelection(
  raw: string,
  total: number
): { ok: true; all: true } | { ok: true; all: false; index: number } | { ok: false; error: string } {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return { ok: true, all: true };
  }
  if (normalized === "next") {
    return { ok: true, all: false, index: 0 };
  }

  const numeric = Number(normalized);
  if (!Number.isInteger(numeric)) {
    return { ok: false, error: "Use index number, next, or all." };
  }
  if (numeric < 1 || numeric > total) {
    return { ok: false, error: `Index out of range. Choose 1-${total}.` };
  }
  return { ok: true, all: false, index: numeric - 1 };
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

function colorForRole(role: MessageRole, themeId: TerminalThemeId): string {
  const palette = getTerminalTheme(themeId).tui;
  if (role === "assistant") return palette.assistantText;
  if (role === "system") return palette.systemText;
  return palette.userText;
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
  const candidates = ["vue-termui", "@vue-termui/core"];

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
