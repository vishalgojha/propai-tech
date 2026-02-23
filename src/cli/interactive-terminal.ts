import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { RealtorOrchestrator } from "../agentic/agents/orchestrator.js";
import { RealtorSuiteAgentEngine } from "../agentic/suite/engine.js";
import type { ChatRequest } from "../agentic/suite/types.js";
import type { LeadInput, PreferredLanguage } from "../agentic/types.js";

const DEFAULT_DRY_RUN = process.env.WACLI_DRY_RUN !== "false";

const suiteEngine = new RealtorSuiteAgentEngine();
const orchestrator = new RealtorOrchestrator();

async function main() {
  const rl = createInterface({ input, output });
  printBanner();

  try {
    while (true) {
      printMenu();
      const choice = await ask(rl, "Select option");

      switch (choice) {
        case "1":
          await runSuiteAgentChat(rl);
          break;
        case "2":
          await runLeadOrchestrator(rl);
          break;
        case "3":
          await runWacliDoctor();
          break;
        case "4":
          await runWacliSearch(rl);
          break;
        case "5":
          await runWacliChats(rl);
          break;
        case "6":
          await runManualSend(rl);
          break;
        case "7":
        case "q":
        case "quit":
        case "exit":
          // eslint-disable-next-line no-console
          console.log("\nExiting PropAI interactive terminal.");
          return;
        default:
          // eslint-disable-next-line no-console
          console.log("Invalid option. Use 1-7.");
      }
    }
  } finally {
    rl.close();
  }
}

async function runSuiteAgentChat(rl: ReturnType<typeof createInterface>) {
  // eslint-disable-next-line no-console
  console.log("\n[Suite Agent Chat]");
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

async function runLeadOrchestrator(rl: ReturnType<typeof createInterface>) {
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

async function runWacliDoctor() {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI Doctor]");
  const result = await orchestrator.doctor();
  printWacliResult(result);
}

async function runWacliSearch(rl: ReturnType<typeof createInterface>) {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI Search Messages]");
  const query = await askRequired(rl, "Query");
  const chat = await ask(rl, "Chat ID/name filter (optional)");
  const limit = parseLimit(await ask(rl, "Limit [default 20]"), 20);

  const result = await orchestrator.searchMessages(query, chat || undefined, limit);
  printWacliResult(result);
}

async function runWacliChats(rl: ReturnType<typeof createInterface>) {
  // eslint-disable-next-line no-console
  console.log("\n[WACLI List Chats]");
  const query = await ask(rl, "Query (optional)");
  const limit = parseLimit(await ask(rl, "Limit [default 20]"), 20);

  const result = await orchestrator.listChats(query || undefined, limit);
  printWacliResult(result);
}

async function runManualSend(rl: ReturnType<typeof createInterface>) {
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
  rl: ReturnType<typeof createInterface>,
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

function parseLimit(raw: string, fallback: number): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function ask(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  return (await rl.question(`${label}: `)).trim();
}

async function askRequired(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  while (true) {
    const value = await ask(rl, label);
    if (value.length > 0) return value;
    // eslint-disable-next-line no-console
    console.log("Value is required.");
  }
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: boolean
): Promise<boolean> {
  const raw = (await ask(rl, label)).toLowerCase();
  if (!raw) return defaultValue;
  if (["y", "yes", "1", "true"].includes(raw)) return true;
  if (["n", "no", "0", "false"].includes(raw)) return false;
  return defaultValue;
}

function printBanner() {
  // eslint-disable-next-line no-console
  console.log("====================================");
  // eslint-disable-next-line no-console
  console.log("PropAI Interactive Terminal");
  // eslint-disable-next-line no-console
  console.log(`WACLI_DRY_RUN default: ${DEFAULT_DRY_RUN ? "true" : "false"}`);
  // eslint-disable-next-line no-console
  console.log("====================================\n");
}

function printMenu() {
  // eslint-disable-next-line no-console
  console.log("Menu");
  // eslint-disable-next-line no-console
  console.log("  1) Suite Agent Chat (multi-tool planner)");
  // eslint-disable-next-line no-console
  console.log("  2) Lead Orchestrator (intake + match + follow-up)");
  // eslint-disable-next-line no-console
  console.log("  3) WACLI Doctor");
  // eslint-disable-next-line no-console
  console.log("  4) WACLI Search Messages");
  // eslint-disable-next-line no-console
  console.log("  5) WACLI List Chats");
  // eslint-disable-next-line no-console
  console.log("  6) WACLI Send Manual Message");
  // eslint-disable-next-line no-console
  console.log("  7) Exit");
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
