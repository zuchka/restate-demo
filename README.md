# Break My Agent

**Ask an AI agent anything. Interrupt its work. Watch what survives.**

Break My Agent is a local, interactive Restate demo built with Next.js, TypeScript, the Vercel AI SDK, Anthropic Claude, and Restate. It deliberately exposes failure controls while a generic agent runs, then shows the evidence of durable recovery: the same invocation ID, restored journal entries, physical tool retries, and idempotent external effects.

## What the demo proves

- The agent worker can be terminated with a real `SIGKILL` without terminating the invocation.
- Restate resumes the same invocation after the supervisor starts a replacement worker.
- Completed model and tool operations remain in Restate's journal.
- A one-shot HTTP 429 or 500 causes bounded durable retry behavior.
- External effects use stable operation keys, so replayed requests do not duplicate writes.
- Pause, resume, cancel, and restart are real Restate lifecycle operations rather than UI simulations.
- Browser refreshes reconnect to runs stored by invocation ID.

The demo intentionally does **not** promise that an interrupted provider request can never be repeated or billed. Restate journals completed calls; idempotency at the external tool boundary handles the uncertainty window around side effects.

## Architecture

```text
Browser → Next.js proxy → Controller ──→ Restate server
                              │               │
                              │ supervises    │ invokes and replays
                              ↓               ↓
                       Agent worker ──→ Anthropic Claude
                              │
                              └── durable HTTP tools → Controller → SQLite
```

The controller survives worker crashes. It owns the child process, fault rules, timeline observations, Restate Admin API adapter, tool endpoints, and SQLite evidence store. Restate remains the execution scheduler and durable journal.

See [`docs/architecture.md`](docs/architecture.md) for boundaries and failure semantics.

## Requirements

- Node.js 22.13 or newer
- pnpm 9
- An Anthropic API key with access to the configured model
- Local ports `3000`, `3100`, `8080`, `9070`, and `9080`

Docker is not required. The project-managed Restate binary stores its data under `.data/restate`.

## Setup

```bash
cp .env.example .env.local
```

Replace the placeholder `ANTHROPIC_API_KEY`, then install and verify the environment:

```bash
pnpm install
pnpm run doctor
```

Start every service with one command:

```bash
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The Restate UI is available at [http://127.0.0.1:9070/ui](http://127.0.0.1:9070/ui).

The launcher starts Restate, starts the controller, lets the controller supervise the isolated worker, registers that worker, starts Next.js, and shuts the full process tree down together.

## Fast demo

1. Keep **Demo pacing** enabled and run the rate-limiting preset.
2. Click **Crash worker** while the timeline shows a tool request.
3. Point out the worker PID change and the unchanged invocation ID.
4. Watch the replacement worker continue from Restate's journal and return the answer.
5. Start another run, immediately arm **429**, and show the injected response followed by a retry.
6. Use **Pause**, **Resume**, then **Cancel** on another run to distinguish runtime lifecycle controls from process failure.

The full presenter script and recovery language are in [`docs/demo-script.md`](docs/demo-script.md).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Restate, controller, worker, and web UI |
| `pnpm run doctor` | Check versions, credentials, dependencies, storage, and ports |
| `pnpm test` | Run unit tests for parsing, idempotency, fault consumption, and state mapping |
| `pnpm test:recovery` | Spend one real model run to crash the worker and verify same-invocation recovery |
| `pnpm typecheck` | Check the full TypeScript project |
| `pnpm lint` | Run the Next.js ESLint rules |
| `pnpm build` | Create the production Next.js build |

Run `pnpm test:recovery` only while `pnpm dev` is running. It calls Claude and therefore incurs provider usage.

## Failure controls

| Control | Actual operation |
| --- | --- |
| Crash worker | Sends `SIGKILL` only to the supervised worker child, then restarts it |
| Rate limit | Returns one real `429` with `Retry-After` from the next tool request |
| Server error | Returns one real `500` from the next tool request |
| Add latency | Delays the next tool response by ten seconds |
| Pause / resume | Calls the Restate Admin API and waits for observed state |
| Cancel | Requests Restate cancellation; it does not roll back external effects |
| Regenerate | Restarts a terminal run as a new invocation and preserves the old run |

## Local data and safety

- Secrets remain server-side in `.env.local` and are ignored by Git.
- Next.js, the controller, Restate, and the worker bind explicitly to `127.0.0.1`.
- The controller accepts only allowlisted actions.
- Controller mutations require JSON, preventing browser “simple request” cross-origin posts.
- The crash endpoint accepts an invocation ID, never a PID or shell command.
- The calculator uses a bounded parser and never evaluates JavaScript.
- `.data/break-my-agent.sqlite` stores presentation evidence and tool effects.
- `.data/restate` stores the Restate journal.

Delete `.data` to reset all local demo history.

## Project map

```text
app/                     Next.js page and same-origin controller proxy
components/              Prompt, answer, timeline, and failure controls
apps/controller/         Supervisor, Restate adapter, tools, SQLite evidence
apps/worker/             Restate service and generic Claude agent
packages/contracts/      Shared request, state, event, and timeline types
scripts/                  Launcher, environment doctor, recovery verifier
tests/unit/               Deterministic safety and durability-boundary tests
docs/                     Architecture, presenter script, compatibility, DX log
```

## Known constraints

- Version one shows step-level progress rather than durable token streaming.
- The agent has notes and a calculator but no web access, retrieval, or arbitrary code execution.
- Fault injection targets the demo's external tool boundary, not Anthropic's network endpoint.
- This is a localhost presenter demo, not a hardened multi-tenant control plane.
- Full-project checks and a live crash-recovery run pass on this machine. Lifecycle and fault scenarios still need the remaining checks in [`docs/compatibility.md`](docs/compatibility.md).
