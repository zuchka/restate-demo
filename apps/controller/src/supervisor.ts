import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { WorkerState } from "@contracts";

export interface SupervisorSnapshot {
  status: WorkerState;
  pid: number | null;
  bootId: string | null;
  restartCount: number;
}

interface SupervisorOptions {
  onEvent: (event: {
    kind: string;
    title: string;
    detail: string;
    payload: Record<string, unknown>;
  }) => void;
}

export class WorkerSupervisor {
  private child: ChildProcess | null = null;
  private bootId: string | null = null;
  private restartCount = 0;
  private status: WorkerState = "offline";
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private readonly restartDelay = Number(process.env.WORKER_RESTART_DELAY_MS ?? 1_800);

  constructor(private readonly options: SupervisorOptions) {}

  snapshot(): SupervisorSnapshot {
    return {
      status: this.status,
      pid: this.child?.pid ?? null,
      bootId: this.bootId,
      restartCount: this.restartCount,
    };
  }

  start() {
    if (this.child || this.stopping) return;
    this.status = this.restartCount === 0 ? "starting" : "restarting";
    this.bootId = randomUUID();
    const workerEntry = resolve(process.cwd(), "apps/worker/src/index.ts");
    const child = spawn(process.execPath, ["--import", "tsx", workerEntry], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WORKER_BOOT_ID: this.bootId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    let stdoutBuffer = "";
    const markReady = () => {
      if (this.child !== child || this.status === "online") return;
      this.status = "online";
      this.options.onEvent({
        kind: "worker.ready",
        title: "Agent worker online",
        detail: `Worker ${child.pid} is listening for Restate invocations.`,
        payload: { pid: child.pid, bootId: this.bootId, restartCount: this.restartCount },
      });
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      const output = chunk.toString();
      process.stdout.write(`[worker] ${output}`);
      stdoutBuffer = `${stdoutBuffer}${output}`.slice(-4_096);
      if (stdoutBuffer.includes("Restate agent worker listening")) markReady();
    });
    child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[worker] ${chunk}`));
    child.once("spawn", () => {
      this.options.onEvent({
        kind: "worker.spawned",
        title: "Agent worker process started",
        detail: `Worker ${child.pid} started and is initializing its Restate endpoint.`,
        payload: { pid: child.pid, bootId: this.bootId, restartCount: this.restartCount },
      });
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.status = "offline";
      this.options.onEvent({
        kind: "worker.exited",
        title: "Agent worker exited",
        detail: `Worker ${child.pid} exited via ${signal ?? `code ${code ?? "unknown"}`}.`,
        payload: { pid: child.pid, bootId: this.bootId, code, signal },
      });
      if (!this.stopping) {
        this.restartCount += 1;
        this.status = "restarting";
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          this.start();
        }, this.restartDelay);
      }
    });
  }

  crash() {
    const child = this.child;
    if (!child?.pid) throw new Error("The agent worker is not currently running.");
    this.options.onEvent({
      kind: "worker.crash-requested",
      title: "Crash signal sent",
      detail: `SIGKILL sent to worker ${child.pid}.`,
      payload: { pid: child.pid, bootId: this.bootId },
    });
    child.kill("SIGKILL");
    return { pid: child.pid, bootId: this.bootId };
  }

  stop() {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.child?.kill("SIGTERM");
    this.child = null;
    this.status = "offline";
  }
}
