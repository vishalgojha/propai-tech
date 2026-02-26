import { createRequire } from "node:module";
import type { RealtorSuiteSessionManager } from "./session-manager.js";

const require = createRequire(import.meta.url);

type ApprovePayload = {
  sessionId: string;
  actionId?: string;
  all?: boolean;
};

type SessionApproveResponse = Awaited<ReturnType<RealtorSuiteSessionManager["approve"]>>;

export type QueueExecutionMeta = {
  enabled: boolean;
  name?: string;
  jobId?: string;
  attempts?: number;
  reason?: string;
};

export type QueueRuntimeStatus = {
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

export class SuiteExecutionQueue {
  private readonly sessionManager: RealtorSuiteSessionManager;
  private readonly enabled: boolean;
  private readonly redisUrl: string;
  private readonly queueName: string;
  private readonly attempts: number;
  private readonly backoffMs: number;
  private readonly concurrency: number;
  private readonly timeoutMs: number;

  private ready = false;
  private startPromise: Promise<boolean> | null = null;
  private queue: any = null;
  private worker: any = null;
  private queueEvents: any = null;
  private warned = false;
  private unavailableReason: string | undefined = "queue_not_ready";

  constructor(sessionManager: RealtorSuiteSessionManager) {
    this.sessionManager = sessionManager;
    this.enabled = parseBool(process.env.PROPAI_QUEUE_ENABLED, false);
    this.redisUrl = String(process.env.REDIS_URL || "").trim();
    this.queueName = String(process.env.PROPAI_QUEUE_NAME || "propai-session-execution");
    this.attempts = Math.max(1, Number(process.env.PROPAI_QUEUE_ATTEMPTS || 3));
    this.backoffMs = Math.max(100, Number(process.env.PROPAI_QUEUE_BACKOFF_MS || 1000));
    this.concurrency = Math.max(1, Number(process.env.PROPAI_QUEUE_CONCURRENCY || 2));
    this.timeoutMs = Math.max(1000, Number(process.env.PROPAI_QUEUE_TIMEOUT_MS || 45000));
  }

  async executeApprove(payload: ApprovePayload): Promise<{
    result: SessionApproveResponse;
    queue: QueueExecutionMeta;
  }> {
    const ready = await this.ensureReady();
    if (!ready) {
      const result = await this.sessionManager.approve(payload.sessionId, {
        actionId: payload.actionId,
        all: payload.all
      });
      return {
        result,
        queue: {
          enabled: false,
          reason: this.enabled ? "queue_unavailable_fallback_direct" : "queue_disabled"
        }
      };
    }

    const job = await this.queue.add(
      "session.approve",
      {
        sessionId: payload.sessionId,
        actionId: payload.actionId || null,
        all: Boolean(payload.all)
      },
      {
        attempts: this.attempts,
        backoff: { type: "exponential", delay: this.backoffMs },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400, count: 1000 }
      }
    );

    const result = (await job.waitUntilFinished(this.queueEvents, this.timeoutMs)) as SessionApproveResponse;
    return {
      result,
      queue: {
        enabled: true,
        name: this.queueName,
        jobId: String(job.id || ""),
        attempts: this.attempts
      }
    };
  }

  getRuntimeStatus(): QueueRuntimeStatus {
    return {
      enabled: this.enabled,
      ready: this.ready,
      redisConfigured: this.redisUrl.length > 0,
      queueName: this.queueName,
      attempts: this.attempts,
      backoffMs: this.backoffMs,
      concurrency: this.concurrency,
      timeoutMs: this.timeoutMs,
      reason: this.ready ? undefined : this.unavailableReason || (this.enabled ? "queue_not_ready" : "queue_disabled")
    };
  }

  private async ensureReady(): Promise<boolean> {
    if (!this.enabled) {
      this.unavailableReason = "queue_disabled";
      return false;
    }
    if (this.ready) {
      this.unavailableReason = undefined;
      return true;
    }
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start();
    const ok = await this.startPromise;
    this.startPromise = null;
    return ok;
  }

  private async start(): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.redisUrl) {
      this.unavailableReason = "missing_redis_url";
      this.warnOnce("PROPAI_QUEUE_ENABLED=true but REDIS_URL is missing; falling back to direct execution.");
      return false;
    }

    const connection = parseRedisConnection(this.redisUrl);
    if (!connection) {
      this.unavailableReason = "invalid_redis_url";
      this.warnOnce("Invalid REDIS_URL for PROPAI queue; falling back to direct execution.");
      return false;
    }

    try {
      const moduleName = "bullmq";
      const bullmq = require(moduleName);
      const Queue = bullmq.Queue;
      const Worker = bullmq.Worker;
      const QueueEvents = bullmq.QueueEvents;
      if (!Queue || !Worker || !QueueEvents) {
        this.unavailableReason = "bullmq_incomplete";
        this.warnOnce("BullMQ module is incomplete; falling back to direct execution.");
        return false;
      }

      this.queue = new Queue(this.queueName, { connection });
      this.queueEvents = new QueueEvents(this.queueName, { connection });
      await this.queueEvents.waitUntilReady();

      this.worker = new Worker(
        this.queueName,
        async (job: { data: ApprovePayload }) => this.processJob(job.data),
        {
          connection,
          concurrency: this.concurrency
        }
      );

      this.worker.on("failed", (job: { id?: string; name?: string }, error: Error) => {
        // eslint-disable-next-line no-console
        console.warn(
          `propai queue job failed id=${job?.id || "?"} name=${job?.name || "?"} error=${error?.message || error}`
        );
      });

      const shutdown = async () => {
        try {
          if (this.worker) await this.worker.close();
          if (this.queueEvents) await this.queueEvents.close();
          if (this.queue) await this.queue.close();
        } catch {
          // ignore shutdown errors
        }
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      process.once("beforeExit", shutdown);

      this.ready = true;
      this.unavailableReason = undefined;
      return true;
    } catch (error) {
      const message = String((error as Error)?.message || error || "");
      if (/Cannot find module/i.test(message) && message.includes("bullmq")) {
        this.unavailableReason = "bullmq_not_installed";
        this.warnOnce("BullMQ is not installed; falling back to direct execution.");
      } else {
        this.unavailableReason = "queue_init_failed";
        this.warnOnce(`Queue init failed; falling back to direct execution. reason=${message}`);
      }
      return false;
    }
  }

  private async processJob(payload: ApprovePayload): Promise<SessionApproveResponse> {
    return this.sessionManager.approve(payload.sessionId, {
      actionId: payload.actionId,
      all: payload.all
    });
  }

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    // eslint-disable-next-line no-console
    console.warn(message);
  }
}

export function createSuiteExecutionQueue(sessionManager: RealtorSuiteSessionManager): SuiteExecutionQueue {
  return new SuiteExecutionQueue(sessionManager);
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseRedisConnection(redisUrl: string): Record<string, unknown> | null {
  try {
    const url = new URL(redisUrl);
    const out: Record<string, unknown> = {
      host: url.hostname,
      port: Number(url.port || 6379)
    };
    if (url.username) out.username = decodeURIComponent(url.username);
    if (url.password) out.password = decodeURIComponent(url.password);
    const dbRaw = String(url.pathname || "").replace(/^\//, "");
    if (dbRaw.length > 0) out.db = Number(dbRaw);
    if (url.protocol === "rediss:") out.tls = {};
    return out;
  } catch {
    return null;
  }
}
