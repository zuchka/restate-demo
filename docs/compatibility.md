# Compatibility and verification

## Intended stack

The repository declares exact package versions so a successful install produces a lockfile that can be rehearsed and preserved.

| Layer | Declared version | APIs used |
| --- | --- | --- |
| Node.js | 22.13 or newer | unflagged `node:sqlite`, built-in `fetch`, child supervision |
| Restate server and CLI | 1.7.9 | send/output/lookup ingress, admin actions, SQL introspection |
| Restate TypeScript SDK | 1.16.2 | services, `ctx.run`, retryable and terminal errors |
| Restate Vercel AI middleware | 0.4.0 | `durableCalls`, terminal tool-error propagation |
| Vercel AI SDK | 7.0.2 | `generateText`, tools, step preparation, model middleware |
| Anthropic provider | 4.0.17 | Claude model adapter and sequential tool calls |
| Next.js / React | 15.4.6 / 19.1.0 | App Router UI and same-origin route proxy |

The installed stack passes the full-project checks listed below. Preserve `pnpm-lock.yaml` for reproducible rehearsals; individual runtime scenarios still require their own evidence.

## Runtime contracts to verify

1. `restate-server --config-file` accepts `restate.toml` and stores data beneath its working directory.
2. `restate deployments register http://127.0.0.1:9080 --force --yes` registers `BreakMyAgent`.
3. `POST /restate/send/BreakMyAgent/run` returns an invocation ID.
4. `POST /restate/lookup` resolves the idempotency target after an ambiguous submission.
5. `GET /restate/output/:id` returns the handler output shape expected by `extractAnswer`.
6. `POST /query` exposes the selected `sys_invocation` columns and the documented `sys_journal` projection (`index`, `entry_type`, `name`, `version`, `entry_json`).
7. Pause, resume, cancel, and restart-as-new use the declared Admin API paths and response fields.
8. `durableCalls` and `rethrowTerminalToolError` match the AI SDK 7 tool lifecycle.
9. A worker crash during a tool call reuses a stable `toolCallId` on replay.
10. Seven-day journal and idempotency retention options are accepted by the SDK/server pair.

## Verification ladder

Run these in order after installation:

```bash
pnpm run doctor
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

In a second terminal:

```bash
pnpm test:recovery
```

Then manually verify one 429, one pause/resume, one cancel, and one restart-as-new. Record the invocation IDs and exact results in `docs/dx-notes.md`.

## Checks completed on 2026-09-19

Validated in `/Users/zuchka/code/break-my-agent` with Node.js 24.15.0:

- All 9 unit tests pass.
- Full-project TypeScript checking passes, including the worker and Next.js UI.
- ESLint passes without warnings.
- The production Next.js build passes.
- `pnpm run doctor` passes its blocking checks. It reports the existing local services occupying all five expected ports and a localhost controller-token warning.

Live `pnpm test:recovery` passed against the existing stack:

- Invocation: `inv_1jEQfE2vTRO00fhqtVGmPCCvZKMXyjRdob`.
- Worker PID: `63803` → `65324` after one recorded crash.
- Recovery observed after 4,210 ms; the same invocation returned an answer.
- Six saved checkpoints, three physical tool requests, two unique tool effects, and one deduplicated request.

This verifies the crash/replay path. The remaining unchecked lifecycle scenarios below have not been verified in this development pass.

Use `pnpm run doctor` explicitly: `pnpm doctor` invokes pnpm's built-in command instead of this project's environment check.

## Acceptance checklist

- [x] Environment doctor passes.
- [x] Unit tests pass.
- [x] Type checking, linting, and production build pass.
- [ ] Restate survives a complete stop/start with prior history intact.
- [x] Crash recovery finishes under the same invocation ID.
- [x] The worker PID changes after `SIGKILL`.
- [ ] Completed journal entries remain visible after recovery.
- [ ] A 429 produces one applied fault and a later physical request.
- [ ] Unique effects remain one when the same operation key repeats.
- [ ] Pause and resume are confirmed by observed runtime state.
- [ ] Cancel reaches a terminal cancelled outcome.
- [ ] Regenerate creates a child invocation and keeps the original.
- [ ] A browser refresh restores the selected run from recent history.
- [ ] The Restate UI link opens the intended invocation or is corrected for the installed UI version.

## Environment limitation during initial implementation

The implementation environment could not resolve the npm registry and did not already contain Restate or Anthropic SDK packages. Dependency installation, full-project type checking, build validation, and live Restate/Claude verification could therefore not be completed in that environment. This is an execution-environment limitation, not a Restate finding. That initial limitation is now resolved for installation and full-project checks on this machine. See the dated verification results above for the current evidence.
