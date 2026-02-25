import { WacliTool } from "../tools/wacli-tool.js";
import { inferGroupPostKind, inferGroupPostPriority, inferGroupPostTags, renderGroupPostMessage } from "./parser.js";
import { createGroupPostStore, type GroupPostStore } from "./store.js";
import type {
  GroupPostDispatchOptions,
  GroupPostDispatchReport,
  GroupPostIntakeInput,
  GroupPostListFilter,
  GroupPostQueueItem,
  GroupPostQueueSummary,
  GroupPostScheduleMode,
  GroupPostSchedulerStatus
} from "./types.js";

export type GroupPostSenderResult = {
  ok: boolean;
  error?: string;
};

export type GroupPostSender = {
  sendText(to: string, message: string): Promise<GroupPostSenderResult>;
};

export type GroupPostSenderFactory = (dryRun: boolean) => GroupPostSender;

export type GroupPostingServiceOptions = {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  processingLeaseMs: number;
  defaultTargets: string[];
  schedulerDryRun: boolean;
  senderFactory?: GroupPostSenderFactory;
};

export type GroupPostingServiceStatus = {
  scheduler: GroupPostSchedulerStatus;
  queue: GroupPostQueueSummary;
};

type ServiceInitOptions = GroupPostingServiceOptions & {
  databaseUrl?: string;
};

export function createGroupPostingService(input: ServiceInitOptions): GroupPostingService {
  const store = createGroupPostStore(input.databaseUrl);
  return new GroupPostingService(store, input);
}

export class GroupPostingService {
  private readonly store: GroupPostStore;
  private readonly options: GroupPostingServiceOptions;
  private readonly defaultTargets: string[];
  private readonly senderFactory: GroupPostSenderFactory;
  private intervalHandle: NodeJS.Timeout | null = null;
  private dispatchRunning = false;
  private lastDispatch: GroupPostDispatchReport | undefined;

  constructor(store: GroupPostStore, options: GroupPostingServiceOptions) {
    this.store = store;
    this.options = {
      enabled: options.enabled,
      intervalMs: normalizeInterval(options.intervalMs),
      batchSize: normalizeBatchSize(options.batchSize),
      processingLeaseMs: normalizeProcessingLease(options.processingLeaseMs),
      defaultTargets: normalizeTargets(options.defaultTargets),
      schedulerDryRun: Boolean(options.schedulerDryRun),
      senderFactory: options.senderFactory || createDefaultSenderFactory()
    };
    this.defaultTargets = this.options.defaultTargets;
    this.senderFactory = this.options.senderFactory || createDefaultSenderFactory();
  }

  start(): void {
    if (!this.options.enabled) return;
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(() => {
      void this.runDue({
        trigger: "scheduled"
      });
    }, this.options.intervalMs);
    if (typeof this.intervalHandle.unref === "function") {
      this.intervalHandle.unref();
    }
  }

  stop(): void {
    if (!this.intervalHandle) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  async intake(input: GroupPostIntakeInput): Promise<GroupPostQueueItem> {
    const content = String(input.content || "").trim();
    if (!content) {
      throw new Error("content_required");
    }

    const now = new Date();
    const kind = normalizeKind(input.kind, content);
    const priority = normalizePriority(input.priority, content);
    const scheduleMode = normalizeScheduleMode(input.scheduleMode);
    const firstPostAtIso = normalizeIso(input.firstPostAtIso, now.toISOString());
    const effectiveStartAtIso = Date.parse(firstPostAtIso) < now.getTime()
      ? now.toISOString()
      : firstPostAtIso;
    const remainingPosts = resolveRemainingPosts(scheduleMode, input.repeatCount);
    const targets = normalizeTargets(input.targets ?? this.defaultTargets);
    const idempotencyKey = resolveIdempotencyKey(input);

    const created = await this.store.enqueue({
      kind,
      priority,
      content,
      brokerName: normalizeOptionalText(input.brokerName),
      brokerContact: normalizeOptionalText(input.brokerContact),
      tags: normalizeTags(input.tags, content),
      targets,
      pendingTargets: [...targets],
      scheduleMode,
      nextPostAtIso: effectiveStartAtIso,
      remainingPosts,
      source: normalizeSource(input.source),
      sourceRef: normalizeOptionalText(input.sourceRef),
      idempotencyKey
    });

    return created;
  }

  async listQueue(filter: GroupPostListFilter = {}): Promise<GroupPostQueueItem[]> {
    return this.store.list(filter);
  }

  async requeue(id: string, nextPostAtIso?: string): Promise<GroupPostQueueItem | null> {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const fallbackIso = new Date().toISOString();
    const nextIso = normalizeIso(nextPostAtIso, fallbackIso);
    return this.store.requeue(normalizedId, nextIso);
  }

  async getStatus(): Promise<GroupPostingServiceStatus> {
    const queue = await this.store.getSummary();
    return {
      scheduler: this.getSchedulerStatus(),
      queue
    };
  }

  getSchedulerStatus(): GroupPostSchedulerStatus {
    return {
      enabled: this.options.enabled,
      running: this.dispatchRunning,
      intervalMs: this.options.intervalMs,
      batchSize: this.options.batchSize,
      processingLeaseMs: this.options.processingLeaseMs,
      defaultTargets: [...this.defaultTargets],
      schedulerDryRun: this.options.schedulerDryRun,
      lastDispatch: this.lastDispatch
    };
  }

  async runDue(options: GroupPostDispatchOptions = {}): Promise<GroupPostDispatchReport> {
    const startedAtIso = new Date().toISOString();
    const trigger = options.trigger || "manual";
    const dryRun = options.dryRun ?? this.options.schedulerDryRun;

    if (this.dispatchRunning) {
      const skipped: GroupPostDispatchReport = {
        trigger,
        startedAtIso,
        completedAtIso: new Date().toISOString(),
        dryRun,
        picked: 0,
        sent: 0,
        rescheduled: 0,
        failed: 0,
        items: [],
        skipped: true,
        reason: "dispatch_in_progress"
      };
      return skipped;
    }

    this.dispatchRunning = true;
    try {
      const nowIso = normalizeIso(options.nowIso, startedAtIso);
      const staleBeforeIso = new Date(Date.parse(nowIso) - this.options.processingLeaseMs).toISOString();
      const recovered = await this.store.recoverStaleProcessing(staleBeforeIso);
      const limit = normalizeBatchSize(options.limit ?? this.options.batchSize);
      const due = await this.store.reserveDue(nowIso, limit);
      const report: GroupPostDispatchReport = {
        trigger,
        startedAtIso,
        completedAtIso: startedAtIso,
        dryRun,
        picked: due.length,
        sent: 0,
        rescheduled: 0,
        failed: 0,
        items: []
      };

      if (due.length === 0) {
        if (recovered > 0) {
          report.reason = `Recovered ${recovered} stale processing items.`;
        }
        report.completedAtIso = new Date().toISOString();
        this.lastDispatch = report;
        return report;
      }

      const sender = this.senderFactory(dryRun);
      for (const item of due) {
        try {
          const targets = normalizeTargets(
            item.pendingTargets.length > 0
              ? item.pendingTargets
              : item.targets.length > 0
                ? item.targets
                : this.defaultTargets
          );
          if (targets.length === 0) {
            await this.store.markFailed(item.id, "No target groups configured.");
            report.failed += 1;
            report.items.push({
              id: item.id,
              status: "failed",
              targetsAttempted: [],
              summary: "No target groups configured."
            });
            continue;
          }

          const message = renderGroupPostMessage({
            kind: item.kind,
            content: item.content,
            brokerName: item.brokerName,
            tags: item.tags
          });

          const failedTargets: string[] = [];
          for (const target of targets) {
            const result = await sender.sendText(target, message);
            if (!result.ok) {
              failedTargets.push(target);
            }
          }

          if (failedTargets.length > 0) {
            const summary =
              failedTargets.length === targets.length
                ? "Dispatch failed for all target groups."
                : "Dispatch partially failed for some target groups.";
            await this.store.markFailed(item.id, summary, failedTargets);
            report.failed += 1;
            report.items.push({
              id: item.id,
              status: "failed",
              targetsAttempted: targets,
              summary
            });
            continue;
          }

          const postedAtIso = new Date().toISOString();
          const remainingAfterSend = decrementRemainingPosts(item.remainingPosts);
          const shouldRepeat =
            item.scheduleMode !== "once" && (remainingAfterSend === null || remainingAfterSend > 0);

          if (shouldRepeat) {
            const nextPostAtIso = advanceSchedule(item.nextPostAtIso, nowIso, item.scheduleMode);
            await this.store.rescheduleAfterSend(item.id, {
              nextPostAtIso,
              remainingPosts: remainingAfterSend,
              postedAtIso
            });
            report.rescheduled += 1;
            report.items.push({
              id: item.id,
              status: "rescheduled",
              targetsAttempted: targets,
              summary: `Posted successfully and rescheduled for ${nextPostAtIso}.`
            });
            continue;
          }

          await this.store.markSent(item.id, postedAtIso);
          report.sent += 1;
          report.items.push({
            id: item.id,
            status: "sent",
            targetsAttempted: targets,
            summary: "Posted successfully."
          });
        } catch (error) {
          const message = trimDispatchError(error instanceof Error ? error.message : String(error));
          await this.store.markFailed(
            item.id,
            `Dispatch failed: ${message}`,
            item.pendingTargets.length > 0 ? item.pendingTargets : item.targets
          );
          report.failed += 1;
          report.items.push({
            id: item.id,
            status: "failed",
            targetsAttempted: item.pendingTargets.length > 0 ? item.pendingTargets : item.targets,
            summary: `Dispatch failed: ${message}`
          });
        }
      }

      if (recovered > 0) {
        report.reason = `Recovered ${recovered} stale processing items.`;
      }
      report.completedAtIso = new Date().toISOString();
      this.lastDispatch = report;
      return report;
    } finally {
      this.dispatchRunning = false;
    }
  }
}

function normalizeKind(kind: GroupPostIntakeInput["kind"], content: string): GroupPostQueueItem["kind"] {
  if (kind === "listing" || kind === "requirement") return kind;
  return inferGroupPostKind(content);
}

function normalizePriority(
  priority: GroupPostIntakeInput["priority"],
  content: string
): GroupPostQueueItem["priority"] {
  if (priority === "high" || priority === "normal") return priority;
  return inferGroupPostPriority(content);
}

function normalizeScheduleMode(
  mode: GroupPostIntakeInput["scheduleMode"]
): GroupPostScheduleMode {
  if (mode === "daily" || mode === "weekly") return mode;
  return "once";
}

function resolveRemainingPosts(mode: GroupPostScheduleMode, repeatCount: number | undefined): number | null {
  if (mode === "once") return 1;
  const parsed = Number(repeatCount);
  if (Number.isFinite(parsed)) {
    return Math.max(1, Math.min(365, Math.floor(parsed)));
  }
  return 7;
}

function decrementRemainingPosts(remainingPosts: number | null): number | null {
  if (remainingPosts === null) return null;
  return Math.max(0, Math.floor(remainingPosts) - 1);
}

function advanceSchedule(
  previousNextPostAtIso: string,
  nowIso: string,
  mode: GroupPostScheduleMode
): string {
  const previousMs = Date.parse(previousNextPostAtIso);
  const nowMs = Date.parse(nowIso);
  const base = Number.isFinite(previousMs) ? Math.max(previousMs, nowMs) : nowMs;
  const next = new Date(base);
  if (mode === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

function normalizeBatchSize(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function normalizeInterval(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 15 * 60 * 1000;
  return Math.max(10_000, Math.floor(parsed));
}

function normalizeProcessingLease(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10 * 60 * 1000;
  return Math.max(30_000, Math.floor(parsed));
}

function normalizeSource(input: GroupPostIntakeInput["source"]): GroupPostQueueItem["source"] {
  if (input === "chat" || input === "whatsapp") return input;
  return "api";
}

function resolveIdempotencyKey(input: GroupPostIntakeInput): string | undefined {
  const explicit = normalizeOptionalText(input.idempotencyKey);
  if (explicit) return explicit;

  const source = normalizeSource(input.source);
  const sourceRef = normalizeOptionalText(input.sourceRef);
  if (!sourceRef) return undefined;
  return `${source}:${sourceRef}`;
}

function normalizeIso(value: string | undefined, fallbackIso: string): string {
  const raw = String(value || "").trim();
  if (!raw) return fallbackIso;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return fallbackIso;
  return new Date(parsed).toISOString();
}

function normalizeTargets(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    )
  );
}

function normalizeTags(input: string[] | undefined, content: string): string[] {
  const provided = Array.isArray(input) ? input : [];
  const fallback = inferGroupPostTags(content);
  return Array.from(
    new Set(
      [...provided, ...fallback]
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter((tag) => /^[a-z0-9_]{2,40}$/.test(tag))
    )
  );
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const text = String(value || "").trim();
  return text.length > 0 ? text : undefined;
}

function trimDispatchError(value: string): string {
  return String(value || "").trim().slice(0, 300) || "delivery_failed";
}

function createDefaultSenderFactory(): GroupPostSenderFactory {
  return (dryRun: boolean) => {
    const wacli = new WacliTool({ dryRun });
    return {
      async sendText(to: string, message: string): Promise<GroupPostSenderResult> {
        const result = await wacli.sendText(to, message);
        return {
          ok: result.ok,
          error: result.ok ? undefined : trimDispatchError(result.stderr || result.stdout || "send_failed")
        };
      }
    };
  };
}
