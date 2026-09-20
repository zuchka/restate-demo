import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  ArmFaultRequest,
  FaultRecord,
  HealthSnapshot,
  RunAction,
  RunActionRequest,
  RunSnapshot,
  SubmitRunRequest,
  SubmitRunResponse,
  TimelineEvent,
  ToolAttempt,
  ToolRequest,
  WorkerObservation,
} from "@contracts";
import { faultKinds, faultTargets, findDemoPreset, runActions } from "@contracts";
import { DemoDatabase } from "./db";
import { evaluateExpression } from "./math";
import { extractAnswer, mapDisplayStatus, RestateClient } from "./restate";
import { WorkerSupervisor } from "./supervisor";
import { loadLocalEnvironment } from "../../../scripts/env";

loadLocalEnvironment();

const port = Number(process.env.CONTROLLER_PORT ?? process.env.PORT ?? 3_100);
const host =
  process.env.CONTROLLER_HOST ??
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const internalToken = process.env.CONTROLLER_INTERNAL_TOKEN ?? "local-demo-token";
const restateUiUrl = process.env.RESTATE_UI_URL ?? "http://127.0.0.1:9070/ui";
const workerPublicUrl = process.env.WORKER_PUBLIC_URL ?? `http://127.0.0.1:${Number(process.env.WORKER_PORT ?? 9_080)}`;
const maxBodyBytes = 64 * 1024;
const database = new DemoDatabase();
const restate = new RestateClient();

let workerEventInvocationId: string | null = null;
let workerCrashAt: string | null = null;
let workerCrashBootId: string | null = null;
let shuttingDown = false;
let deploymentRegistered = false;

function timestamp() {
  return new Date().toISOString();
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function appendEvent(
  input: Omit<TimelineEvent, "sequence" | "sourceEventId" | "occurredAt"> & {
    sourceEventId?: string;
    occurredAt?: string;
  },
) {
  database.appendEvent({
    ...input,
    sourceEventId: input.sourceEventId ?? randomUUID(),
    occurredAt: input.occurredAt,
  });
}

const supervisor = new WorkerSupervisor({
  onEvent(event) {
    appendEvent({
      invocationId: workerEventInvocationId,
      source: "controller",
      kind: event.kind,
      title: event.title,
      detail: event.detail,
      payload: event.payload,
    });
  },
});

function sendJson(response: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
  });
  response.end(payload);
}

function sendError(response: ServerResponse, status: number, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected controller error.";
  sendJson(response, status, { error: message });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const contentType = request.headers["content-type"]?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function validatePreset(value: unknown) {
  const preset = findDemoPreset(value);
  if (!preset) {
    throw new Error("Choose one of the supported demo prompts.");
  }
  return preset;
}

function validateClientRequestId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    throw new Error("Client request ID is invalid.");
  }
  return value;
}

function validateInvocationId(value: unknown) {
  if (typeof value !== "string" || !/^inv_[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invocation ID is invalid.");
  }
  return value;
}

function commandResult(row: Record<string, unknown>) {
  const value = row.result_json;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function replayCommand(
  row: Record<string, unknown>,
  invocationId: string,
  action: RunAction,
) {
  if (row.invocation_id !== invocationId || row.action !== action) {
    throw new Error("This action ID was already used for a different command.");
  }
  const result = commandResult(row);
  if (row.status === "failed") {
    const message =
      result && typeof result === "object" && "error" in result
        ? String((result as Record<string, unknown>).error)
        : "The earlier command attempt failed.";
    throw new Error(message);
  }
  if (row.status === "requested") {
    throw new Error("This command is already being processed.");
  }
  return result;
}

async function submitRun(body: SubmitRunRequest): Promise<SubmitRunResponse> {
  const clientRequestId = validateClientRequestId(body.clientRequestId);
  const preset = validatePreset(body.presetId);
  const prompt = preset.prompt;
  const demoPacing = body.demoPacing !== false;
  const input = { presetId: preset.id, demoPacing, model };
  const inputHash = hash({ prompt, demoPacing, model });
  const existing = database.getRunByClientRequestId(clientRequestId);

  if (existing) {
    if (hash({ prompt: existing.prompt, demoPacing: existing.demoPacing, model: existing.model }) !== inputHash) {
      throw new Error("This request ID was already used with different input.");
    }
    return { invocationId: existing.invocationId, accepted: true, deduplicated: true };
  }

  const invocationId = await restate.submit(input, `break-my-agent:${clientRequestId}`);
  database.insertRun({
    invocationId,
    clientRequestId,
    prompt,
    promptHash: hash(prompt),
    demoPacing,
    model,
  });
  appendEvent({
    invocationId,
    source: "controller",
    kind: "run.accepted",
    title: "Invocation accepted",
    detail: "Restate assigned a durable invocation ID.",
    payload: { invocationId, clientRequestId, model, demoPacing },
  });
  return { invocationId, accepted: true, deduplicated: false };
}

async function reconcileRun(invocationId: string): Promise<RunSnapshot> {
  let run = database.getRun(invocationId);
  if (!run) throw new Error("Run not found.");

  let journal: RunSnapshot["journal"] = [];
  const [invocationResult, journalResult] = await Promise.allSettled([
    restate.getInvocation(invocationId),
    restate.getJournal(invocationId),
  ]);
  if (journalResult.status === "fulfilled") {
    journal = journalResult.value;
  }
  if (invocationResult.status === "fulfilled") {
    const invocation = invocationResult.value;
    if (invocation) {
      const displayStatus = mapDisplayStatus({
        rawStatus: invocation.status,
        completionResult: invocation.completionResult,
        completionFailure: invocation.completionFailure,
        requestedStatus: run.displayStatus,
        workerOnline: supervisor.snapshot().status === "online",
      });
      const changed =
        run.rawStatus !== invocation.status || run.displayStatus !== displayStatus;
      run =
        database.updateRun(invocationId, {
          rawStatus: invocation.status,
          displayStatus,
          error: invocation.completionFailure ?? undefined,
        }) ?? run;
      if (changed) {
        appendEvent({
          invocationId,
          source: "restate",
          kind: `invocation.${displayStatus}`,
          title: `Invocation ${displayStatus.replaceAll("-", " ")}`,
          detail: invocation.lastFailure,
          sourceEventId: `${invocationId}:${invocation.status}:${displayStatus}:${invocation.modifiedAt ?? "unknown"}`,
          occurredAt: invocation.modifiedAt ?? undefined,
          payload: {
            rawStatus: invocation.status,
            completionResult: invocation.completionResult,
            retryCount: invocation.retryCount,
            journalSize: invocation.journalSize,
          },
        });
      }
    }
  }

  if (run.displayStatus === "completed" && !run.answer) {
    const output = await restate.getOutput(invocationId).catch(() => ({ ready: false as const, value: null }));
    if (output.ready) {
      run = database.updateRun(invocationId, {
        answer: extractAnswer(output.value),
        error: "error" in output ? output.error ?? null : null,
      }) ?? run;
    }
  }

  const events = database.getEvents(invocationId);
  const faults = database.getFaults(invocationId);
  const attempts = database.getAttempts(invocationId);
  const crashEvents = events.filter((event) => event.kind === "worker.exited");
  const recoveryEvents = events.filter((event) => event.kind === "worker.recovery-observed");
  const recoveryPayload = recoveryEvents.at(-1)?.payload.recoveryMs;
  const availableActions: RunAction[] = [];
  if (run.displayStatus === "queued") {
    availableActions.push("cancel");
  }
  if (["running", "retrying", "waiting", "recovering"].includes(run.displayStatus)) {
    availableActions.push("pause", "cancel");
  }
  if (["paused", "pause-requested"].includes(run.displayStatus)) {
    availableActions.push("resume", "cancel");
  }
  if (["completed", "cancelled", "failed"].includes(run.displayStatus)) {
    availableActions.push("restart");
  }

  return {
    run,
    events: database.getEvents(invocationId),
    faults,
    attempts,
    journal,
    metrics: {
      savedCheckpoints: journal.filter((entry) => entry.completed).length,
      toolRequests: attempts.length,
      uniqueToolEffects: database.countEffects(invocationId),
      deduplicatedRequests: attempts.filter((attempt) => attempt.deduplicated).length,
      workerCrashes: crashEvents.length,
      recoveryMs: typeof recoveryPayload === "number" ? recoveryPayload : null,
    },
    availableActions,
  };
}

function armFault(invocationId: string, body: ArmFaultRequest) {
  const run = database.getRun(invocationId);
  if (!run) throw new Error("Run not found.");
  if (["completed", "cancelled", "failed"].includes(run.displayStatus)) {
    throw new Error("Faults can only be armed for an active invocation.");
  }
  if (!faultKinds.includes(body.kind)) throw new Error("Unsupported fault kind.");
  const target = body.target ?? "any-tool";
  if (!faultTargets.includes(target)) throw new Error("Unsupported fault target.");
  if (database.hasArmedFault(invocationId)) {
    throw new Error("This invocation already has an armed fault.");
  }
  const delayMs =
    body.kind === "latency"
      ? Math.min(30_000, Math.max(1_000, Number(body.delayMs ?? 10_000)))
      : null;
  const fault: FaultRecord = {
    id: randomUUID(),
    invocationId,
    kind: body.kind,
    target,
    status: "armed",
    remaining: 1,
    delayMs,
    createdAt: timestamp(),
    appliedAt: null,
  };
  database.createFault(fault);
  appendEvent({
    invocationId,
    source: "controller",
    kind: "fault.armed",
    title: `${body.kind.replaceAll("-", " ")} armed`,
    detail: `The next matching ${target.replaceAll("-", " ")} request will be affected.`,
    payload: { ...fault },
  });
  return fault;
}

async function runAction(invocationId: string, body: RunActionRequest) {
  const actionId = validateClientRequestId(body.actionId);
  if (!runActions.includes(body.action)) throw new Error("Unsupported invocation action.");
  const run = database.getRun(invocationId);
  if (!run) throw new Error("Run not found.");
  const existing = database.getCommand(actionId);
  if (existing) return replayCommand(existing, invocationId, body.action);
  database.insertCommand({ actionId, invocationId, action: body.action });

  try {
    if (body.action === "restart") {
      const newInvocationId = await restate.restart(invocationId);
      database.insertRun({
        invocationId: newInvocationId,
        clientRequestId: `${run.clientRequestId}-restart-${actionId}`,
        parentInvocationId: invocationId,
        prompt: run.prompt,
        promptHash: hash(run.prompt),
        demoPacing: run.demoPacing,
        model: run.model,
      });
      appendEvent({
        invocationId,
        source: "restate",
        kind: "invocation.restarted",
        title: "Restarted as a new invocation",
        detail: `The original run remains available. New invocation: ${newInvocationId}`,
        payload: { newInvocationId },
      });
      appendEvent({
        invocationId: newInvocationId,
        source: "restate",
        kind: "invocation.restarted-from",
        title: "Fresh invocation created",
        detail: `Restarted from ${invocationId} without copying its progress.`,
        payload: { parentInvocationId: invocationId },
      });
      const result = { action: body.action, newInvocationId };
      database.finishCommand(actionId, "acknowledged", result);
      return result;
    }

    if (body.action === "pause") {
      database.updateRun(invocationId, { displayStatus: "pause-requested" });
    }
    if (body.action === "cancel") {
      database.updateRun(invocationId, { displayStatus: "cancelling" });
    }
    const result = await restate.action(invocationId, body.action);
    appendEvent({
      invocationId,
      source: "controller",
      kind: `command.${body.action}`,
      title: `${body.action[0].toUpperCase()}${body.action.slice(1)} requested`,
      detail: "The request was acknowledged; the timeline will confirm the observed state.",
      payload: { actionId },
    });
    database.finishCommand(actionId, "acknowledged", result);
    return { action: body.action, acknowledged: true, result };
  } catch (error) {
    if (body.action === "pause" || body.action === "cancel") {
      database.updateRun(invocationId, { displayStatus: run.displayStatus });
    }
    database.finishCommand(actionId, "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function requireInternalToken(request: IncomingMessage) {
  if (request.headers["x-controller-token"] !== internalToken) {
    throw new Error("Invalid controller token.");
  }
}

async function pause(durationMs: number) {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, durationMs));
}

async function handleTool(
  tool: ToolAttempt["tool"],
  body: ToolRequest,
  response: ServerResponse,
) {
  const invocationId = validateInvocationId(body.invocationId);
  if (!database.getRun(invocationId)) throw new Error("Unknown invocation.");
  if (typeof body.operationKey !== "string" || body.operationKey.length > 240) {
    throw new Error("Tool operation key is invalid.");
  }
  const attemptId = randomUUID();
  const startedAt = timestamp();
  database.startAttempt({
    id: attemptId,
    invocationId,
    operationKey: body.operationKey,
    tool,
    startedAt,
  });
  appendEvent({
    invocationId,
    source: "tool",
    kind: "tool.requested",
    title: `${tool.replaceAll("-", " ")} request received`,
    detail: "This is a physical HTTP attempt at the external tool boundary.",
    payload: { attemptId, operationKey: body.operationKey, tool },
  });

  try {
    const fault = database.consumeFault(invocationId, tool);
    if (fault) {
      appendEvent({
        invocationId,
        source: "tool",
        kind: "fault.applied",
        title: `${fault.kind.replaceAll("-", " ")} applied`,
        detail: `Fault ${fault.id.slice(0, 8)} affected ${tool.replaceAll("-", " ")}.`,
        payload: { faultId: fault.id, attemptId, kind: fault.kind },
      });
      if (fault.kind === "rate-limit") {
        database.finishAttempt(attemptId, {
          status: "rate-limited",
          httpStatus: 429,
          deduplicated: false,
        });
        response.setHeader("retry-after", "2");
        sendJson(response, 429, { error: "Injected rate limit", retryAfterSeconds: 2 });
        return;
      }
      if (fault.kind === "server-error") {
        database.finishAttempt(attemptId, {
          status: "failed",
          httpStatus: 500,
          deduplicated: false,
        });
        sendJson(response, 500, { error: "Injected upstream failure" });
        return;
      }
      if (fault.kind === "latency") {
        await pause(fault.delayMs ?? 10_000);
      }
    } else if (Number.isFinite(body.pacingMs) && body.pacingMs > 0) {
      const pacingMs = Math.min(10_000, Math.max(0, body.pacingMs));
      appendEvent({
        invocationId,
        source: "tool",
        kind: "tool.delayed",
        title: "Demo pacing active",
        detail: `Holding this tool response for ${Math.round(pacingMs / 100) / 10}s.`,
        payload: { attemptId, pacingMs },
      });
      await pause(pacingMs);
    }

    let result: unknown;
    let note: string | undefined;
    if (tool === "save-note") {
      const value = (body.input as Record<string, unknown>).note;
      if (typeof value !== "string" || value.trim().length < 1 || value.length > 800) {
        throw new Error("Note must contain between 1 and 800 characters.");
      }
      note = value.trim();
      result = { saved: true, note };
    } else if (tool === "read-notes") {
      result = {
        notes: database.listNotes(invocationId).map((entry) => ({
          content: entry.content,
          createdAt: entry.created_at,
        })),
      };
    } else {
      const expression = (body.input as Record<string, unknown>).expression;
      if (typeof expression !== "string") throw new Error("Expression must be a string.");
      result = { expression, result: evaluateExpression(expression) };
    }

    const committed = database.commitEffect({
      operationKey: body.operationKey,
      invocationId,
      tool,
      inputHash: hash(body.input),
      result,
      note,
    });
    database.finishAttempt(attemptId, {
      status: "succeeded",
      httpStatus: 200,
      deduplicated: committed.deduplicated,
    });
    appendEvent({
      invocationId,
      source: "tool",
      kind: committed.deduplicated ? "tool.deduplicated" : "tool.succeeded",
      title: committed.deduplicated ? "Stored tool result replayed" : "Tool effect committed",
      detail: committed.deduplicated
        ? "The HTTP request repeated, but the operation key prevented a duplicate effect."
        : "The external tool committed one idempotent effect.",
      payload: { attemptId, operationKey: body.operationKey, tool },
    });
    sendJson(response, 200, committed.result);
  } catch (error) {
    database.finishAttempt(attemptId, {
      status: "failed",
      httpStatus: 400,
      deduplicated: false,
    });
    appendEvent({
      invocationId,
      source: "tool",
      kind: "tool.failed",
      title: "Tool request failed",
      detail: error instanceof Error ? error.message : String(error),
      payload: { attemptId, tool },
    });
    throw error;
  }
}

async function healthSnapshot(): Promise<HealthSnapshot & { restateUiUrl: string }> {
  const worker = supervisor.snapshot();
  const restateOnline = await restate.health();
  return {
    ok: restateOnline && deploymentRegistered && worker.status === "online" && Boolean(process.env.ANTHROPIC_API_KEY),
    controller: { status: "online", databasePath: database.path },
    worker,
    restate: {
      status: restateOnline ? "online" : "offline",
      adminUrl: restate.adminUrl,
      ingressUrl: restate.ingressUrl,
    },
    anthropic: { configured: Boolean(process.env.ANTHROPIC_API_KEY), model },
    restateUiUrl,
    timestamp: timestamp(),
  };
}

async function registerWorkerDeployment() {
  let attempt = 0;
  while (!shuttingDown && !deploymentRegistered) {
    attempt += 1;
    try {
      if (supervisor.snapshot().status !== "online") throw new Error("Worker is not ready yet.");
      const response = await fetch(`${restate.adminUrl}/deployments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri: workerPublicUrl, force: true }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Restate returned ${response.status}: ${detail.slice(0, 300)}`);
      }
      deploymentRegistered = true;
      process.stdout.write(`Registered Restate worker deployment at ${workerPublicUrl}\n`);
      return;
    } catch (error) {
      if (attempt === 1 || attempt % 10 === 0) {
        process.stderr.write(
          `Waiting to register the Restate worker (${error instanceof Error ? error.message : String(error)})\n`,
        );
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(5_000, 500 + attempt * 250)));
    }
  }
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, await healthSnapshot());
    return;
  }

  if (method === "GET" && url.pathname === "/runs") {
    sendJson(response, 200, { runs: database.listRuns() });
    return;
  }

  if (method === "POST" && url.pathname === "/runs") {
    sendJson(response, 202, await submitRun(await readJson<SubmitRunRequest>(request)));
    return;
  }

  if (segments[0] === "runs" && segments[1]) {
    const invocationId = validateInvocationId(segments[1]);
    if (method === "GET" && segments.length === 2) {
      sendJson(response, 200, await reconcileRun(invocationId));
      return;
    }
    if (method === "GET" && segments[2] === "events") {
      const after = Math.max(0, Number(url.searchParams.get("after") ?? 0));
      sendJson(response, 200, { events: database.getEvents(invocationId, after) });
      return;
    }
    if (method === "GET" && segments[2] === "output") {
      sendJson(response, 200, await restate.getOutput(invocationId));
      return;
    }
    if (method === "POST" && segments[2] === "faults") {
      sendJson(response, 201, armFault(invocationId, await readJson<ArmFaultRequest>(request)));
      return;
    }
    if (method === "POST" && segments[2] === "actions") {
      sendJson(response, 202, await runAction(invocationId, await readJson<RunActionRequest>(request)));
      return;
    }
  }

  if (method === "POST" && url.pathname === "/worker/crash") {
    const body = await readJson<{ invocationId: string }>(request);
    const invocationId = validateInvocationId(body.invocationId);
    const run = database.getRun(invocationId);
    if (!run) throw new Error("Run not found.");
    if (["completed", "cancelled", "failed"].includes(run.displayStatus)) {
      throw new Error("The selected invocation is already terminal.");
    }
    workerEventInvocationId = invocationId;
    workerCrashAt = timestamp();
    const crashed = supervisor.crash();
    workerCrashBootId = crashed.bootId;
    database.updateRun(invocationId, { displayStatus: "recovering" });
    sendJson(response, 202, { crashed: true, ...crashed });
    return;
  }

  if (method === "POST" && url.pathname === "/internal/worker-events") {
    requireInternalToken(request);
    const observation = await readJson<WorkerObservation>(request);
    appendEvent({
      sourceEventId: observation.sourceEventId,
      invocationId: observation.invocationId,
      source: "worker",
      kind: observation.kind,
      title: observation.title,
      detail: observation.detail ?? null,
      payload: {
        ...(observation.payload ?? {}),
        bootId: observation.bootId,
        pid: observation.pid,
      },
    });
    if (
      observation.invocationId &&
      observation.invocationId === workerEventInvocationId &&
      observation.bootId !== workerCrashBootId &&
      workerCrashAt
    ) {
      const recoveryMs = Date.now() - new Date(workerCrashAt).getTime();
      appendEvent({
        sourceEventId: `${observation.sourceEventId}:recovery`,
        invocationId: observation.invocationId,
        source: "controller",
        kind: "worker.recovery-observed",
        title: "Invocation resumed on replacement worker",
        detail: "A new worker process began replaying the same durable invocation.",
        payload: { recoveryMs, bootId: observation.bootId, pid: observation.pid },
      });
      database.updateRun(observation.invocationId, { displayStatus: "running" });
      workerEventInvocationId = null;
      workerCrashAt = null;
      workerCrashBootId = null;
    }
    sendJson(response, 202, { accepted: true });
    return;
  }

  if (method === "POST" && segments[0] === "tools" && segments[1]) {
    requireInternalToken(request);
    const toolMap: Record<string, ToolAttempt["tool"]> = {
      "save-note": "save-note",
      "read-notes": "read-notes",
      calculate: "calculate",
    };
    const tool = toolMap[segments[1]];
    if (!tool) throw new Error("Unknown tool.");
    await handleTool(tool, await readJson<ToolRequest>(request), response);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    if (!response.headersSent) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      const status = message.includes("not found") ? 404 : message.includes("Invalid controller token") ? 401 : 400;
      sendError(response, status, error);
    } else {
      response.end();
    }
  });
});

server.listen(port, host, () => {
  process.stdout.write(`Controller listening on ${host}:${port}\n`);
  supervisor.start();
  void registerWorkerDeployment();
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  supervisor.stop();
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
