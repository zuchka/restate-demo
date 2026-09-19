# Break My Agent — developer-experience log

Started September 19, 2026. Status: the full demo is implemented; dependency installation and live Restate/Claude verification remain pending because this coding environment could not resolve the npm registry.

The canonical implementation-aware log is maintained in `docs/dx-notes.md`. It now covers architecture boundaries, retry ownership, lifecycle semantics, external-effect idempotency, introspection, setup orchestration, and explicit localhost binding.

## How to record useful feedback

For each observation, capture:

- Status: question, documentation observation, reproduced behavior, resolved, or proposed improvement.
- Exact server, SDK, middleware, model-provider, AI SDK, Node, and template revision versions.
- Goal and the documentation entry point used.
- Expected behavior and actual behavior.
- Small reproduction and relevant invocation ID, logs, or screenshot.
- Time spent and workaround.
- A specific improvement that would help another developer.

Keep praise equally concrete: record what made setup, debugging, or explanation easier. Do not turn an untested assumption into interview feedback.

## Initial observations

### DX-001 — Integration entry points are discoverable

**Status:** positive documentation observation.

The Vercel AI SDK integration page links a quickstart, examples, a Next.js template, and agent patterns. This gives us several useful starting points. Next step: record which path produces the first successful Claude invocation fastest and what changes the generic demo requires.

[Integration page](https://docs.restate.dev/ai/sdk-integrations/vercel-ai-sdk).

### DX-002 — Ingress route examples depend on server generation

**Status:** documentation observation; not a defect.

The HTTP guide documents `/restate/send/...` and `/restate/call/...`, while explicitly identifying older route forms for Restate 1.6 and earlier. The adapter and setup guide should state the tested server version, especially when borrowing snippets from different examples.

**Potential improvement to evaluate:** a prominent compatibility matrix across an agent template's server, TypeScript SDK, middleware, and AI SDK dependencies.

[HTTP guide](https://docs.restate.dev/services/invocation/http).

### DX-003 — Retry defaults require checking the installed configuration

**Status:** documentation question.

Different documentation contexts discuss indefinite retries and a configured finite invocation policy that eventually pauses. The main error-handling guide distinguishes run-level and invocation-level policies. For this demo we will set explicit policies, record the actual configuration, and test which layer retried an injected failure.

**Question to investigate:** can a new user readily tell whether a retry comes from the AI SDK, middleware, a Restate run block, or invocation policy?

[Error-handling guide](https://docs.restate.dev/guides/error-handling), [TypeScript durable steps](https://docs.restate.dev/develop/ts/durable-steps).

### DX-004 — Pause, cancel, kill, and restart need a shared mental model

**Status:** design question prompted by documentation.

The demo needs distinct buttons and lifecycle states. We must measure pause and cancellation during in-flight calls rather than infer instant termination from an administrative response. Restart-as-new produces a new identity, with optional journal-prefix reuse; process crashes are separate from invocation termination.

**Potential improvement to evaluate:** a single interactive lifecycle example with observable request/acknowledgement/completion transitions.

[Invocation management](https://docs.restate.dev/services/invocation/managing-invocations), [restart API](https://docs.restate.dev/admin-api/invocation/restart-invocation-as-new).

### DX-005 — Hooks offer promising evidence for replay behavior

**Status:** positive documentation observation; runtime verification pending.

The hook guide explicitly distinguishes handler attempts from actual run-block execution. That distinction could support a helpful teaching interface: logical checkpoints alongside physical attempts. Verify installed support and how middleware-generated model calls are named before committing to the timeline adapter.

[Hooks](https://docs.restate.dev/develop/ts/hooks), [introspection](https://docs.restate.dev/services/introspection).

### DX-006 — Durable execution and external effects deserve separate counters

**Status:** architectural lesson to validate, not product criticism.

Build a note tool that records received HTTP attempts and unique committed writes. Crash after the write but before its response. Show what Restate preserves and what the external tool's idempotency mechanism contributes.

**Potential educational contribution:** a compact agent example that demonstrates the uncertainty window directly, with accurate UI labels and a repeatable test.

[Database integration](https://docs.restate.dev/guides/databases).

### DX-007 — Documentation retrieval encountered tool-specific limitations

**Status:** research environment observation; attribution uncertain.

Several `.md` documentation URLs returned an unsupported `text/markdown` error in this session's web reader. The corresponding HTML pages were readable. This may be a reader limitation rather than a Restate documentation issue; do not present it as a Restate bug without reproducing the problem in the intended developer tooling.

## Runtime experiments to append

| Experiment | Evidence to capture | Status |
| --- | --- | --- |
| First real Claude response | Versions, startup steps, elapsed setup time | Pending |
| First worker crash recovery | Original/new PIDs, invocation ID, journal before/after | Pending |
| Injected 429 | HTTP attempts, retry owner, measured delay | Pending |
| Pause during model request | Requested and observed states; provider request result | Pending |
| Cancellation while worker unavailable | Acknowledgement and eventual terminal state | Pending |
| Full restart and prefix restart | Identity, retained work, repeated operations | Pending |
| Browser and controller restart | Restored history; missing or duplicate observations | Pending |
| External write before lost response | Attempt count versus unique effect count | Pending |

## Before the interview

Select three to five verified observations. For each, be ready to show the reproduction, explain its impact on a developer, and offer a small improvement. Keep unresolved questions labeled as questions.
