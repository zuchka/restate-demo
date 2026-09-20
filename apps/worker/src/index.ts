import { createHash } from "node:crypto";
import { createServer } from "node:http2";
import { anthropic } from "@ai-sdk/anthropic";
import * as restate from "@restatedev/restate-sdk";
import {
  durableCalls,
  rethrowTerminalToolError,
} from "@restatedev/vercel-ai-middleware";
import { findDemoPreset, type AgentRunInput, type ToolRequest, type WorkerObservation } from "@contracts";
import { generateText, stepCountIs, tool, wrapLanguageModel } from "ai";
import { z } from "zod";
import { loadLocalEnvironment } from "../../../scripts/env";

loadLocalEnvironment();

const controllerUrl = process.env.CONTROLLER_URL ?? "http://127.0.0.1:3100";
const controllerToken = process.env.CONTROLLER_INTERNAL_TOKEN ?? "local-demo-token";
const bootId = process.env.WORKER_BOOT_ID ?? "manual-worker";
const modelName = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const workerPort = Number(process.env.WORKER_PORT ?? 9_080);
const workerHost = process.env.WORKER_HOST ?? "127.0.0.1";
const demoToolDelay = Number(process.env.DEMO_TOOL_DELAY_MS ?? 2_200);

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

function observe(
  input: Omit<WorkerObservation, "bootId" | "pid" | "sourceEventId"> & {
    sourceEventId: string;
  },
) {
  void fetch(`${controllerUrl}/internal/worker-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-controller-token": controllerToken,
    },
    body: JSON.stringify({ ...input, bootId, pid: process.pid }),
  }).catch(() => undefined);
}

async function callExternalTool<TInput extends Record<string, unknown>, TResult>(
  ctx: restate.Context,
  input: AgentRunInput,
  toolName: "save-note" | "read-notes" | "calculate",
  toolCallId: string,
  toolInput: TInput,
) {
  const invocationId = ctx.request().id;
  const operationKey = `${invocationId}:${toolCallId}`;
  const request: ToolRequest<TInput> = {
    invocationId,
    operationKey,
    input: toolInput,
    pacingMs: input.demoPacing ? demoToolDelay : 0,
  };

  return ctx.run<TResult>(
    `Tool: ${toolName}`,
    async () => {
      const response = await fetch(`${controllerUrl}/tools/${toolName}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-controller-token": controllerToken,
        },
        body: JSON.stringify(request),
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 2);
        throw new restate.RetryableError("Tool rate limited", {
          retryAfter: { seconds: Number.isFinite(retryAfter) ? retryAfter : 2 },
        });
      }
      if (response.status >= 500) {
        throw new Error(`Tool service returned HTTP ${response.status}.`);
      }
      if (!response.ok) {
        throw new restate.TerminalError(
          `Tool request rejected (${response.status}): ${JSON.stringify(body)}`,
        );
      }
      return body as TResult;
    },
    {
      initialRetryInterval: { milliseconds: 400 },
      retryIntervalFactor: 1.6,
      maxRetryInterval: { seconds: 3 },
      maxRetryAttempts: 8,
    },
  );
}

function createAgentTools(ctx: restate.Context, input: AgentRunInput) {
  return {
    saveNote: tool({
      description:
        "Save a short, user-visible progress note about the task. Do not include hidden reasoning.",
      inputSchema: z.object({
        note: z.string().min(1).max(800).describe("A concise public progress note."),
      }),
      execute: async ({ note }, options) =>
        callExternalTool<{ note: string }, { saved: boolean; note: string }>(
          ctx,
          input,
          "save-note",
          options.toolCallId,
          { note },
        ),
    }),
    readNotes: tool({
      description: "Read the progress notes saved during this invocation.",
      inputSchema: z.object({}),
      execute: async (_toolInput, options) =>
        callExternalTool<Record<string, never>, { notes: Array<{ content: string }> }>(
          ctx,
          input,
          "read-notes",
          options.toolCallId,
          {},
        ),
    }),
    calculate: tool({
      description:
        "Evaluate arithmetic using numbers, parentheses, +, -, *, /, %, and ^.",
      inputSchema: z.object({
        expression: z.string().min(1).max(160),
      }),
      execute: async ({ expression }, options) =>
        callExternalTool<{ expression: string }, { expression: string; result: number }>(
          ctx,
          input,
          "calculate",
          options.toolCallId,
          { expression },
        ),
    }),
  };
}

async function runAgent(ctx: restate.Context, input: AgentRunInput) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new restate.TerminalError(
      "ANTHROPIC_API_KEY is not configured for the Break My Agent worker.",
    );
  }
  const preset = findDemoPreset(input?.presetId);
  if (!preset) {
    throw new restate.TerminalError("This invocation does not use an approved demo prompt.");
  }

  const invocationId = ctx.request().id;
  let observedStep = 0;
  observe({
    sourceEventId: `${bootId}:${invocationId}:handler-start`,
    invocationId,
    kind: "agent.attempt-started",
    title: "Agent attempt started",
    detail: `Worker ${process.pid} began or replayed the handler.`,
    payload: { model: input.model || modelName },
  });

  const durableModel = wrapLanguageModel({
    model: anthropic(input.model || modelName),
    middleware: durableCalls(ctx, { maxRetryAttempts: 3 }),
  });
  const tools = createAgentTools(ctx, input);

  const result = await generateText({
    model: durableModel,
    system: [
      "You are the helpful agent inside Break My Agent, a durability demonstration.",
      "Answer the user's request directly and concisely.",
      "You may save and read short public progress notes and use the calculator.",
      "Never put private chain-of-thought in a note. Notes must be safe to show verbatim.",
      "You have no web access. Say so if the request depends on current or unverifiable facts.",
      input.demoPacing
        ? "On the first step, save a one-sentence public task summary before doing anything else."
        : "Use tools only when they improve the answer.",
    ].join(" "),
    prompt: preset.prompt,
    tools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1_800,
    maxRetries: 0,
    prepareStep: ({ stepNumber }) =>
      input.demoPacing && stepNumber === 0
        ? {
            activeTools: ["saveNote"],
            toolChoice: { type: "tool", toolName: "saveNote" },
          }
        : undefined,
    providerOptions: {
      anthropic: { disableParallelToolUse: true },
    },
    onStepFinish: (step) => {
      rethrowTerminalToolError(step);
      const stepNumber = observedStep;
      observedStep += 1;
      observe({
        sourceEventId: `${bootId}:${invocationId}:step:${stepNumber}:${stableHash(step.finishReason)}`,
        invocationId,
        kind: "agent.step-finished",
        title: `Agent step ${stepNumber + 1} finished`,
        detail: "The model step completed or was restored from Restate's journal.",
        payload: {
          stepNumber,
          finishReason: step.finishReason,
          toolCalls: step.toolCalls.map((call) => call.toolName),
          usage: step.usage,
        },
      });
    },
  });

  observe({
    sourceEventId: `${bootId}:${invocationId}:handler-finished`,
    invocationId,
    kind: "agent.completed",
    title: "Agent returned an answer",
    detail: `${result.steps.length} model step${result.steps.length === 1 ? "" : "s"} completed.`,
    payload: { usage: result.usage, steps: result.steps.length },
  });

  return {
    answer: result.text,
    model: input.model || modelName,
    usage: result.usage,
    stepCount: result.steps.length,
  };
}

const agent = restate.service({
  name: "BreakMyAgent",
  handlers: { run: runAgent },
  options: {
    journalRetention: { days: 7 },
    idempotencyRetention: { days: 7 },
  },
});

const server = createServer(restate.createEndpointHandler({ services: [agent] }));

await new Promise<void>((resolvePromise, rejectPromise) => {
  const handleStartupError = (error: Error) => rejectPromise(error);
  server.once("error", handleStartupError);
  server.listen(workerPort, workerHost, () => {
    server.off("error", handleStartupError);
    resolvePromise();
  });
});

process.stdout.write(
  `Restate agent worker listening on ${workerHost}:${workerPort}\n`,
);
