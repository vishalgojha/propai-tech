import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { RealtorOrchestrator } from "../agentic/agents/orchestrator.js";
import { evaluateGuardrails } from "../agentic/suite/guardrails.js";
import { planToolCalls } from "../agentic/suite/planner.js";
import { RealtorSuiteAgentEngine } from "../agentic/suite/engine.js";
import { generateAssistantText } from "../llm/chat.js";
import { getOllamaStatus } from "../llm/ollama.js";
import { isOpenRouterEnabled } from "../llm/openrouter.js";
import {
  runAdsLeadQualification,
  runGeneratePerformanceReport,
  runGroupRequirementMatchScan,
  runMatchPropertyToBuyer,
  runPostTo99Acres,
  runScheduleSiteVisit,
  runSendWhatsappFollowup
} from "../agentic/suite/toolkit.js";
import type { ChatRequest, PlannedToolCall, ToolExecutionRecord, ToolName } from "../agentic/suite/types.js";
import type { LeadInput, PreferredLanguage } from "../agentic/types.js";

type CliRl = ReturnType<typeof createInterface>;
type AutonomyLevel = 0 | 1 | 2;
type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

type SessionState = {
  autonomy: AutonomyLevel;
  dryRun: boolean;
  recipient?: string;
  model?: string;
  leadDefaults: {
    name?: string;
    phone?: string;
    city?: string;
    preferredLanguage?: PreferredLanguage;
  };
  turns: number;
  history: ChatHistoryMessage[];
};

const DEFAULT_DRY_RUN = process.env.WACLI_DRY_RUN !== "false";
const LOCAL_WRITE_TOOLS: ToolName[] = ["schedule_site_visit"];
const EXTERNAL_TOOLS: ToolName[] = ["post_to_99acres", "send_whatsapp_followup"];

const suiteEngine = new RealtorSuiteAgentEngine();
const orchestrator = new RealtorOrchestrator();

async function main() {
  const rl = createInterface({ input, output });
  const menuMode = process.argv.includes("--menu");
  printBanner(menuMode ? "menu" : "shell");

  try {
    if (menuMode) {
      await runClassicMenu(rl);
      return;
    }
    await runAgenticSession(rl);
  } finally {
    rl.close();
  }
}

async function runClassicMenu(rl: CliRl) {
  while (true) {
    printMenu();
    const choice = await ask(rl, "Select option");

    switch (choice) {
      case "1":
        await runAgenticSession(rl);
        break;
      case "2":
        await runSuiteAgentChat(rl);
        break;
      case "3":
        await runLeadOrchestrator(rl);
        break;
      case "4":
        await runTransportMenu(rl);
        break;
      case "5":
      case "q":
      case "quit":
      case "exit":
        // eslint-disable-next-line no-console
        console.log("\nExiting PropAI interactive terminal.");
        return;
      default:
        // eslint-disable-next-line no-console
        console.log("Invalid option. Use 1-5.");
    }
  }
}

async function runAgenticSession(rl: CliRl) {
  const state: SessionState = {
    autonomy: 1,
    dryRun: DEFAULT_DRY_RUN,
    recipient: undefined,
    model: undefined,
    leadDefaults: {},
    turns: 0,
    history: []
  };

  printAgenticHelp();

  while (true) {
    const raw = await ask(rl, "propai");
    if (!raw) continue;

    if (raw.startsWith("/")) {
      const shouldExit = await handleSessionCommand(rl, state, raw);
      if (shouldExit) {
        // eslint-disable-next-line no-console
        console.log("Leaving agentic session.");
        return;
      }
      continue;
    }

    state.turns += 1;
    await runAgentTurn(rl, state, raw);
  }
}

async function handleSessionCommand(rl: CliRl, state: SessionState, raw: string): Promise<boolean> {
  const text = raw.slice(1).trim();
  const [command, ...rest] = text.split(/\s+/);
  const cmd = (command || "").toLowerCase();
  const value = rest.join(" ").trim();

  if (cmd === "exit" || cmd === "back" || cmd === "quit") return true;

  if (cmd === "help") {
    printAgenticHelp();
    return false;
  }

  if (cmd === "state") {
    printSessionState(state);
    return false;
  }

  if (cmd === "llm") {
    await printLlmStatus();
    return false;
  }

  if (cmd === "clear") {
    state.recipient = undefined;
    state.model = undefined;
    state.leadDefaults = {};
    state.history = [];
    // eslint-disable-next-line no-console
    console.log("Session defaults cleared.");
    return false;
  }

  if (cmd === "set") {
    await applySetCommand(rl, state, value);
    return false;
  }

  // eslint-disable-next-line no-console
  console.log(`Unknown command: /${cmd}. Use /help.`);
  return false;
}

async function applySetCommand(rl: CliRl, state: SessionState, value: string): Promise<void> {
  const [keyRaw, ...rest] = value.split(/\s+/);
  const key = (keyRaw || "").toLowerCase();
  const val = rest.join(" ").trim();

  if (!key) {
    // eslint-disable-next-line no-console
    console.log("Usage: /set <autonomy|dryrun|recipient|model|name|phone|city|lang> <value>");
    return;
  }

  if (key === "autonomy") {
    if (val === "0" || val === "1" || val === "2") {
      state.autonomy = Number(val) as AutonomyLevel;
      // eslint-disable-next-line no-console
      console.log(`autonomy=${state.autonomy}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log("autonomy must be 0, 1, or 2.");
    return;
  }

  if (key === "dryrun") {
    const parsed = parseBoolean(val);
    if (parsed === null) {
      // eslint-disable-next-line no-console
      console.log("dryrun must be true/false (or on/off).");
      return;
    }
    state.dryRun = parsed;
    // eslint-disable-next-line no-console
    console.log(`dryRun=${state.dryRun}`);
    return;
  }

  if (key === "recipient") {
    state.recipient = val && val.toLowerCase() !== "none" ? val : undefined;
    // eslint-disable-next-line no-console
    console.log(`recipient=${state.recipient || "(none)"}`);
    return;
  }

  if (key === "model") {
    state.model = val && val.toLowerCase() !== "none" ? val : undefined;
    // eslint-disable-next-line no-console
    console.log(`model=${state.model || "(default)"}`);
    return;
  }

  if (key === "name") {
    state.leadDefaults.name = val || undefined;
    // eslint-disable-next-line no-console
    console.log(`lead.name=${state.leadDefaults.name || "(none)"}`);
    return;
  }

  if (key === "phone") {
    state.leadDefaults.phone = val || undefined;
    // eslint-disable-next-line no-console
    console.log(`lead.phone=${state.leadDefaults.phone || "(none)"}`);
    return;
  }

  if (key === "city") {
    state.leadDefaults.city = val || undefined;
    // eslint-disable-next-line no-console
    console.log(`lead.city=${state.leadDefaults.city || "(none)"}`);
    return;
  }

  if (key === "lang" || key === "language") {
    const parsed = parsePreferredLanguage(val);
    if (!parsed && val) {
      // eslint-disable-next-line no-console
      console.log("lang must be en, hi, or hinglish.");
      return;
    }
    state.leadDefaults.preferredLanguage = parsed;
    // eslint-disable-next-line no-console
    console.log(`lead.preferredLanguage=${parsed || "(none)"}`);
    return;
  }

  if (key === "wizard") {
    await runLeadDefaultWizard(rl, state);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Unknown set key: ${key}`);
}

async function runLeadDefaultWizard(rl: CliRl, state: SessionState): Promise<void> {
  state.leadDefaults.name = (await ask(rl, "Default lead name (blank=clear)")) || undefined;
  state.leadDefaults.phone = (await ask(rl, "Default lead phone (blank=clear)")) || undefined;
  state.leadDefaults.city = (await ask(rl, "Default lead city (blank=clear)")) || undefined;
  state.leadDefaults.preferredLanguage = parsePreferredLanguage(
    await ask(rl, "Default lead language [en|hi|hinglish] (blank=clear)")
  );
  // eslint-disable-next-line no-console
  console.log("Lead defaults updated.");
}

async function runAgentTurn(rl: CliRl, state: SessionState, message: string): Promise<void> {
  const directMsg = parseDirectSendCommand(message);
  if (directMsg) {
    const handled = await runDirectSendCommand(rl, state, message, directMsg);
    if (handled) return;
  }

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
  const turnNote: string[] = [];
  let plan: PlannedToolCall[] = [];
  let results: ToolExecutionRecord[] = [];

  const guardrail = evaluateGuardrails(request);
  if (!guardrail.allow) {
    turnNote.push(guardrail.reason || "Request blocked by guardrails.");
    const reply = await buildAssistantReply(state, request, plan, results, turnNote.join(" "));
    printAssistantReply(reply);
    pushHistory(state, message, reply);
    return;
  }

  plan = planToolCalls(request.message);
  if (plan.length === 0) {
    turnNote.push("No tool plan triggered. Respond conversationally.");
    const reply = await buildAssistantReply(state, request, plan, results, turnNote.join(" "));
    printAssistantReply(reply);
    pushHistory(state, message, reply);
    return;
  }

  printPlan(plan);

  if (state.autonomy === 0) {
    turnNote.push("Autonomy L0 suggest-only, no tools executed.");
    const reply = await buildAssistantReply(state, request, plan, results, turnNote.join(" "));
    printAssistantReply(reply);
    pushHistory(state, message, reply);
    return;
  }

  const execution = await executePlanWithApprovals(rl, plan, request, state);
  results = execution.results;
  const recipient = execution.recipient;
  state.recipient = recipient;
  printExecutionSummary(results);
  const reply = await buildAssistantReply(state, request, plan, results, turnNote.join(" "));
  printAssistantReply(reply);
  pushHistory(state, message, reply);
}

type DirectSendCommand = {
  to: string;
  body?: string;
};

function parseDirectSendCommand(raw: string): DirectSendCommand | null {
  const match = raw
    .trim()
    .match(/^(?:msg|message|send)\s+([+]?\d[\d\s-]{7,20})(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const toDigits = match[1].replace(/[^\d]/g, "");
  if (toDigits.length < 8 || toDigits.length > 15) return null;
  const to = `+${toDigits}`;
  const body = match[2]?.trim();
  return {
    to,
    body: body && body.length > 0 ? body : undefined
  };
}

async function runDirectSendCommand(
  rl: CliRl,
  state: SessionState,
  originalMessage: string,
  command: DirectSendCommand
): Promise<boolean> {
  if (!command.body) {
    const reply =
      "Send format: `msg <phone> <message>`. Example: `msg +919820056180 Hi, sharing 2 options in Wakad today.`";
    printAssistantReply(reply);
    pushHistory(state, originalMessage, reply);
    return true;
  }

  if (state.autonomy < 2) {
    const reply =
      "Direct send is blocked at current autonomy. Use `/set autonomy 2` and retry to allow per-message approval.";
    printAssistantReply(reply);
    pushHistory(state, originalMessage, reply);
    return true;
  }

  const approved = await askYesNo(
    rl,
    `Approve direct send to ${command.to}? [default N]`,
    false
  );
  if (!approved) {
    const reply = "Direct send skipped: not approved.";
    printAssistantReply(reply);
    pushHistory(state, originalMessage, reply);
    return true;
  }

  const result = await orchestrator.sendManualMessage(command.to, command.body);
  const reply = result.ok
    ? `Message sent to ${command.to}.`
    : `Send failed for ${command.to}. ${result.stderr || "Check wacli and session status."}`;
  printAssistantReply(reply);
  pushHistory(state, originalMessage, reply);
  return true;
}

async function executePlanWithApprovals(
  rl: CliRl,
  plan: PlannedToolCall[],
  request: ChatRequest,
  state: SessionState
): Promise<{ results: ToolExecutionRecord[]; recipient?: string }> {
  const results: ToolExecutionRecord[] = [];
  let mutableRequest: ChatRequest = { ...request };

  for (const step of plan) {
    if (step.tool === "send_whatsapp_followup" && !mutableRequest.recipient) {
      const recipient = await ask(
        rl,
        "No recipient set. Enter E.164 to send now (leave blank for draft-only)"
      );
      mutableRequest = { ...mutableRequest, recipient: recipient || undefined };
    }

    const approval = await approveStep(rl, state, step.tool, mutableRequest);
    if (!approval.allowed) {
      const skipped: ToolExecutionRecord = {
        tool: step.tool,
        ok: false,
        summary: `Skipped: ${approval.reason}`
      };
      results.push(skipped);
      // eslint-disable-next-line no-console
      console.log(`Skipped ${step.tool}: ${approval.reason}`);
      continue;
    }

    const result = await executeStep(step, mutableRequest);
    results.push(result);
    // eslint-disable-next-line no-console
    console.log(`[${result.ok ? "OK" : "FAIL"}] ${result.tool} - ${result.summary}`);

    if (!result.ok) {
      const shouldContinue = await askYesNo(rl, "Continue remaining plan steps? [default Y]", true);
      if (!shouldContinue) break;
    }
  }

  return { results, recipient: mutableRequest.recipient };
}

async function approveStep(
  rl: CliRl,
  state: SessionState,
  tool: ToolName,
  request: ChatRequest
): Promise<{ allowed: boolean; reason?: string }> {
  const isExternal = isExternalAction(tool, request);
  const isLocalWrite = LOCAL_WRITE_TOOLS.includes(tool);

  if (state.autonomy === 1 && isExternal) {
    return {
      allowed: false,
      reason: "autonomy L1 blocks external actions (send/publish)."
    };
  }

  if (isLocalWrite) {
    const yes = await askYesNo(rl, `Approve local write step '${tool}'? [default N]`, false);
    return yes
      ? { allowed: true }
      : { allowed: false, reason: "local write not approved by operator." };
  }

  if (state.autonomy === 2 && isExternal) {
    const yes = await askYesNo(rl, `Approve external step '${tool}'? [default N]`, false);
    return yes
      ? { allowed: true }
      : { allowed: false, reason: "external action not approved by operator." };
  }

  return { allowed: true };
}

function isExternalAction(tool: ToolName, request: ChatRequest): boolean {
  if (!EXTERNAL_TOOLS.includes(tool)) return false;
  if (tool === "send_whatsapp_followup") return Boolean(request.recipient);
  return true;
}

async function executeStep(step: PlannedToolCall, request: ChatRequest): Promise<ToolExecutionRecord> {
  switch (step.tool) {
    case "post_to_99acres":
      return runPostTo99Acres(request);
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

function printPlan(plan: PlannedToolCall[]) {
  // eslint-disable-next-line no-console
  console.log("Plan:");
  for (const [idx, step] of plan.entries()) {
    // eslint-disable-next-line no-console
    console.log(`  ${idx + 1}. ${step.tool} - ${step.reason}`);
  }
}

function printExecutionSummary(results: ToolExecutionRecord[]) {
  // eslint-disable-next-line no-console
  console.log("\nExecution Summary:");
  if (results.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  (no steps executed)");
    return;
  }

  const okCount = results.filter((item) => item.ok).length;
  const failCount = results.length - okCount;
  // eslint-disable-next-line no-console
  console.log(`  Steps: ${results.length}, OK: ${okCount}, Fail/Skip: ${failCount}`);

  for (const item of results) {
    // eslint-disable-next-line no-console
    console.log(`  - [${item.ok ? "OK" : "FAIL"}] ${item.tool}: ${item.summary}`);
  }
}

function printAssistantReply(reply: string) {
  // eslint-disable-next-line no-console
  console.log(`\nAssistant: ${reply}`);
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

  const llm = await generateAssistantText(
    [
      {
        role: "system",
        content:
          "You are PropAI terminal copilot. Reply like a live chat assistant in plain concise language. Confirm understanding, summarize what was planned/executed/skipped, respect autonomy and approvals, and end with one practical next action or one short question."
      },
      ...state.history.slice(-12),
      { role: "user", content: request.message },
      { role: "user", content: `Execution context: ${JSON.stringify(context)}` }
    ],
    {
      model: request.model,
      temperature: 0.2,
      maxTokens: 220
    }
  );

  if (llm.text && llm.text.trim()) {
    return llm.text.trim();
  }

  return "LLM unavailable. No fallback replies are enabled. Run /llm, ensure OpenRouter or Ollama is configured, then retry.";
}

function pushHistory(state: SessionState, userMessage: string, assistantMessage: string) {
  state.history.push({ role: "user", content: userMessage });
  state.history.push({ role: "assistant", content: assistantMessage });
  if (state.history.length > 24) {
    state.history = state.history.slice(-24);
  }
}

function printSessionState(state: SessionState) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        autonomy: state.autonomy,
        dryRun: state.dryRun,
        recipient: state.recipient || null,
        model: state.model || null,
        leadDefaults: state.leadDefaults,
        turns: state.turns,
        history_messages: state.history.length
      },
      null,
      2
    )
  );
}

async function printLlmStatus() {
  const ollama = await getOllamaStatus();
  const openrouter = isOpenRouterEnabled();

  // eslint-disable-next-line no-console
  console.log("LLM Status");
  // eslint-disable-next-line no-console
  console.log(`  OpenRouter: ${openrouter ? "enabled" : "disabled"}`);
  // eslint-disable-next-line no-console
  console.log(
    `  Ollama: ${ollama.enabled ? "enabled" : "disabled"} | reachable=${ollama.reachable} | base=${ollama.baseUrl}`
  );
  // eslint-disable-next-line no-console
  console.log(`  Ollama selected model: ${ollama.selectedModel}`);
  if (ollama.availableModels.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  Ollama models: ${ollama.availableModels.join(", ")}`);
  }
}

async function runSuiteAgentChat(rl: CliRl) {
  // eslint-disable-next-line no-console
  console.log("\n[Suite Agent Chat - One Shot]");
  const message = await askRequired(rl, "Message");
  const recipient = await ask(rl, "Recipient E.164 (optional)");
  const model = await ask(rl, "Model override (optional)");
  const dryRun = await askYesNo(rl, `Dry run? [default ${DEFAULT_DRY_RUN ? "Y" : "N"}]`, DEFAULT_DRY_RUN);

  const lead = await askLeadContext(rl, message);

  const request: ChatRequest = {
    message,
    recipient: recipient || undefined,
    dryRun,
    model: model || undefined,
    lead
  };

  const result = await suiteEngine.chat(request);
  // eslint-disable-next-line no-console
  console.log(`\nAssistant: ${result.assistantMessage}`);

  if (result.plan.length > 0) {
    // eslint-disable-next-line no-console
    console.log("\nPlan:");
    for (const [idx, step] of result.plan.entries()) {
      // eslint-disable-next-line no-console
      console.log(`  ${idx + 1}. ${step.tool} - ${step.reason}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("\nPlan: (none)");
  }

  // eslint-disable-next-line no-console
  console.log("\nTool Results:");
  if (result.toolResults.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  (none)");
  } else {
    for (const [idx, item] of result.toolResults.entries()) {
      // eslint-disable-next-line no-console
      console.log(`  ${idx + 1}. [${item.ok ? "OK" : "FAIL"}] ${item.tool} - ${item.summary}`);
      if (item.data !== undefined) {
        // eslint-disable-next-line no-console
        console.log(indentBlock(JSON.stringify(item.data, null, 2), 6));
      }
    }
  }

  if (result.suggestedNextPrompts.length > 0) {
    // eslint-disable-next-line no-console
    console.log("\nSuggested Next Prompts:");
    for (const prompt of result.suggestedNextPrompts) {
      // eslint-disable-next-line no-console
      console.log(`  - ${prompt}`);
    }
  }
}

async function runLeadOrchestrator(rl: CliRl) {
  // eslint-disable-next-line no-console
  console.log("\n[Lead Orchestrator]");
  const leadMessage = await askRequired(rl, "Lead message");
  const leadName = await ask(rl, "Lead name (optional)");
  const leadPhone = await ask(rl, "Lead phone (optional)");
  const leadCity = await ask(rl, "Lead city (optional)");
  const leadLanguage = parsePreferredLanguage(await ask(rl, "Language [en|hi|hinglish] (optional)"));

  const send = await askYesNo(rl, `Send WhatsApp follow-up now? [default N]`, false);
  const recipient = send ? await askRequired(rl, "Recipient E.164") : "";

  const lead: LeadInput = {
    message: leadMessage,
    name: leadName || undefined,
    phone: leadPhone || undefined,
    city: leadCity || undefined,
    preferredLanguage: leadLanguage
  };

  const result = await orchestrator.run(lead, {
    sendWhatsApp: send,
    recipient: recipient || undefined
  });

  // eslint-disable-next-line no-console
  console.log("\nQualification:");
  // eslint-disable-next-line no-console
  console.log(indentBlock(JSON.stringify(result.qualification, null, 2), 2));

  // eslint-disable-next-line no-console
  console.log(`\nTop Matches: ${result.matches.length}`);
  if (result.matches.length > 0) {
    for (const [idx, match] of result.matches.entries()) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${idx + 1}. ${match.property.title} | ${match.property.locality}, ${match.property.city} | fit=${match.fitScore}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log("\nFollow-up Draft:");
  // eslint-disable-next-line no-console
  console.log(indentBlock(result.followUp.draftMessage, 2));

  if (result.whatsappAction) {
    // eslint-disable-next-line no-console
    console.log("\nWhatsApp Action:");
    // eslint-disable-next-line no-console
    console.log(indentBlock(JSON.stringify(result.whatsappAction, null, 2), 2));
  }
}

async function runTransportMenu(rl: CliRl) {
  while (true) {
    // eslint-disable-next-line no-console
    console.log("\n[WhatsApp Transport Tools]");
    // eslint-disable-next-line no-console
    console.log("  1) Doctor");
    // eslint-disable-next-line no-console
    console.log("  2) Search Messages");
    // eslint-disable-next-line no-console
    console.log("  3) List Chats");
    // eslint-disable-next-line no-console
    console.log("  4) Send Manual Message");
    // eslint-disable-next-line no-console
    console.log("  5) Back");

    const choice = await ask(rl, "Transport option");
    if (choice === "1") {
      await runWacliDoctor();
      continue;
    }
    if (choice === "2") {
      await runWacliSearch(rl);
      continue;
    }
    if (choice === "3") {
      await runWacliChats(rl);
      continue;
    }
    if (choice === "4") {
      await runManualSend(rl);
      continue;
    }
    if (choice === "5" || choice === "back" || choice === "exit") {
      return;
    }
    // eslint-disable-next-line no-console
    console.log("Invalid option. Use 1-5.");
  }
}

async function runWacliDoctor() {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI Doctor]");
  const result = await orchestrator.doctor();
  printWacliResult(result);
}

async function runWacliSearch(rl: CliRl) {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI Search Messages]");
  const query = await askRequired(rl, "Query");
  const chat = await ask(rl, "Chat ID/name filter (optional)");
  const limit = parseLimit(await ask(rl, "Limit [default 20]"), 20);

  const result = await orchestrator.searchMessages(query, chat || undefined, limit);
  printWacliResult(result);
}

async function runWacliChats(rl: CliRl) {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI List Chats]");
  const query = await ask(rl, "Query (optional)");
  const limit = parseLimit(await ask(rl, "Limit [default 20]"), 20);

  const result = await orchestrator.listChats(query || undefined, limit);
  printWacliResult(result);
}

async function runManualSend(rl: CliRl) {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI Send Text]");
  const to = await askRequired(rl, "Recipient E.164");
  const message = await askRequired(rl, "Message");
  const result = await orchestrator.sendManualMessage(to, message);
  printWacliResult(result);
}

function printWacliResult(result: {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}) {
  // eslint-disable-next-line no-console
  console.log(`  Status: ${result.ok ? "OK" : "FAIL"} (exit=${result.exitCode})`);
  // eslint-disable-next-line no-console
  console.log(`  Command: ${result.command}`);
  if (result.stdout) {
    // eslint-disable-next-line no-console
    console.log("  STDOUT:");
    // eslint-disable-next-line no-console
    console.log(indentBlock(result.stdout, 4));
  }
  if (result.stderr) {
    // eslint-disable-next-line no-console
    console.log("  STDERR:");
    // eslint-disable-next-line no-console
    console.log(indentBlock(result.stderr, 4));
  }
}

async function askLeadContext(
  rl: CliRl,
  messageFallback: string
): Promise<LeadInput | undefined> {
  const addContext = await askYesNo(rl, "Add structured lead context? [default N]", false);
  if (!addContext) return undefined;

  const name = await ask(rl, "Lead name (optional)");
  const phone = await ask(rl, "Lead phone (optional)");
  const city = await ask(rl, "Lead city (optional)");
  const preferredLanguage = parsePreferredLanguage(
    await ask(rl, "Language [en|hi|hinglish] (optional)")
  );
  const leadMessage = await ask(rl, "Lead message override (optional)");

  return {
    message: leadMessage || messageFallback,
    name: name || undefined,
    phone: phone || undefined,
    city: city || undefined,
    preferredLanguage
  };
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

function parseLimit(raw: string, fallback: number): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function ask(rl: CliRl, label: string): Promise<string> {
  return (await rl.question(`${label}: `)).trim();
}

async function askRequired(rl: CliRl, label: string): Promise<string> {
  while (true) {
    const value = await ask(rl, label);
    if (value.length > 0) return value;
    // eslint-disable-next-line no-console
    console.log("Value is required.");
  }
}

async function askYesNo(
  rl: CliRl,
  label: string,
  defaultValue: boolean
): Promise<boolean> {
  const raw = (await ask(rl, label)).toLowerCase();
  if (!raw) return defaultValue;
  if (["y", "yes", "1", "true"].includes(raw)) return true;
  if (["n", "no", "0", "false"].includes(raw)) return false;
  return defaultValue;
}

function printBanner(mode: "shell" | "menu") {
  // eslint-disable-next-line no-console
  console.log("====================================");
  // eslint-disable-next-line no-console
  console.log("PropAI Terminal");
  // eslint-disable-next-line no-console
  console.log(`Mode: ${mode === "shell" ? "codex-style shell" : "classic menu"}`);
  // eslint-disable-next-line no-console
  console.log(`WACLI_DRY_RUN default: ${DEFAULT_DRY_RUN ? "true" : "false"}`);
  // eslint-disable-next-line no-console
  console.log("====================================\n");
}

function printAgenticHelp() {
  // eslint-disable-next-line no-console
  console.log("\n[Agentic Session]");
  // eslint-disable-next-line no-console
  console.log("Type normal chat messages at 'propai:' and I will respond or execute workflows.");
  // eslint-disable-next-line no-console
  console.log("Commands:");
  // eslint-disable-next-line no-console
  console.log("  /help");
  // eslint-disable-next-line no-console
  console.log("  /state");
  // eslint-disable-next-line no-console
  console.log("  /llm");
  // eslint-disable-next-line no-console
  console.log("  /set autonomy <0|1|2>");
  // eslint-disable-next-line no-console
  console.log("  /set dryrun <on|off>");
  // eslint-disable-next-line no-console
  console.log("  /set recipient <+E164|none>");
  // eslint-disable-next-line no-console
  console.log("  /set model <model-id|none>");
  // eslint-disable-next-line no-console
  console.log("  /set name <text>");
  // eslint-disable-next-line no-console
  console.log("  /set phone <text>");
  // eslint-disable-next-line no-console
  console.log("  /set city <text>");
  // eslint-disable-next-line no-console
  console.log("  /set lang <en|hi|hinglish>");
  // eslint-disable-next-line no-console
  console.log("  /set wizard");
  // eslint-disable-next-line no-console
  console.log("  /clear");
  // eslint-disable-next-line no-console
  console.log("  /back (exit shell)");
  // eslint-disable-next-line no-console
  console.log("Tip: run with '--menu' for the old option menu.");
}

function printMenu() {
  // eslint-disable-next-line no-console
  console.log("Menu");
  // eslint-disable-next-line no-console
  console.log("  1) Agentic Session (stateful + approvals)");
  // eslint-disable-next-line no-console
  console.log("  2) Suite Agent Chat (one-shot)");
  // eslint-disable-next-line no-console
  console.log("  3) Lead Orchestrator (one-shot)");
  // eslint-disable-next-line no-console
  console.log("  4) WhatsApp Transport Tools");
  // eslint-disable-next-line no-console
  console.log("  5) Exit");
}

function indentBlock(value: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
