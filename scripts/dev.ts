import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadLocalEnvironment } from "./env";

const root = process.cwd();
loadLocalEnvironment(root);

const adminUrl = process.env.RESTATE_ADMIN_URL ?? "http://127.0.0.1:9070";
const controllerUrl = process.env.CONTROLLER_URL ?? "http://127.0.0.1:3100";
const children: Array<{ label: string; child: ChildProcess }> = [];
let stopping = false;

function log(message: string) {
  process.stdout.write(`\n[break-my-agent] ${message}\n`);
}

function startProcess(
  label: string,
  command: string,
  args: string[],
  options: { cwd?: string } = {},
) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: "inherit",
  });
  children.push({ label, child });
  child.once("error", (error) => {
    process.stderr.write(`[${label}] ${error.message}\n`);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      process.stderr.write(
        `\n[break-my-agent] ${label} stopped unexpectedly (${signal ?? `code ${code ?? "unknown"}`}).\n`,
      );
      void shutdown(1);
    }
  });
  return child;
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function endpointHealthy(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
  return response.ok;
}

async function controllerReady() {
  const response = await fetch(`${controllerUrl}/health`, {
    signal: AbortSignal.timeout(1_000),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { ok?: boolean };
  return body.ok === true;
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  log("Stopping local services…");
  for (const { child } of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  const forceTimer = setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 3_000);
  forceTimer.unref();
  await Promise.all(
    children.map(
      ({ child }) =>
        new Promise<void>((resolvePromise) => {
          if (child.exitCode !== null || child.signalCode !== null) resolvePromise();
          else child.once("exit", () => resolvePromise());
        }),
    ),
  );
  process.exit(exitCode);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes("...")) {
    throw new Error("Add a real ANTHROPIC_API_KEY to .env.local before starting the demo.");
  }

  const restateDataDirectory = resolve(root, ".data/restate");
  mkdirSync(restateDataDirectory, { recursive: true });

  log("Starting Restate with persistent local storage…");
  startProcess(
    "restate",
    "restate-server",
    ["--config-file", resolve(root, "restate.toml")],
    { cwd: restateDataDirectory },
  );
  await waitFor("Restate", () => endpointHealthy(`${adminUrl}/health`));

  log("Starting the controller and isolated agent worker…");
  startProcess("controller", process.execPath, ["--import", "tsx", "apps/controller/src/index.ts"]);
  await waitFor("the controller and agent worker", controllerReady);

  log("Starting the web interface at http://127.0.0.1:3000…");
  startProcess("web", "next", ["dev", "-H", "127.0.0.1", "-p", "3000"]);
  await waitFor("the web interface", () => endpointHealthy("http://127.0.0.1:3000"), 45_000);

  log("Ready. Open http://127.0.0.1:3000 and try to break the agent.");
  await new Promise(() => undefined);
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

main().catch((error: unknown) => {
  process.stderr.write(
    `\n[break-my-agent] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  void shutdown(1);
});
