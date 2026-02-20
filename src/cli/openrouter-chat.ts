import "dotenv/config";
import { generateOpenRouterText, isOpenRouterEnabled } from "../llm/openrouter.js";

async function main() {
  const { message, model } = parseArgs(process.argv.slice(2));
  if (!message) {
    // eslint-disable-next-line no-console
    console.error('Usage: npm run openrouter:chat -- "Your prompt" [--model openai/gpt-4o-mini]');
    process.exit(1);
  }

  if (!isOpenRouterEnabled()) {
    // eslint-disable-next-line no-console
    console.error("OPENROUTER_API_KEY is not set.");
    process.exit(1);
  }

  const output = await generateOpenRouterText(
    [
      {
        role: "system",
        content:
          "You are PropAI Live CLI copilot for a realtor. Reply clearly with direct practical guidance."
      },
      {
        role: "user",
        content: message
      }
    ],
    {
      model,
      temperature: 0.2
    }
  );

  // eslint-disable-next-line no-console
  console.log(output || "(No response)");
}

function parseArgs(args: string[]): { message: string; model?: string } {
  const messageParts = [...args];
  let model: string | undefined;

  const modelIndex = messageParts.findIndex((item) => item === "--model");
  if (modelIndex >= 0 && messageParts[modelIndex + 1]) {
    model = messageParts[modelIndex + 1];
    messageParts.splice(modelIndex, 2);
  }

  return {
    message: messageParts.join(" ").trim(),
    model
  };
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
