# Restate developer-experience log

Use this as an evidence log for the interview. Keep observations precise, versioned, and separated from limitations of the local research environment.

## Implemented observations

### DX-001 — The AI integration has a clear conceptual boundary

**Status:** positive documentation and implementation observation; runtime verification pending.

The durable middleware can wrap the provider model without replacing the agent framework. That supports a strong explanation: Vercel AI SDK owns the agent loop and tool protocol; Restate owns durable execution, state, retries, and lifecycle. The code remains ordinary `generateText` plus tools.

**Evidence:** `apps/worker/src/index.ts` keeps model wrapping, tool definitions, and `ctx.run` boundaries visible rather than introducing a custom agent abstraction.

### DX-002 — A useful durability demo requires more than middleware

**Status:** architectural learning.

The model-call integration is compact, but a convincing crash demo also needs a separately supervised worker, an observer that survives it, durable server storage, and external-effect idempotency. A template focused on “break and recover an agent” could make these production responsibilities tangible.

**Potential contribution:** extract the supervisor, evidence timeline, and idempotent note tool into a small official example.

### DX-003 — Retry ownership needs deliberate configuration

**Status:** implementation question; runtime verification pending.

There can be retry policies in the AI SDK, durable middleware, `ctx.run`, and the invocation runtime. This repository disables the outer AI SDK retries, gives model middleware a small bound, configures tool retries explicitly, and sets an invocation policy in `restate.toml`.

**Question to test:** after an injected 429 and 500, can a developer quickly identify the retrying layer from the Restate UI and logs?

### DX-004 — Process failure and invocation lifecycle are easy to conflate

**Status:** product-education observation.

Crash, pause, cancel, kill, and restart are materially different. The demo gives each a separate control and uses transitional labels until runtime state is observed. This distinction became much clearer when the worker was moved out of the web process.

**Potential improvement:** a single lifecycle diagram in the invocation-management documentation showing process availability orthogonally to invocation state.

### DX-005 — External idempotency is the strongest teaching moment

**Status:** positive architecture observation; runtime verification pending.

Restate makes completed logical operations replay-safe, but the response-loss window around an external write still exists. Tracking physical requests beside unique effects prevents an exaggerated “exactly once” claim and demonstrates the correct application pattern.

**Evidence:** the controller atomically commits `operationKey`, result, and optional note; duplicate requests return the stored result.

### DX-006 — Introspection enables a product-quality evidence layer

**Status:** positive documentation observation; live schema verification pending.

`sys_invocation` and `sys_journal` make it possible to show actual runtime status and saved checkpoints rather than inventing progress in the UI. The journal adapter now limits itself to the documented 1.7 projection and treats unavailable introspection as missing evidence, not workflow failure.

**Question to test:** how stable are the selected columns and journal entry names across the pinned server/SDK pair?

### DX-007 — Admin acknowledgement is not the same as observed state

**Status:** implementation lesson.

Pause and cancel endpoints acknowledge commands before the application necessarily observes a stable paused or terminal state. The UI therefore says “Pause requested” and “Cancelling,” then reconciles from Restate.

**Potential improvement:** include expected transition behavior and cancellation boundaries beside each Admin API example.

### DX-008 — Local setup benefits from a first-party orchestration story

**Status:** implementation observation; runtime verification pending.

A realistic local demo has four moving pieces: server, deployment registration, service endpoint, and web/controller processes. `pnpm dev` now sequences health checks and registration, but compatibility still hinges on CLI flags and port conventions.

**Question to test:** does the current Restate CLI make an already-registered local endpoint idempotent and easy to update, or should the launcher use the Admin API directly?

### DX-009 — Initial package validation was blocked by the execution environment

**Status:** environment limitation, not Restate feedback.

The coding environment could not resolve the npm registry, and Restate packages were not already cached. Dependency-free unit tests, source syntax checks, and a strict typecheck of the controller layer passed, but no claim about full package compilation or runtime behavior should be presented as verified yet. The repository contains a doctor command and explicit verification ladder for the first network-enabled run.

### DX-010 — Local network defaults deserve explicit treatment

**Status:** documentation observation; mitigated in the demo configuration.

Restate 1.7 documents `0.0.0.0` as the default bind IP and automatic advertised-address discovery. That is useful for containers but surprising for a laptop demo whose controller assumes a localhost-only trust boundary. `restate.toml` now explicitly selects TCP, loopback binding, and a loopback advertised host.

**Potential improvement:** local quickstarts could call out their network exposure beside the first startup command, especially when the example includes unauthenticated Admin API access.

### DX-011 — The convenience server cannot select a bind address

**Status:** API ergonomics observation; mitigated with a documented lower-level API.

The TypeScript SDK's `serve` options expose a port but not a hostname. Keeping an unauthenticated local worker on loopback therefore requires replacing the one-line convenience call with Node's HTTP/2 server plus `createEndpointHandler`. The escape hatch is clean, but the security intent becomes less obvious than `serve({ host: "127.0.0.1" })` would be.

**Potential improvement:** add an optional bind-address setting to `serve`, or call out the `createEndpointHandler` pattern in local-security guidance.

## Experiment log

| Experiment | Invocation ID | Expected evidence | Result |
| --- | --- | --- | --- |
| First Claude completion |  | model, steps, final output | Pending |
| Worker crash during tool | `inv_1jEQfE2vTRO00fhqtVGmPCCvZKMXyjRdob` | old/new PID, same ID, preserved journal | 2026-09-19: recovery verifier passed; PID 63803 → 65324, recovery observed in 4,210 ms, answer returned under the same ID, 6 saved checkpoints, 3 tool requests / 2 unique effects / 1 deduplicated request. A before/after journal comparison remains pending. |
| One-shot 429 |  | fault applied once, retry delay, success | Pending |
| One-shot 500 |  | unfinished tool retries, checkpoints retained | Pending |
| Latency plus crash |  | request/effect counts across uncertainty window | Pending |
| Pause and resume |  | requested and observed states, same ID | Pending |
| Cancel while unavailable |  | acknowledgement, eventual terminal state | Pending |
| Restart as new |  | new ID, parent link, original preserved | Pending |
| Browser refresh |  | recent run and timeline restored | Pending |
| Restate restart |  | prior journal and output remain available | Pending |

## Interview-ready feedback format

For every final observation, bring the exact versions, goal, expected behavior, actual behavior, time spent, workaround, invocation ID, and one specific improvement. Include concrete praise as well as friction. Do not promote any pending row above to a finding until it is reproduced.
