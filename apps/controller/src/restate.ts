import type { DisplayStatus, JournalEntry } from "@contracts";

type UnknownRow = Record<string, unknown>;

export interface RestateInvocation {
  id: string;
  status: string;
  completionResult: string | null;
  completionFailure: string | null;
  retryCount: number;
  journalSize: number;
  restartedFrom: string | null;
  modifiedAt: string | null;
  lastFailure: string | null;
}

const invocationPattern = /^inv_[A-Za-z0-9_-]+$/;

function assertInvocationId(invocationId: string) {
  if (!invocationPattern.test(invocationId)) {
    throw new Error("Invalid Restate invocation ID.");
  }
}

function toRows(payload: unknown): UnknownRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is UnknownRow => Boolean(row) && typeof row === "object" && !Array.isArray(row),
    );
  }

  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["rows", "data", "result", "records"]) {
    if (Array.isArray(record[key])) return toRows(record[key]);
  }
  return [];
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseJsonValue(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function findJournalName(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findJournalName(item, depth + 1);
      if (name) return name;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.name === "string" && record.name.trim()) return record.name;
  for (const nested of Object.values(record)) {
    const name = findJournalName(nested, depth + 1);
    if (name) return name;
  }
  return null;
}

export function mapJournalRows(rows: UnknownRow[]): JournalEntry[] {
  return rows.map((row) => {
    const commandType = String(row.entry_type ?? "unknown");
    const entryJson = parseJsonValue(row.entry_json);
    const explicitCompleted = row.completed;
    const completed =
      typeof explicitCompleted === "boolean"
        ? explicitCompleted
        : typeof explicitCompleted === "number"
          ? explicitCompleted !== 0
          : typeof explicitCompleted === "string"
            ? explicitCompleted.toLowerCase() === "true"
            : /notification|completion|output/i.test(commandType);
    const directName = typeof row.name === "string" ? row.name.trim() : "";

    return {
      index: Number(row.index ?? 0),
      name: directName || findJournalName(entryJson) || commandType || "Checkpoint",
      commandType,
      completed,
      raw: { ...row, entry_json: entryJson },
    };
  });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class RestateClient {
  readonly ingressUrl = process.env.RESTATE_INGRESS_URL ?? "http://127.0.0.1:8080";
  readonly adminUrl = process.env.RESTATE_ADMIN_URL ?? "http://127.0.0.1:9070";

  async health() {
    try {
      const response = await fetch(`${this.adminUrl}/health`, {
        signal: AbortSignal.timeout(1_200),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async submit(input: unknown, idempotencyKey: string) {
    try {
      const response = await fetch(`${this.ingressUrl}/restate/send/BreakMyAgent/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await parseResponse(response);
      if (!response.ok) {
        throw new Error(`Restate rejected the run (${response.status}): ${JSON.stringify(body)}`);
      }
      const invocationId =
        body && typeof body === "object"
          ? stringOrNull((body as Record<string, unknown>).invocationId) ??
            stringOrNull((body as Record<string, unknown>).invocation_id)
          : null;
      if (!invocationId) throw new Error("Restate accepted the run without an invocation ID.");
      return invocationId;
    } catch (error) {
      const recovered = await this.lookupByIdempotencyKey(idempotencyKey).catch(() => null);
      if (recovered) return recovered;
      throw error;
    }
  }

  async lookupByIdempotencyKey(idempotencyKey: string) {
    const response = await fetch(`${this.ingressUrl}/restate/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "idempotentInvocation",
        service: "BreakMyAgent",
        handler: "run",
        idempotencyKey,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const body = await parseResponse(response);
    if (!body || typeof body !== "object") return null;
    return (
      stringOrNull((body as Record<string, unknown>).invocationId) ??
      stringOrNull((body as Record<string, unknown>).invocation_id)
    );
  }

  private async query(sql: string) {
    const response = await fetch(`${this.adminUrl}/query`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      throw new Error(`Restate introspection failed with HTTP ${response.status}.`);
    }
    return toRows(await parseResponse(response));
  }

  async getInvocation(invocationId: string): Promise<RestateInvocation | null> {
    assertInvocationId(invocationId);
    const rows = await this.query(`
      SELECT id, status, completion_result, completion_failure, retry_count,
             journal_size, restarted_from, modified_at, last_failure
      FROM sys_invocation WHERE id = '${invocationId}'
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      status: String(row.status ?? "unknown"),
      completionResult: stringOrNull(row.completion_result),
      completionFailure: stringOrNull(row.completion_failure),
      retryCount: Number(row.retry_count ?? 0),
      journalSize: Number(row.journal_size ?? 0),
      restartedFrom: stringOrNull(row.restarted_from),
      modifiedAt: stringOrNull(row.modified_at),
      lastFailure: stringOrNull(row.last_failure),
    };
  }

  async getJournal(invocationId: string): Promise<JournalEntry[]> {
    assertInvocationId(invocationId);
    const rows = await this.query(`
      SELECT "index", entry_type, name, version, entry_json
      FROM sys_journal WHERE id = '${invocationId}' ORDER BY "index" ASC
    `);
    return mapJournalRows(rows);
  }

  async getOutput(invocationId: string) {
    assertInvocationId(invocationId);
    const response = await fetch(`${this.ingressUrl}/restate/output/${invocationId}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    });
    const body = await parseResponse(response);
    if (response.status === 202 || response.status === 404 || response.status === 425) {
      return { ready: false as const, value: null };
    }
    if (!response.ok) {
      return { ready: true as const, value: null, error: JSON.stringify(body) };
    }
    return { ready: true as const, value: body, error: null };
  }

  async action(invocationId: string, action: "pause" | "resume" | "cancel") {
    assertInvocationId(invocationId);
    const response = await fetch(`${this.adminUrl}/invocations/${invocationId}/${action}`, {
      method: "PATCH",
      signal: AbortSignal.timeout(5_000),
    });
    const body = await parseResponse(response);
    if (!response.ok) {
      throw new Error(`Restate ${action} failed (${response.status}): ${JSON.stringify(body)}`);
    }
    return body;
  }

  async restart(invocationId: string) {
    assertInvocationId(invocationId);
    const response = await fetch(
      `${this.adminUrl}/invocations/${invocationId}/restart-as-new`,
      { method: "PATCH", signal: AbortSignal.timeout(7_000) },
    );
    const body = await parseResponse(response);
    if (!response.ok) {
      throw new Error(`Restate restart failed (${response.status}): ${JSON.stringify(body)}`);
    }
    const newInvocationId =
      body && typeof body === "object"
        ? stringOrNull((body as Record<string, unknown>).new_invocation_id) ??
          stringOrNull((body as Record<string, unknown>).newInvocationId)
        : null;
    if (!newInvocationId) throw new Error("Restart succeeded without a new invocation ID.");
    return newInvocationId;
  }
}

export function mapDisplayStatus(input: {
  rawStatus: string;
  completionResult?: string | null;
  completionFailure?: string | null;
  requestedStatus?: DisplayStatus;
  workerOnline: boolean;
}): DisplayStatus {
  if (input.rawStatus === "completed") {
    if (input.completionResult?.toLowerCase() === "success") return "completed";
    const failure = input.completionFailure?.toLowerCase() ?? "";
    if (failure.includes("cancel")) return "cancelled";
    return "failed";
  }
  if (input.rawStatus === "paused") return "paused";
  if (input.requestedStatus === "cancelling") return "cancelling";
  if (input.requestedStatus === "pause-requested") return "pause-requested";
  if (input.rawStatus === "backing-off") return "retrying";
  if (input.rawStatus === "suspended") return "waiting";
  if (["pending", "scheduled", "ready"].includes(input.rawStatus)) return "queued";
  if (input.rawStatus === "running" && input.requestedStatus === "recovering") {
    return "recovering";
  }
  if (input.rawStatus === "running" && !input.workerOnline) return "recovering";
  if (input.rawStatus === "running") return "running";
  return "unknown";
}

export function extractAnswer(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  for (const key of ["answer", "text", "result", "output"]) {
    if (typeof record[key] === "string") return record[key] as string;
    const nested: string | null = extractAnswer(record[key]);
    if (nested) return nested;
  }
  return JSON.stringify(output, null, 2);
}
