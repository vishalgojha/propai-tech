export type GroupPostKind = "listing" | "requirement";

export type GroupPostPriority = "normal" | "high";

export type GroupPostScheduleMode = "once" | "daily" | "weekly";

export type GroupPostStatus = "queued" | "processing" | "sent" | "failed";

export type GroupPostSource = "api" | "chat" | "whatsapp";

export type GroupPostQueueItem = {
  id: string;
  kind: GroupPostKind;
  priority: GroupPostPriority;
  content: string;
  brokerName?: string;
  brokerContact?: string;
  tags: string[];
  targets: string[];
  pendingTargets: string[];
  status: GroupPostStatus;
  scheduleMode: GroupPostScheduleMode;
  nextPostAtIso: string;
  remainingPosts: number | null;
  source: GroupPostSource;
  sourceRef?: string;
  idempotencyKey?: string;
  attempts: number;
  lastError?: string;
  lastPostedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type GroupPostIntakeInput = {
  content: string;
  kind?: GroupPostKind;
  priority?: GroupPostPriority;
  brokerName?: string;
  brokerContact?: string;
  tags?: string[];
  targets?: string[];
  scheduleMode?: GroupPostScheduleMode;
  firstPostAtIso?: string;
  repeatCount?: number;
  source?: GroupPostSource;
  sourceRef?: string;
  idempotencyKey?: string;
};

export type GroupPostListFilter = {
  status?: GroupPostStatus;
  limit?: number;
};

export type GroupPostDispatchOptions = {
  limit?: number;
  nowIso?: string;
  dryRun?: boolean;
  trigger?: "manual" | "scheduled";
};

export type GroupPostDispatchItemResult = {
  id: string;
  status: "sent" | "rescheduled" | "failed";
  targetsAttempted: string[];
  summary: string;
};

export type GroupPostDispatchReport = {
  trigger: "manual" | "scheduled";
  startedAtIso: string;
  completedAtIso: string;
  dryRun: boolean;
  picked: number;
  sent: number;
  rescheduled: number;
  failed: number;
  items: GroupPostDispatchItemResult[];
  skipped?: boolean;
  reason?: string;
};

export type GroupPostQueueSummary = {
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  nextDueAtIso?: string;
};

export type GroupPostSchedulerStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  batchSize: number;
  processingLeaseMs: number;
  defaultTargets: string[];
  schedulerDryRun: boolean;
  lastDispatch?: GroupPostDispatchReport;
};
