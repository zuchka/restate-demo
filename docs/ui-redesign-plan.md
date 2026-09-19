# UI redesign: make recovery the headline

## Layout

Keep the current typography, dark surfaces, lime accent, and restrained red error states. Reduce the hero's vertical footprint and put the existing prompt composer beside it: hero on the left, prompt on the right. Preserve presets, demo pacing, and the run action. Stack hero then composer on small screens.

Below the hero, show a compact selected-run/history row, then a full-width failure-control strip. Put two equal comparison cards immediately below the controls: **Without Restate** on the left and **With Restate** on the right. The response and detailed execution evidence follow underneath. Move the current bottom evidence summary into the With Restate card so it is visible at the moment it matters.

Use a shared incident heading, such as “Worker killed. What survives?”, to establish that both cards describe the same disruption. On narrow screens, keep the cards stacked in the same order. The comparison should be visible without scrolling past the answer or timeline.

## Comparison contract

Only the With Restate side is a live execution. Label the other side “Illustrative · in-memory execution, no durable recovery.” Explain the baseline once in supporting text. Do not show a fake second invocation, fabricated measurements, or claim that every application without Restate necessarily fails. Other systems can implement retries and persistence themselves.

Use direct user consequences rather than a sad-face illustration as the primary message. The baseline crash headline can be “The request stops here.” Supporting copy: “In-memory progress is lost. Your user has to try again.” Its consequence line is “User outcome: retry the request.”

For the durable side, use an observed sequence:

1. “Worker stopped. Invocation retained.”
2. “Work resumed on a replacement worker.”
3. “Answer delivered. Same invocation.”

Show a maximum of three or four concise evidence rows, with expandable technical details:

- Invocation ID: unchanged, with copy action.
- Worker PID: old → new, sourced from this run's events.
- Completed checkpoints: current observed count.
- Replay: a deduplicated tool request, only when observed.

Distinguish execution identity from worker identity. The local supervisor starts the replacement process; Restate resumes the durable invocation and reuses journaled results. Avoid saying Restate moved or restarted the worker in this architecture.

## Fault-specific stories

| Disruption | Illustrative baseline | With Restate, only as observed |
| --- | --- | --- |
| SIGKILL | In-memory execution stops; a fresh request is needed | Invocation retained → work observed on replacement worker → answer returned |
| 429 | Without retry handling, the tool error ends the request | Rate limit observed → retry scheduled/attempt observed → tool succeeds |
| 500 | Without retry handling, a failed tool call interrupts the request | Failed operation retried; completed journaled operations can be reused |
| Added latency | The request remains waiting; delay alone does not mean failure | The invocation remains pending; durability is demonstrated if the worker also dies |
| Pause/resume | Resumption requires application-owned persistent state | Pause requested → paused → resumed, with the same invocation |
| Cancel | Stop requested; external effects may already exist | Cancelling → cancelled; never celebrate cancellation as recovery or promise rollback |
| Regenerate | A fresh execution starts | A new invocation with a parent link; never label its ID unchanged |

Retry exhaustion or a terminal failure must produce an honest failed state on the With Restate side. Preserve any valid recovery evidence without saying the task completed.

## Interaction and state

- Before a run: compact neutral cards explaining what to watch; no success claims.
- While running: “Agent working. Introduce a failure to compare outcomes.”
- A fault button acknowledgement means “Armed for the next tool call,” not “Applied.”
- When the fault is consumed or the process exit is observed, expand the matching comparison story.
- Show recovery only after `worker.recovery-observed`; show delivered only after completion and an answer.
- Associate the story with the selected invocation and latest applied incident. For repeated incidents, correlate subsequent events to that incident; an earlier recovery must not satisfy a later crash.
- Keep the actual answer below the comparison. Retain the timeline and journal as inspectable supporting evidence.
- Use text and icons as well as color. Announce meaningful state changes politely, rather than every polling update.

## Implementation

1. Rearrange the composer and hero in `components/demo-app.tsx`; update responsive layout in `app/globals.css`.
2. Extract the failure strip and comparison cards into focused components.
3. Add a pure story selector deriving incident, phase, headline, and proof rows from `RunSnapshot`. Existing events, faults, attempts, journal, and run status provide most evidence; use invocation-scoped worker events rather than the global current worker PID for historical runs.
4. Handle missing evidence explicitly: “Checking recovery” or omit a metric. Never infer saved checkpoint survival merely from a count; only claim before/after retention when verified.
5. Add focused selector tests for armed versus applied faults, crash/recovery/completion, multiple crashes, terminal failure, cancellation, and regeneration.
6. Verify desktop and mobile layout, keyboard access, selection changes, and browser refresh. Rehearse a real crash and injected 429/500, checking card statements against the timeline.

## Acceptance

A viewer should be able to identify the disruption, understand the user consequence, and explain Restate's observed contribution without opening the timeline. The two sides must never look like two measured executions when only one actually ran.
