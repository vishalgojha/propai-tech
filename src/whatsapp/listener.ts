import { create } from "@wppconnect-team/wppconnect";
import { handleIncomingMessage } from "./message-handler.js";
import { logger } from "../utils/logger.js";

export async function startListener() {
  const session = process.env.WPP_SESSION_NAME || "real-estate-agent";

  const client = await create({
    session,
    catchQR: (base64Qr, asciiQR) => {
      logger.info("Scan QR to log in", { asciiQR });
    },
    statusFind: (statusSession, sessionInfo) => {
      logger.info("WPP status", { statusSession, sessionInfo });
    },
    logQR: true
  });

  client.onMessage(async (message) => {
    try {
      await handleIncomingMessage(message);
    } catch (err) {
      logger.error("Message handling failed", { err, id: message?.id });
    }
  });

  logger.info("Listener ready");
}
