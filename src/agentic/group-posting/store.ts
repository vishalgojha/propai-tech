import { Pool } from "pg";
import type {
  GroupPostKind,
  GroupPostListFilter,
  GroupPostPriority,
  GroupPostQueueItem,
  GroupPostQueueSummary,
  GroupPostScheduleMode,
  GroupPostSource
} from "./types.js";

export type GroupPostCreateRecord = {
  kind: GroupPostKind;
  priority: GroupPostPriority;
  content: string;
  brokerName?: string;
  brokerContact?: string;
  tags: string[];
  targets: string[];
  pendingTargets: string[];
  scheduleMode: GroupPostScheduleMode;
  nextPostAtIso: string;
  remainingPosts: number | null;
  source: GroupPostSource;
  sourceRef?: string;
  idempotencyKey?: string;
};

type GroupPostRescheduleInput = {
  nextPostAtIso: string;
  remainingPosts: number | null;
  postedAtIso: string;
};

export interface GroupPostStore {
  enqueue(input: GroupPostCreateRecord): Promise<GroupPostQueueItem>;
  get(id: string): Promise<GroupPostQueueItem | null>;
  list(filter?: GroupPostListFilter): Promise<GroupPostQueueItem[]>;
  recoverStaleProcessing(staleBeforeIso: string): Promise<number>;
  reserveDue(nowIso: string, limit: number): Promise<GroupPostQueueItem[]>;
  markSent(id: string, postedAtIso: string): Promise<GroupPostQueueItem | null>;
  rescheduleAfterSend(id: string, input: GroupPostRescheduleInput): Promise<GroupPostQueueItem | null>;
  markFailed(id: string, error: string, pendingTargets?: string[]): Promise<GroupPostQueueItem | null>;
  requeue(id: string, nextPostAtIso: string): Promise<GroupPostQueueItem | null>;
  getSummary(): Promise<GroupPostQueueSummary>;
}

export function createGroupPostStore(databaseUrl?: string): GroupPostStore {
  const normalized = String(databaseUrl || "").trim();
  if (normalized) {
    return new PostgresGroupPostStore(normalized);
  }
  return new InMemoryGroupPostStore();
}

class InMemoryGroupPostStore implements GroupPostStore {
  private readonly items = new Map<string, GroupPostQueueItem>();
  private readonly idempotencyIndex = new Map<string, string>();

  async enqueue(input: GroupPostCreateRecord): Promise<GroupPostQueueItem> {
    if (input.idempotencyKey) {
      const existingId = this.idempotencyIndex.get(input.idempotencyKey);
      if (existingId) {
        const existing = this.items.get(existingId);
        if (existing) return cloneItem(existing);
      }
    }

    const nowIso = new Date().toISOString();
    const item: GroupPostQueueItem = {
      id: createQueueId(),
      kind: input.kind,
      priority: input.priority,
      content: input.content,
      brokerName: input.brokerName,
      brokerContact: input.brokerContact,
      tags: [...input.tags],
      targets: [...input.targets],
      pendingTargets: [...input.pendingTargets],
      status: "queued",
      scheduleMode: input.scheduleMode,
      nextPostAtIso: input.nextPostAtIso,
      remainingPosts: input.remainingPosts,
      source: input.source,
      sourceRef: input.sourceRef,
      idempotencyKey: input.idempotencyKey,
      attempts: 0,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    };
    this.items.set(item.id, cloneItem(item));
    if (item.idempotencyKey) {
      this.idempotencyIndex.set(item.idempotencyKey, item.id);
    }
    return cloneItem(item);
  }

  async get(id: string): Promise<GroupPostQueueItem | null> {
    const found = this.items.get(id);
    return found ? cloneItem(found) : null;
  }

  async list(filter: GroupPostListFilter = {}): Promise<GroupPostQueueItem[]> {
    const limit = normalizeLimit(filter.limit);
    const status = filter.status;

    return [...this.items.values()]
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
      .slice(0, limit)
      .map((item) => cloneItem(item));
  }

  async recoverStaleProcessing(staleBeforeIso: string): Promise<number> {
    const staleBeforeMs = Date.parse(staleBeforeIso);
    if (!Number.isFinite(staleBeforeMs)) return 0;

    let recovered = 0;
    const nowIso = new Date().toISOString();
    for (const item of this.items.values()) {
      if (item.status !== "processing") continue;
      if (Date.parse(item.updatedAtIso) > staleBeforeMs) continue;
      item.status = "queued";
      item.updatedAtIso = nowIso;
      item.lastError = "Recovered from stale processing lease.";
      this.items.set(item.id, cloneItem(item));
      recovered += 1;
    }
    return recovered;
  }

  async reserveDue(nowIso: string, limit: number): Promise<GroupPostQueueItem[]> {
    const safeLimit = normalizeLimit(limit);
    const nowMs = Date.parse(nowIso);
    const due = [...this.items.values()]
      .filter((item) => item.status === "queued" && Date.parse(item.nextPostAtIso) <= nowMs)
      .sort(compareDuePriority)
      .slice(0, safeLimit);

    const updatedAtIso = new Date().toISOString();
    for (const item of due) {
      item.status = "processing";
      item.updatedAtIso = updatedAtIso;
      this.items.set(item.id, cloneItem(item));
    }

    return due.map((item) => cloneItem(item));
  }

  async markSent(id: string, postedAtIso: string): Promise<GroupPostQueueItem | null> {
    const found = this.items.get(id);
    if (!found) return null;
    found.status = "sent";
    found.pendingTargets = [];
    found.attempts += 1;
    found.lastPostedAtIso = postedAtIso;
    found.lastError = undefined;
    found.updatedAtIso = new Date().toISOString();
    this.items.set(id, cloneItem(found));
    return cloneItem(found);
  }

  async rescheduleAfterSend(id: string, input: GroupPostRescheduleInput): Promise<GroupPostQueueItem | null> {
    const found = this.items.get(id);
    if (!found) return null;
    found.status = "queued";
    found.pendingTargets = [...found.targets];
    found.attempts += 1;
    found.nextPostAtIso = input.nextPostAtIso;
    found.remainingPosts = input.remainingPosts;
    found.lastPostedAtIso = input.postedAtIso;
    found.lastError = undefined;
    found.updatedAtIso = new Date().toISOString();
    this.items.set(id, cloneItem(found));
    return cloneItem(found);
  }

  async markFailed(id: string, error: string, pendingTargets?: string[]): Promise<GroupPostQueueItem | null> {
    const found = this.items.get(id);
    if (!found) return null;
    found.status = "failed";
    if (Array.isArray(pendingTargets) && pendingTargets.length > 0) {
      found.pendingTargets = normalizeStringList(pendingTargets);
    }
    found.attempts += 1;
    found.lastError = trimError(error);
    found.updatedAtIso = new Date().toISOString();
    this.items.set(id, cloneItem(found));
    return cloneItem(found);
  }

  async requeue(id: string, nextPostAtIso: string): Promise<GroupPostQueueItem | null> {
    const found = this.items.get(id);
    if (!found) return null;
    found.status = "queued";
    found.nextPostAtIso = nextPostAtIso;
    found.lastError = undefined;
    found.updatedAtIso = new Date().toISOString();
    this.items.set(id, cloneItem(found));
    return cloneItem(found);
  }

  async getSummary(): Promise<GroupPostQueueSummary> {
    const summary: GroupPostQueueSummary = {
      queued: 0,
      processing: 0,
      sent: 0,
      failed: 0
    };

    let nextDueAtMs: number | null = null;
    for (const item of this.items.values()) {
      summary[item.status] += 1;
      if (item.status === "queued") {
        const value = Date.parse(item.nextPostAtIso);
        if (Number.isFinite(value)) {
          nextDueAtMs = nextDueAtMs === null ? value : Math.min(nextDueAtMs, value);
        }
      }
    }
    if (nextDueAtMs !== null) {
      summary.nextDueAtIso = new Date(nextDueAtMs).toISOString();
    }
    return summary;
  }
}

class PostgresGroupPostStore implements GroupPostStore {
  private readonly pool: Pool;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async enqueue(input: GroupPostCreateRecord): Promise<GroupPostQueueItem> {
    await this.ensureInitialized();
    const id = createQueueId();

    const result = await this.pool.query<GroupPostRow>(
      `INSERT INTO group_post_queue (
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (idempotency_key)
      DO UPDATE SET updated_at = group_post_queue.updated_at
      RETURNING
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at`,
      [
        id,
        input.kind,
        input.priority,
        input.content,
        input.brokerName || null,
        input.brokerContact || null,
        JSON.stringify(input.tags),
        JSON.stringify(input.targets),
        JSON.stringify(input.pendingTargets),
        "queued",
        input.scheduleMode,
        input.nextPostAtIso,
        input.remainingPosts,
        input.source,
        input.sourceRef || null,
        input.idempotencyKey || null
      ]
    );

    return rowToItem(result.rows[0]);
  }

  async get(id: string): Promise<GroupPostQueueItem | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<GroupPostRow>(
      `SELECT
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at
      FROM group_post_queue
      WHERE id = $1`,
      [id]
    );
    if (!result.rows[0]) return null;
    return rowToItem(result.rows[0]);
  }

  async list(filter: GroupPostListFilter = {}): Promise<GroupPostQueueItem[]> {
    await this.ensureInitialized();
    const limit = normalizeLimit(filter.limit);
    if (filter.status) {
      const result = await this.pool.query<GroupPostRow>(
        `SELECT
          id,
          kind,
          priority,
          content,
          broker_name,
          broker_contact,
          tags,
          targets,
          pending_targets,
          status,
          schedule_mode,
          next_post_at,
          remaining_posts,
          source,
          source_ref,
          idempotency_key,
          attempts,
          last_error,
          last_posted_at,
          created_at,
          updated_at
        FROM group_post_queue
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT $2`,
        [filter.status, limit]
      );
      return result.rows.map((row) => rowToItem(row));
    }

    const result = await this.pool.query<GroupPostRow>(
      `SELECT
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at
      FROM group_post_queue
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => rowToItem(row));
  }

  async recoverStaleProcessing(staleBeforeIso: string): Promise<number> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ recovered: number | string }>(
      `WITH recovered_rows AS (
        UPDATE group_post_queue
        SET
          status = 'queued',
          last_error = 'Recovered from stale processing lease.',
          updated_at = NOW()
        WHERE status = 'processing' AND updated_at <= $1::timestamptz
        RETURNING id
      )
      SELECT COUNT(*) AS recovered FROM recovered_rows`,
      [staleBeforeIso]
    );
    return Number(result.rows[0]?.recovered || 0);
  }

  async reserveDue(nowIso: string, limit: number): Promise<GroupPostQueueItem[]> {
    await this.ensureInitialized();
    const safeLimit = normalizeLimit(limit);
    const result = await this.pool.query<GroupPostRow>(
      `WITH picked AS (
        SELECT id
        FROM group_post_queue
        WHERE status = 'queued' AND next_post_at <= $1::timestamptz
        ORDER BY
          CASE WHEN priority = 'high' THEN 0 ELSE 1 END,
          next_post_at ASC,
          created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE group_post_queue row
      SET status = 'processing', updated_at = NOW()
      FROM picked
      WHERE row.id = picked.id
      RETURNING
        row.id,
        row.kind,
        row.priority,
        row.content,
        row.broker_name,
        row.broker_contact,
        row.tags,
        row.targets,
        row.pending_targets,
        row.status,
        row.schedule_mode,
        row.next_post_at,
        row.remaining_posts,
        row.source,
        row.source_ref,
        row.idempotency_key,
        row.attempts,
        row.last_error,
        row.last_posted_at,
        row.created_at,
        row.updated_at`,
      [nowIso, safeLimit]
    );
    return result.rows.map((row) => rowToItem(row));
  }

  async markSent(id: string, postedAtIso: string): Promise<GroupPostQueueItem | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<GroupPostRow>(
      `UPDATE group_post_queue
      SET
        status = 'sent',
        pending_targets = '[]'::jsonb,
        attempts = attempts + 1,
        last_posted_at = $2::timestamptz,
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at`,
      [id, postedAtIso]
    );
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  async rescheduleAfterSend(id: string, input: GroupPostRescheduleInput): Promise<GroupPostQueueItem | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<GroupPostRow>(
      `UPDATE group_post_queue
      SET
        status = 'queued',
        pending_targets = targets,
        attempts = attempts + 1,
        next_post_at = $2::timestamptz,
        remaining_posts = $3,
        last_posted_at = $4::timestamptz,
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at`,
      [id, input.nextPostAtIso, input.remainingPosts, input.postedAtIso]
    );
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  async markFailed(id: string, error: string, pendingTargets?: string[]): Promise<GroupPostQueueItem | null> {
    await this.ensureInitialized();
    const normalizedPending = Array.isArray(pendingTargets)
      ? normalizeStringList(pendingTargets)
      : null;
    const result = await this.pool.query<GroupPostRow>(
      `UPDATE group_post_queue
      SET
        status = 'failed',
        pending_targets = CASE
          WHEN $3::jsonb IS NULL THEN pending_targets
          ELSE $3::jsonb
        END,
        attempts = attempts + 1,
        last_error = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at`,
      [id, trimError(error), normalizedPending ? JSON.stringify(normalizedPending) : null]
    );
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  async requeue(id: string, nextPostAtIso: string): Promise<GroupPostQueueItem | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<GroupPostRow>(
      `UPDATE group_post_queue
      SET
        status = 'queued',
        next_post_at = $2::timestamptz,
        pending_targets = CASE
          WHEN COALESCE(jsonb_array_length(pending_targets), 0) = 0 THEN targets
          ELSE pending_targets
        END,
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        kind,
        priority,
        content,
        broker_name,
        broker_contact,
        tags,
        targets,
        pending_targets,
        status,
        schedule_mode,
        next_post_at,
        remaining_posts,
        source,
        source_ref,
        idempotency_key,
        attempts,
        last_error,
        last_posted_at,
        created_at,
        updated_at`,
      [id, nextPostAtIso]
    );
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  async getSummary(): Promise<GroupPostQueueSummary> {
    await this.ensureInitialized();
    const countsResult = await this.pool.query<{
      status: string;
      count: number | string;
    }>(
      `SELECT status, COUNT(*) AS count
      FROM group_post_queue
      GROUP BY status`
    );

    const nextDueResult = await this.pool.query<{ next_due_at: Date | string | null }>(
      `SELECT MIN(next_post_at) AS next_due_at
      FROM group_post_queue
      WHERE status = 'queued'`
    );

    const summary: GroupPostQueueSummary = {
      queued: 0,
      processing: 0,
      sent: 0,
      failed: 0
    };
    for (const row of countsResult.rows) {
      const key = normalizeStatus(row.status);
      summary[key] = Number(row.count) || 0;
    }

    const nextDue = nextDueResult.rows[0]?.next_due_at;
    if (nextDue) {
      summary.nextDueAtIso = asIso(nextDue);
    }
    return summary;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS group_post_queue (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        priority TEXT NOT NULL,
        content TEXT NOT NULL,
        broker_name TEXT NULL,
        broker_contact TEXT NULL,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        targets JSONB NOT NULL DEFAULT '[]'::jsonb,
        pending_targets JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL,
        schedule_mode TEXT NOT NULL,
        next_post_at TIMESTAMPTZ NOT NULL,
        remaining_posts INTEGER NULL,
        source TEXT NOT NULL,
        source_ref TEXT NULL,
        idempotency_key TEXT NULL UNIQUE,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        last_posted_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      ALTER TABLE group_post_queue
      ADD COLUMN IF NOT EXISTS pending_targets JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    await this.pool.query(`
      ALTER TABLE group_post_queue
      ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL
    `);

    await this.pool.query(`
      UPDATE group_post_queue
      SET pending_targets = targets
      WHERE
        status IN ('queued', 'processing', 'failed') AND
        COALESCE(jsonb_array_length(pending_targets), 0) = 0
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_group_post_queue_due
      ON group_post_queue (status, next_post_at)
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_group_post_queue_idempotency_key
      ON group_post_queue (idempotency_key)
    `);

    this.initialized = true;
  }
}

type GroupPostRow = {
  id: string;
  kind: string;
  priority: string;
  content: string;
  broker_name: string | null;
  broker_contact: string | null;
  tags: unknown;
  targets: unknown;
  pending_targets: unknown;
  status: string;
  schedule_mode: string;
  next_post_at: Date | string;
  remaining_posts: number | null;
  source: string;
  source_ref: string | null;
  idempotency_key: string | null;
  attempts: number;
  last_error: string | null;
  last_posted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowToItem(row: GroupPostRow): GroupPostQueueItem {
  const status = normalizeStatus(row.status);
  const targets = normalizeStringList(row.targets);
  const pendingTargets = normalizeStringList(row.pending_targets);
  return {
    id: row.id,
    kind: normalizeKind(row.kind),
    priority: normalizePriority(row.priority),
    content: row.content,
    brokerName: row.broker_name || undefined,
    brokerContact: row.broker_contact || undefined,
    tags: normalizeStringList(row.tags),
    targets,
    pendingTargets: pendingTargets.length > 0 ? pendingTargets : status === "sent" ? [] : [...targets],
    status,
    scheduleMode: normalizeScheduleMode(row.schedule_mode),
    nextPostAtIso: asIso(row.next_post_at),
    remainingPosts: row.remaining_posts === null ? null : Math.max(1, Math.floor(row.remaining_posts)),
    source: normalizeSource(row.source),
    sourceRef: row.source_ref || undefined,
    idempotencyKey: row.idempotency_key || undefined,
    attempts: Math.max(0, Number(row.attempts) || 0),
    lastError: row.last_error || undefined,
    lastPostedAtIso: row.last_posted_at ? asIso(row.last_posted_at) : undefined,
    createdAtIso: asIso(row.created_at),
    updatedAtIso: asIso(row.updated_at)
  };
}

function createQueueId(): string {
  return `gp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function compareDuePriority(a: GroupPostQueueItem, b: GroupPostQueueItem): number {
  if (a.priority !== b.priority) {
    return a.priority === "high" ? -1 : 1;
  }
  const nextDiff = Date.parse(a.nextPostAtIso) - Date.parse(b.nextPostAtIso);
  if (nextDiff !== 0) return nextDiff;
  return Date.parse(a.createdAtIso) - Date.parse(b.createdAtIso);
}

function normalizeKind(value: string): GroupPostKind {
  return value === "requirement" ? "requirement" : "listing";
}

function normalizePriority(value: string): GroupPostPriority {
  return value === "high" ? "high" : "normal";
}

function normalizeScheduleMode(value: string): GroupPostScheduleMode {
  if (value === "daily" || value === "weekly") return value;
  return "once";
}

function normalizeSource(value: string): GroupPostSource {
  if (value === "chat" || value === "whatsapp") return value;
  return "api";
}

function normalizeStatus(value: string): GroupPostQueueItem["status"] {
  if (value === "processing" || value === "sent" || value === "failed") {
    return value;
  }
  return "queued";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    )
  );
}

function normalizeLimit(limit: number | undefined): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function trimError(error: string): string {
  return String(error || "").trim().slice(0, 500) || "Unknown dispatch error";
}

function cloneItem(item: GroupPostQueueItem): GroupPostQueueItem {
  return JSON.parse(JSON.stringify(item)) as GroupPostQueueItem;
}

function asIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}
