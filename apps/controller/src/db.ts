import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  DisplayStatus,
  FaultKind,
  FaultRecord,
  FaultTarget,
  RunRecord,
  TimelineEvent,
  ToolAttempt,
} from "@contracts";

type SqlRow = Record<string, string | number | null>;

const defaultDatabasePath = resolve(process.cwd(), ".data/break-my-agent.sqlite");

function now() {
  return new Date().toISOString();
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapRun(row: SqlRow): RunRecord {
  return {
    invocationId: String(row.invocation_id),
    clientRequestId: String(row.client_request_id),
    parentInvocationId: row.parent_invocation_id ? String(row.parent_invocation_id) : null,
    prompt: String(row.prompt),
    demoPacing: Boolean(row.demo_pacing),
    model: String(row.model),
    rawStatus: String(row.raw_status),
    displayStatus: String(row.display_status) as DisplayStatus,
    answer: row.answer === null ? null : String(row.answer),
    error: row.error === null ? null : String(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapFault(row: SqlRow): FaultRecord {
  return {
    id: String(row.id),
    invocationId: String(row.invocation_id),
    kind: String(row.kind) as FaultKind,
    target: String(row.target) as FaultTarget,
    status: String(row.status) as FaultRecord["status"],
    remaining: Number(row.remaining),
    delayMs: row.delay_ms === null ? null : Number(row.delay_ms),
    createdAt: String(row.created_at),
    appliedAt: row.applied_at === null ? null : String(row.applied_at),
  };
}

function mapAttempt(row: SqlRow): ToolAttempt {
  return {
    id: String(row.id),
    invocationId: String(row.invocation_id),
    operationKey: String(row.operation_key),
    tool: String(row.tool) as ToolAttempt["tool"],
    status: String(row.status) as ToolAttempt["status"],
    httpStatus: row.http_status === null ? null : Number(row.http_status),
    deduplicated: Boolean(row.deduplicated),
    startedAt: String(row.started_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at),
  };
}

export class DemoDatabase {
  readonly path: string;
  private readonly database: DatabaseSync;

  constructor(path = process.env.DEMO_DATABASE_PATH ?? defaultDatabasePath) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.database = new DatabaseSync(this.path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        invocation_id TEXT PRIMARY KEY,
        client_request_id TEXT NOT NULL UNIQUE,
        parent_invocation_id TEXT,
        prompt TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        demo_pacing INTEGER NOT NULL,
        model TEXT NOT NULL,
        raw_status TEXT NOT NULL,
        display_status TEXT NOT NULL,
        answer TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        source_event_id TEXT NOT NULL UNIQUE,
        invocation_id TEXT,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_run_sequence
        ON events(invocation_id, sequence);

      CREATE TABLE IF NOT EXISTS faults (
        id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        remaining INTEGER NOT NULL,
        delay_ms INTEGER,
        created_at TEXT NOT NULL,
        applied_at TEXT
      );
      CREATE INDEX IF NOT EXISTS faults_pending
        ON faults(invocation_id, status, created_at);

      CREATE TABLE IF NOT EXISTS tool_attempts (
        id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        tool TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        deduplicated INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS attempts_run_started
        ON tool_attempts(invocation_id, started_at);

      CREATE TABLE IF NOT EXISTS tool_effects (
        operation_key TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        committed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invocation_id TEXT NOT NULL,
        operation_key TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS commands (
        action_id TEXT PRIMARY KEY,
        invocation_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  close() {
    this.database.close();
  }

  getRun(invocationId: string) {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE invocation_id = ?")
      .get(invocationId) as SqlRow | undefined;
    return row ? mapRun(row) : null;
  }

  getRunByClientRequestId(clientRequestId: string) {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE client_request_id = ?")
      .get(clientRequestId) as SqlRow | undefined;
    return row ? mapRun(row) : null;
  }

  listRuns(limit = 20) {
    const rows = this.database
      .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as SqlRow[];
    return rows.map(mapRun);
  }

  insertRun(input: {
    invocationId: string;
    clientRequestId: string;
    parentInvocationId?: string | null;
    prompt: string;
    promptHash: string;
    demoPacing: boolean;
    model: string;
  }) {
    const timestamp = now();
    this.database
      .prepare(`
        INSERT INTO runs (
          invocation_id, client_request_id, parent_invocation_id, prompt,
          prompt_hash, demo_pacing, model, raw_status, display_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', 'queued', ?, ?)
      `)
      .run(
        input.invocationId,
        input.clientRequestId,
        input.parentInvocationId ?? null,
        input.prompt,
        input.promptHash,
        input.demoPacing ? 1 : 0,
        input.model,
        timestamp,
        timestamp,
      );
    return this.getRun(input.invocationId);
  }

  updateRun(
    invocationId: string,
    update: Partial<Pick<RunRecord, "rawStatus" | "displayStatus" | "answer" | "error">>,
  ) {
    const current = this.getRun(invocationId);
    if (!current) return null;
    this.database
      .prepare(`
        UPDATE runs SET
          raw_status = ?, display_status = ?, answer = ?, error = ?, updated_at = ?
        WHERE invocation_id = ?
      `)
      .run(
        update.rawStatus ?? current.rawStatus,
        update.displayStatus ?? current.displayStatus,
        update.answer === undefined ? current.answer : update.answer,
        update.error === undefined ? current.error : update.error,
        now(),
        invocationId,
      );
    return this.getRun(invocationId);
  }

  appendEvent(event: Omit<TimelineEvent, "sequence" | "occurredAt"> & { occurredAt?: string }) {
    const result = this.database
      .prepare(`
        INSERT OR IGNORE INTO events (
          source_event_id, invocation_id, source, kind, title, detail,
          occurred_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.sourceEventId,
        event.invocationId,
        event.source,
        event.kind,
        event.title,
        event.detail,
        event.occurredAt ?? now(),
        JSON.stringify(event.payload),
      );
    return result.changes > 0;
  }

  getEvents(invocationId: string, after = 0, limit = 300) {
    const rows = this.database
      .prepare(`
        SELECT * FROM events
        WHERE invocation_id = ? AND sequence > ?
        ORDER BY sequence ASC LIMIT ?
      `)
      .all(invocationId, after, limit) as SqlRow[];
    return rows.map<TimelineEvent>((row) => ({
      sequence: Number(row.sequence),
      sourceEventId: String(row.source_event_id),
      invocationId: row.invocation_id ? String(row.invocation_id) : null,
      source: String(row.source) as TimelineEvent["source"],
      kind: String(row.kind),
      title: String(row.title),
      detail: row.detail === null ? null : String(row.detail),
      occurredAt: String(row.occurred_at),
      payload: parseJsonObject(row.payload_json === null ? null : String(row.payload_json)),
    }));
  }

  createFault(fault: FaultRecord) {
    this.database
      .prepare(`
        INSERT INTO faults (
          id, invocation_id, kind, target, status, remaining,
          delay_ms, created_at, applied_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        fault.id,
        fault.invocationId,
        fault.kind,
        fault.target,
        fault.status,
        fault.remaining,
        fault.delayMs,
        fault.createdAt,
        fault.appliedAt,
      );
  }

  getFaults(invocationId: string) {
    const rows = this.database
      .prepare("SELECT * FROM faults WHERE invocation_id = ? ORDER BY created_at ASC")
      .all(invocationId) as SqlRow[];
    return rows.map(mapFault);
  }

  hasArmedFault(invocationId: string) {
    return Boolean(
      this.database
        .prepare("SELECT 1 AS found FROM faults WHERE invocation_id = ? AND status = 'armed'")
        .get(invocationId),
    );
  }

  consumeFault(invocationId: string, tool: ToolAttempt["tool"]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare(`
          SELECT * FROM faults
          WHERE invocation_id = ? AND status = 'armed'
            AND (target = 'any-tool' OR target = ?)
          ORDER BY created_at ASC LIMIT 1
        `)
        .get(invocationId, tool) as SqlRow | undefined;

      if (!row) {
        this.database.exec("COMMIT");
        return null;
      }

      const remaining = Math.max(0, Number(row.remaining) - 1);
      const appliedAt = now();
      this.database
        .prepare(`
          UPDATE faults SET remaining = ?, status = ?, applied_at = ? WHERE id = ?
        `)
        .run(remaining, remaining === 0 ? "applied" : "armed", appliedAt, String(row.id));
      this.database.exec("COMMIT");
      return mapFault({
        ...row,
        remaining,
        status: remaining === 0 ? "applied" : "armed",
        applied_at: appliedAt,
      });
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  startAttempt(attempt: Omit<ToolAttempt, "status" | "httpStatus" | "deduplicated" | "completedAt">) {
    this.database
      .prepare(`
        INSERT INTO tool_attempts (
          id, invocation_id, operation_key, tool, status, started_at
        ) VALUES (?, ?, ?, ?, 'started', ?)
      `)
      .run(
        attempt.id,
        attempt.invocationId,
        attempt.operationKey,
        attempt.tool,
        attempt.startedAt,
      );
  }

  finishAttempt(
    id: string,
    update: Pick<ToolAttempt, "status" | "httpStatus" | "deduplicated">,
  ) {
    this.database
      .prepare(`
        UPDATE tool_attempts
        SET status = ?, http_status = ?, deduplicated = ?, completed_at = ?
        WHERE id = ?
      `)
      .run(update.status, update.httpStatus, update.deduplicated ? 1 : 0, now(), id);
  }

  getAttempts(invocationId: string) {
    const rows = this.database
      .prepare("SELECT * FROM tool_attempts WHERE invocation_id = ? ORDER BY started_at ASC")
      .all(invocationId) as SqlRow[];
    return rows.map(mapAttempt);
  }

  getEffect(operationKey: string) {
    const row = this.database
      .prepare("SELECT input_hash, result_json FROM tool_effects WHERE operation_key = ?")
      .get(operationKey) as { input_hash: string; result_json: string } | undefined;
    return row
      ? { inputHash: row.input_hash, result: JSON.parse(row.result_json) as unknown }
      : null;
  }

  commitEffect(input: {
    operationKey: string;
    invocationId: string;
    tool: ToolAttempt["tool"];
    inputHash: string;
    result: unknown;
    note?: string;
  }) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.getEffect(input.operationKey);
      if (existing !== null) {
        if (existing.inputHash !== input.inputHash) {
          throw new Error("An operation key cannot be reused with different tool input.");
        }
        this.database.exec("COMMIT");
        return { result: existing.result, deduplicated: true };
      }

      const committedAt = now();
      this.database
        .prepare(`
          INSERT INTO tool_effects (
            operation_key, invocation_id, tool, input_hash, result_json, committed_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.operationKey,
          input.invocationId,
          input.tool,
          input.inputHash,
          JSON.stringify(input.result),
          committedAt,
        );
      if (input.note !== undefined) {
        this.database
          .prepare(`
            INSERT INTO notes (invocation_id, operation_key, content, created_at)
            VALUES (?, ?, ?, ?)
          `)
          .run(input.invocationId, input.operationKey, input.note, committedAt);
      }
      this.database.exec("COMMIT");
      return { result: input.result, deduplicated: false };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listNotes(invocationId: string) {
    return this.database
      .prepare("SELECT content, created_at FROM notes WHERE invocation_id = ? ORDER BY id ASC")
      .all(invocationId) as Array<{ content: string; created_at: string }>;
  }

  countEffects(invocationId: string) {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM tool_effects WHERE invocation_id = ?")
      .get(invocationId) as { count: number };
    return Number(row.count);
  }

  getCommand(actionId: string) {
    return this.database
      .prepare("SELECT * FROM commands WHERE action_id = ?")
      .get(actionId) as SqlRow | undefined;
  }

  insertCommand(input: { actionId: string; invocationId: string; action: string }) {
    const timestamp = now();
    return this.database
      .prepare(`
        INSERT OR IGNORE INTO commands (
          action_id, invocation_id, action, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'requested', ?, ?)
      `)
      .run(input.actionId, input.invocationId, input.action, timestamp, timestamp);
  }

  finishCommand(actionId: string, status: "acknowledged" | "failed", result: unknown) {
    this.database
      .prepare(`
        UPDATE commands SET status = ?, result_json = ?, updated_at = ? WHERE action_id = ?
      `)
      .run(status, JSON.stringify(result), now(), actionId);
  }
}
