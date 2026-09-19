# Presenter script

## Before the call

1. Run `pnpm doctor` and resolve every blocking check.
2. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
3. Start `pnpm dev`, open the app, and complete one throwaway run.
4. Confirm the Restate UI opens and the worker PID appears in the header.
5. Reset `.data` only if you want a clean recent-run list, then restart and rehearse once.
6. Keep the browser and a terminal visible, but begin with the browser.

## Ninety-second core demo

### 1. Frame the idea

“An agent is a distributed application, not just an LLM loop. This is a generic prompt box, but the worker, model calls, tools, side effects, and lifecycle can all fail independently.”

### 2. Start a useful prompt

Choose **Rate limiting** and leave **Demo pacing** enabled. Point out that this is a real Claude request and that Restate immediately assigns the invocation ID shown in the footer.

### 3. Kill the worker

When the execution timeline shows a tool request, click **Crash worker**.

Say: “This sends a real `SIGKILL` to the isolated process. I am not killing the invocation and I am not simulating an error in React.”

Point to:

- the old worker PID disappearing and a new PID appearing;
- the page and controller remaining available;
- the same invocation ID staying in the footer;
- saved journal entries remaining in the execution panel.

### 4. Show recovery

Wait for new progress and the final answer.

Say: “The replacement worker starts the handler again. Restate returns completed durable results from the journal, then continues at unfinished work. The external tool also uses an operation key, because durable execution cannot make an arbitrary side effect exactly once by itself.”

Use the evidence footer to state only measured facts: number of worker crashes, saved checkpoints, tool requests, and duplicate effects prevented.

### 5. Open Restate

Click **Open in Restate** and show the invocation journal. Tie a named model or tool entry to the compact journal drawer in the demo UI.

## Failure-control encore

### HTTP 429

Start a new run and click **Rate limit** immediately. The next physical tool request receives a real `429` with `Retry-After`. Show the one-shot fault moving from armed to applied and the later retry succeeding.

Key line: “The fault lives outside the durable journal. If I journaled the decision to fail, replay could preserve that failure forever.”

### HTTP 500

Start another run and arm **Server error**. Show that only the unfinished tool operation retries; previously completed checkpoints remain.

### Added latency

Arm **Add latency**, wait for the delayed tool event, then crash the worker. Explain the external-effect uncertainty window if the controller completes the operation after the caller disappears.

### Pause and resume

Pause an active run. Distinguish **Pause requested** from observed **Paused**, then resume the same invocation.

Key line: “Pausing execution and losing a process are different events. Restate owns both lifecycle and recovery semantics.”

### Cancel and regenerate

Cancel an active run and wait for the terminal result. Regenerate only after a run is terminal. Point out that regeneration creates a fresh invocation and preserves the original history.

## Honest answers to likely questions

**Does Claude always avoid a duplicate API call after a crash?**

Only calls whose completed result reached the Restate journal are replayed from that journal. A request interrupted before completion can be retried and may still have provider-side cost.

**Is this exactly-once execution?**

The durable workflow provides replay-safe logical operations. External delivery can still repeat across an ambiguous failure window, so the demo tool implements idempotency and shows requests separately from unique effects.

**Why not use a Restate Virtual Object?**

Each prompt is an independent run with no keyed, single-writer conversation state. A service is the smallest correct abstraction. A conversational version could use a Virtual Object later.

**Why is the controller separate?**

The thing demonstrating the worker outage must survive that outage. It also gives us an external system where retries and idempotency are observable.

**Why not token streaming?**

The first release optimizes for legible durability evidence. Durable streaming is a useful follow-up, but step-level events keep the recovery story deterministic and small.

**What would change for production?**

Run the controller and workers as managed deployments, authenticate every control action, isolate users, put tool state in a production database, export telemetry, and remove the local process supervisor.

## Fallbacks

- If Anthropic is slow, use the limerick preset but keep demo pacing on.
- If the model completes before the crash, start a new run; never pretend the completed run recovered.
- If Restate is offline, show `pnpm doctor`, restart the stack, and explain which health indicator failed.
- If a lifecycle action is version-incompatible, do not improvise a UI simulation. Show the core crash recovery and name the compatibility finding.
- Keep one previously completed run in the recent list as a backup for explaining the journal and evidence model.
