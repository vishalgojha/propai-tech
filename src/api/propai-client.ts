import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";

export async function sendToPropAI(payload: any) {
  const url = process.env.PROPAI_SEND_URL;
  if (!url) throw new Error("PROPAI_SEND_URL is not set");
  return callWithRetry(url, payload);
}

export async function callFunction(url: string, body: any) {
  return callWithRetry(url, body);
}

async function callWithRetry(url: string, body: any) {
  const apiKey = process.env.PROPAI_API_KEY;
  if (!apiKey) throw new Error("PROPAI_API_KEY is not set");

  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: apiKey
        },
        body: JSON.stringify(body)
      });

      const text = await res.text();
      const json = safeJson(text);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      return json ?? text;
    } catch (err) {
      lastErr = err;
      logger.error("Function call failed", { url, attempt, err });
      if (attempt < maxAttempts) {
        await sleep(300 * attempt);
      }
    }
  }

  throw lastErr;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
