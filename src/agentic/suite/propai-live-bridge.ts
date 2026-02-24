import type { PropaiLiveAdapter, PropaiLivePublishRequest, PropaiLivePublishResult } from "./propai-live-adapter.js";

type PublishPortal = "99acres" | "magicbricks";

type PropaiLiveBridgeConfig = {
  postUrl?: string;
  postUrl99Acres?: string;
  postUrlMagicBricks?: string;
  apiKey?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
};

export class PropaiLiveBridge implements PropaiLiveAdapter {
  private readonly config: PropaiLiveBridgeConfig;

  constructor(config?: PropaiLiveBridgeConfig) {
    const defaultPostUrl = process.env.PROPAI_LIVE_POST_URL;
    this.config = config || {
      postUrl: defaultPostUrl,
      postUrl99Acres: process.env.PROPAI_LIVE_99ACRES_POST_URL || defaultPostUrl,
      postUrlMagicBricks: process.env.PROPAI_LIVE_MAGICBRICKS_POST_URL || defaultPostUrl,
      apiKey: process.env.PROPAI_LIVE_API_KEY,
      timeoutMs: Number(process.env.PROPAI_LIVE_TIMEOUT_MS || 8000),
      maxRetries: Number(process.env.PROPAI_LIVE_MAX_RETRIES || 2),
      retryBackoffMs: Number(process.env.PROPAI_LIVE_RETRY_BACKOFF_MS || 300)
    };
  }

  async publishTo99Acres(input: PropaiLivePublishRequest): Promise<PropaiLivePublishResult> {
    return this.publishToPortal(input, "99acres");
  }

  async publishToMagicBricks(input: PropaiLivePublishRequest): Promise<PropaiLivePublishResult> {
    return this.publishToPortal(input, "magicbricks");
  }

  private async publishToPortal(
    input: PropaiLivePublishRequest,
    portal: PublishPortal
  ): Promise<PropaiLivePublishResult> {
    const postUrl = this.resolvePostUrl(portal);
    const envHint = this.portalEnvHint(portal);

    if (input.dryRun) {
      return {
        ok: true,
        status: "simulated",
        summary: `Dry run enabled. Simulated publish to ${portal} via Propai Live.`,
        externalListingId: `SIM-${Date.now()}`
      };
    }

    if (!postUrl) {
      return {
        ok: true,
        status: "simulated",
        summary: `${envHint} is not configured. Used local mock publish fallback for ${portal}.`,
        externalListingId: `MOCK-${Date.now()}`
      };
    }

    let lastErrorMessage = "Unknown bridge error";
    const totalAttempts = this.config.maxRetries + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(postUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {})
          },
          body: JSON.stringify({
            portal,
            listing: input.draft
          })
        }, this.config.timeoutMs);

        const raw = await safeReadJson(response);
        if (!response.ok) {
          if (shouldRetryStatus(response.status) && attempt < totalAttempts) {
            await sleep(this.config.retryBackoffMs * attempt);
            continue;
          }
          return {
            ok: false,
            status: "failed",
            summary: `Propai Live publish failed with HTTP ${response.status} after ${attempt} attempt(s).`,
            raw
          };
        }

        const externalListingId = extractExternalListingId(raw);
        return {
          ok: true,
          status: "posted",
          summary: `Published to ${portal} via Propai Live on attempt ${attempt}.`,
          externalListingId,
          raw
        };
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : "Unknown bridge error";
        if (attempt < totalAttempts) {
          await sleep(this.config.retryBackoffMs * attempt);
          continue;
        }
      }
    }

    return {
      ok: false,
      status: "failed",
      summary: `Propai Live publish request failed after ${totalAttempts} attempt(s): ${lastErrorMessage}.`
    };
  }

  private resolvePostUrl(portal: PublishPortal): string | undefined {
    if (portal === "99acres") {
      return this.config.postUrl99Acres || this.config.postUrl;
    }
    return this.config.postUrlMagicBricks || this.config.postUrl;
  }

  private portalEnvHint(portal: PublishPortal): string {
    if (portal === "99acres") {
      return "PROPAI_LIVE_99ACRES_POST_URL or PROPAI_LIVE_POST_URL";
    }
    return "PROPAI_LIVE_MAGICBRICKS_POST_URL or PROPAI_LIVE_POST_URL";
  }
}

export function getPropaiLiveAdapter(): PropaiLiveAdapter {
  return new PropaiLiveBridge();
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractExternalListingId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const payload = raw as Record<string, unknown>;
  const listingId = payload.listingId;
  if (typeof listingId === "string" && listingId.length > 0) {
    return listingId;
  }
  const id = payload.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  return undefined;
}
