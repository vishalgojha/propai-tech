import "dotenv/config";
import { startRealtorWhatsappAgent } from "./agentic/whatsapp/agent-loop.js";
import { logger } from "./utils/logger.js";

async function main() {
  logger.info("Starting Evolution Real Estate WhatsApp Helper...");
  await startRealtorWhatsappAgent();
}

main().catch((err) => {
  logger.error("Fatal error", { err });
  process.exit(1);
});
