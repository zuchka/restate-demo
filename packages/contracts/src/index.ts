export const faultKinds = ["rate-limit", "server-error", "latency"] as const;
export type FaultKind = (typeof faultKinds)[number];

export const faultTargets = ["any-tool", "save-note", "read-notes", "calculate"] as const;
export type FaultTarget = (typeof faultTargets)[number];

export const runActions = ["pause", "resume", "cancel", "restart"] as const;
export type RunAction = (typeof runActions)[number];

export const demoPresets = [
  {
    id: "rate-limiting",
    label: "Rate limiting",
    prompt:
      "Compare fixed-window, sliding-window, and token-bucket rate limiting. Calculate requests per minute at 12 requests per second and recommend an approach.",
  },
  {
    id: "launch-copy",
    label: "Launch copy",
    prompt:
      "Write a concise launch announcement for a developer tool that makes distributed workflows resilient, then give me three headline options.",
  },
  {
    id: "limerick",
    label: "Limerick",
    prompt: "Write a limerick about distributed systems and explain the joke in one sentence.",
  },
] as const;

export type DemoPreset = (typeof demoPresets)[number];
export type DemoPresetId = DemoPreset["id"];

export function findDemoPreset(value: unknown): DemoPreset | undefined {
  return typeof value === "string"
    ? demoPresets.find((preset) => preset.id === value)
    : undefined;
}

export type WorkerState = "starting" | "online" | "offline" | "restarting";

export type DisplayStatus =
  | "queued"
  | "running"
  | "waiting"
  | "retrying"
  | "pause-requested"
  | "paused"
  | "recovering"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed"
  | "unknown";

export interface AgentRunInput {
  presetId: DemoPresetId;
  demoPacing: boolean;
  model: string;
}

export interface RunRecord {
  invocationId: string;
  clientRequestId: string;
  parentInvocationId: string | null;
  prompt: string;
  demoPacing: boolean;
  model: string;
  rawStatus: string;
  displayStatus: DisplayStatus;
  answer: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  sequence: number;
  sourceEventId: string;
  invocationId: string | null;
  source: "controller" | "worker" | "tool" | "restate";
  kind: string;
  title: string;
  detail: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface FaultRecord {
  id: string;
  invocationId: string;
  kind: FaultKind;
  target: FaultTarget;
  status: "armed" | "applied" | "expired";
  remaining: number;
  delayMs: number | null;
  createdAt: string;
  appliedAt: string | null;
}

export interface ToolAttempt {
  id: string;
  invocationId: string;
  operationKey: string;
  tool: Exclude<FaultTarget, "any-tool">;
  status: "started" | "succeeded" | "failed" | "rate-limited";
  httpStatus: number | null;
  deduplicated: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface JournalEntry {
  index: number;
  name: string;
  commandType: string;
  completed: boolean;
  raw: Record<string, unknown>;
}

export interface RunSnapshot {
  run: RunRecord;
  events: TimelineEvent[];
  faults: FaultRecord[];
  attempts: ToolAttempt[];
  journal: JournalEntry[];
  metrics: {
    savedCheckpoints: number;
    toolRequests: number;
    uniqueToolEffects: number;
    deduplicatedRequests: number;
    workerCrashes: number;
    recoveryMs: number | null;
  };
  availableActions: RunAction[];
}

export interface HealthSnapshot {
  ok: boolean;
  controller: { status: "online"; databasePath: string };
  worker: {
    status: WorkerState;
    pid: number | null;
    bootId: string | null;
    restartCount: number;
  };
  restate: { status: "online" | "offline"; adminUrl: string; ingressUrl: string };
  anthropic: { configured: boolean; model: string };
  timestamp: string;
}

export interface SubmitRunRequest {
  clientRequestId: string;
  presetId: DemoPresetId;
  demoPacing: boolean;
}

export interface SubmitRunResponse {
  invocationId: string;
  accepted: boolean;
  deduplicated: boolean;
}

export interface ArmFaultRequest {
  kind: FaultKind;
  target?: FaultTarget;
  delayMs?: number;
}

export interface RunActionRequest {
  actionId: string;
  action: RunAction;
}

export interface WorkerObservation {
  sourceEventId: string;
  invocationId: string | null;
  kind: string;
  title: string;
  detail?: string;
  bootId: string;
  pid: number;
  payload?: Record<string, unknown>;
}

export interface ToolRequest<TInput = Record<string, unknown>> {
  invocationId: string;
  operationKey: string;
  input: TInput;
  pacingMs: number;
}
