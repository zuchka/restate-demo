import type { HealthSnapshot, RunSnapshot, SubmitRunResponse } from "@contracts";
import { loadLocalEnvironment } from "./env";

loadLocalEnvironment();

const controllerUrl = process.env.CONTROLLER_URL ?? "http://127.0.0.1:3100";
const timeoutMs = 120_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${controllerUrl}${path}`, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function waitFor<T>(
  description: string,
  check: () => Promise<T | null>,
  timeout = timeoutMs,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== null) return result;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function main() {
  const health = await request<HealthSnapshot>("/health");
  if (!health.ok) throw new Error("The complete demo stack is not ready. Run pnpm run doctor and pnpm dev first.");
  const originalWorkerPid = health.worker.pid;
  if (!originalWorkerPid) throw new Error("The worker is marked ready without a process ID.");

  const submission = await request<SubmitRunResponse>("/runs", {
    method: "POST",
    body: JSON.stringify({
      clientRequestId: `recovery-${crypto.randomUUID()}`,
      prompt: "Calculate 12 requests per second in requests per minute, then explain the result in one sentence.",
      demoPacing: true,
    }),
  });
  const invocationId = submission.invocationId;
  process.stdout.write(`Started ${invocationId}\n`);

  await waitFor("a physical tool request", async () => {
    const snapshot = await request<RunSnapshot>(`/runs/${invocationId}`);
    return snapshot.events.some((event) => event.kind === "tool.requested") ? snapshot : null;
  });

  await request("/worker/crash", {
    method: "POST",
    body: JSON.stringify({ invocationId }),
  });
  process.stdout.write("Crashed the worker during the invocation.\n");

  const completed = await waitFor("the same invocation to recover and complete", async () => {
    const snapshot = await request<RunSnapshot>(`/runs/${invocationId}`);
    if (snapshot.run.displayStatus === "failed" || snapshot.run.displayStatus === "cancelled") {
      throw new Error(`Invocation became ${snapshot.run.displayStatus}: ${snapshot.run.error ?? "no detail"}`);
    }
    return snapshot.run.displayStatus === "completed" ? snapshot : null;
  });

  if (completed.run.invocationId !== invocationId) {
    throw new Error("Recovery changed the invocation identity.");
  }
  if (completed.metrics.workerCrashes < 1) {
    throw new Error("The controller did not record the worker exit.");
  }
  if (!completed.events.some((event) => event.kind === "worker.recovery-observed")) {
    throw new Error("No resumed invocation work was observed on the replacement worker.");
  }
  if (completed.metrics.recoveryMs === null) {
    throw new Error("The controller did not measure recovery to resumed invocation work.");
  }
  if (completed.metrics.deduplicatedRequests < 1) {
    throw new Error("The replay did not exercise the external-effect deduplication boundary.");
  }
  if (!completed.run.answer) {
    throw new Error("The recovered invocation completed without a visible answer.");
  }
  const recoveredHealth = await request<HealthSnapshot>("/health");
  if (!recoveredHealth.worker.pid || recoveredHealth.worker.pid === originalWorkerPid) {
    throw new Error("The invocation completed without evidence of a replacement worker PID.");
  }

  process.stdout.write(
    [
      "Recovery verification passed.",
      `Invocation: ${invocationId}`,
      `Worker PID: ${originalWorkerPid} → ${recoveredHealth.worker.pid}`,
      `Worker crashes: ${completed.metrics.workerCrashes}`,
      `Recovery observed: ${completed.metrics.recoveryMs}ms`,
      `Saved checkpoints: ${completed.metrics.savedCheckpoints}`,
      `Tool requests: ${completed.metrics.toolRequests}`,
      `Unique effects: ${completed.metrics.uniqueToolEffects}`,
      `Deduplicated requests: ${completed.metrics.deduplicatedRequests}`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
