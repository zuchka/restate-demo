import assert from "node:assert/strict";
import test from "node:test";
import type { RunSnapshot, TimelineEvent, ToolAttempt } from "@contracts";
import { selectRecoveryStory } from "../../components/recovery-story.ts";

const id = "inv_example";
function snapshot(): RunSnapshot {
  return {
    run: { invocationId: id, clientRequestId: "test", parentInvocationId: null, prompt: "Test", demoPacing: true, model: "test", rawStatus: "running", displayStatus: "running", answer: null, error: null, createdAt: "2026-09-19T10:00:00Z", updatedAt: "2026-09-19T10:00:00Z" },
    events: [], faults: [], attempts: [], journal: [], availableActions: [],
    metrics: { savedCheckpoints: 0, toolRequests: 0, uniqueToolEffects: 0, deduplicatedRequests: 0, workerCrashes: 0, recoveryMs: null },
  };
}
function event(sequence: number, kind: string, payload: Record<string, unknown> = {}): TimelineEvent {
  return { sequence, kind, payload, invocationId: id, sourceEventId: `event-${sequence}`, source: "controller", title: kind, detail: null, occurredAt: `2026-09-19T10:00:${String(sequence).padStart(2, "0")}Z` };
}
function attempt(overrides: Partial<ToolAttempt> = {}): ToolAttempt {
  return { id: "first", invocationId: id, operationKey: "op-one", tool: "save-note", status: "failed", httpStatus: 500, deduplicated: false, startedAt: "2026-09-19T10:00:01Z", completedAt: "2026-09-19T10:00:02Z", ...overrides };
}
function finish(s: RunSnapshot) { s.run.displayStatus = "completed"; s.run.answer = "Done."; return s; }

test("empty and loading states never claim an observed recovery", () => {
  assert.equal(selectRecoveryStory(null).phase, "Ready to compare");
  assert.equal(selectRecoveryStory(null, finish(snapshot()).run).phase, "Loading evidence");
});

test("an armed fault is not an applied fault", () => {
  const s = snapshot();
  s.faults.push({ id: "fault", invocationId: id, kind: "rate-limit", target: "any-tool", status: "armed", remaining: 1, delayMs: null, createdAt: s.run.createdAt, appliedAt: null });
  assert.equal(selectRecoveryStory(s).phase, "Armed · not yet applied");
  assert.equal(selectRecoveryStory(s).proof.length, 0);
  assert.equal(selectRecoveryStory(finish(s)).phase, "Completed");
});

test("crash acknowledgement, exit, recovery, and answer are distinct observations", () => {
  const s = snapshot();
  s.events.push(event(1, "worker.crash-requested", { pid: 100, bootId: "old" }));
  assert.equal(selectRecoveryStory(s).phase, "Signal requested");
  s.events.push(event(2, "worker.exited", { pid: 100, bootId: "old" }));
  assert.equal(selectRecoveryStory(s).phase, "Recovery pending");
  s.events.push(event(3, "worker.recovery-observed", { pid: 200, bootId: "new", recoveryMs: 4210 }));
  const recovered = selectRecoveryStory(s);
  assert.equal(recovered.phase, "Recovery observed");
  assert.deepEqual(recovered.proof, [{ label: "Worker replaced", value: "100 → 200" }, { label: "Work resumed after", value: "4.21s" }]);
  s.run.displayStatus = "completed";
  assert.equal(selectRecoveryStory(s).phase, "Recovery observed", "completion without output is not delivery");
  assert.equal(selectRecoveryStory(finish(s)).phase, "Answer delivered");
});

test("a second crash cannot reuse the first recovery or aggregate recovery metric", () => {
  const s = snapshot();
  s.events.push(event(1, "worker.exited", { pid: 100, bootId: "old" }), event(2, "worker.recovery-observed", { pid: 200, bootId: "new", recoveryMs: 4000 }), event(3, "worker.exited", { pid: 200, bootId: "new" }));
  s.metrics.recoveryMs = 4000;
  s.events.push(event(4, "worker.recovery-observed", { pid: 200, bootId: "new" }));
  assert.equal(selectRecoveryStory(s).phase, "Recovery pending");
  assert.equal(selectRecoveryStory(s).proof.length, 0);
});

test("ignores another invocation's events and tolerates unordered evidence", () => {
  const s = snapshot();
  s.events = [event(2, "worker.recovery-observed", { pid: 200, bootId: "new" }), event(1, "worker.exited", { pid: 100, bootId: "old" }), { ...event(3, "worker.exited"), invocationId: "inv_other" }];
  assert.equal(selectRecoveryStory(s).phase, "Recovery observed");
});

for (const kind of ["rate-limit", "server-error"]) {
  test(`${kind} succeeds only after the same operation retries successfully`, () => {
    const s = snapshot();
    s.events.push(event(2, "fault.applied", { kind, attemptId: "first" }));
    s.attempts.push(attempt(), attempt({ id: "unrelated", operationKey: "op-two", status: "succeeded", startedAt: "2026-09-19T10:00:03Z" }));
    assert.equal(selectRecoveryStory(s).phase, "Waiting for a successful retry");
    s.attempts.push(attempt({ id: "retry", status: "succeeded", httpStatus: 200, startedAt: "2026-09-19T10:00:04Z", completedAt: "2026-09-19T10:00:05Z" }));
    assert.equal(selectRecoveryStory(s).phase, "Tool retry succeeded");
    assert.equal(selectRecoveryStory(finish(s)).phase, "Answer delivered");
  });
}

test("a later applied fault supersedes an earlier recovered crash", () => {
  const s = snapshot();
  s.events.push(event(1, "worker.exited"), event(2, "worker.recovery-observed"), event(3, "fault.applied", { kind: "server-error" }));
  assert.equal(selectRecoveryStory(s).phase, "Waiting for a successful retry");
});

test("latency does not claim the baseline failed", () => {
  const s = snapshot();
  s.events.push(event(1, "fault.applied", { kind: "latency", attemptId: "first" }));
  assert.equal(selectRecoveryStory(s).baseline.title, "Slow does not mean broken.");
  assert.equal(selectRecoveryStory(s).phase, "Latency applied");
  s.attempts.push(attempt({ status: "succeeded" }));
  assert.equal(selectRecoveryStory(s).phase, "Tool response received");
});

test("terminal failure and cancellation override earlier recovery success", () => {
  const s = snapshot();
  s.events.push(event(1, "worker.exited"), event(2, "worker.recovery-observed"));
  s.run.displayStatus = "failed";
  assert.equal(selectRecoveryStory(s).tone, "danger");
  assert.equal(selectRecoveryStory(s).durable.title, "This invocation could not finish.");
  s.run.displayStatus = "cancelling";
  assert.equal(selectRecoveryStory(s).phase, "Cancellation requested");
  s.run.displayStatus = "cancelled";
  assert.equal(selectRecoveryStory(s).durable.title, "Cancelled as requested.");
  assert.match(selectRecoveryStory(s).durable.description, /not rolled back/);
});

test("pause and resume use observed lifecycle status", () => {
  const s = snapshot();
  s.events.push(event(1, "command.pause"));
  s.run.displayStatus = "pause-requested";
  assert.equal(selectRecoveryStory(s).phase, "Pause requested");
  s.run.displayStatus = "paused";
  assert.equal(selectRecoveryStory(s).phase, "Pause observed");
  s.events.push(event(2, "command.resume"));
  assert.notEqual(selectRecoveryStory(s).phase, "Resume observed");
  s.run.displayStatus = "running";
  assert.equal(selectRecoveryStory(s).phase, "Resume observed");
});

test("regeneration identifies a new invocation, even after completion", () => {
  const s = snapshot(); s.run.parentInvocationId = "inv_parent";
  s.events.push(event(1, "invocation.restarted-from"));
  assert.equal(selectRecoveryStory(s).phase, "New invocation");
  assert.equal(selectRecoveryStory(finish(s)).durable.title, "New invocation. Original preserved.");
});

test("missing journal data is omitted, not reported as zero preserved checkpoints", () => {
  const s = snapshot();
  assert.equal(selectRecoveryStory(s).proof.length, 0);
  s.metrics.savedCheckpoints = 6; s.metrics.deduplicatedRequests = 1;
  assert.deepEqual(selectRecoveryStory(s).proof, [{ label: "Checkpoints currently visible", value: "6" }, { label: "Deduplicated requests · this run", value: "1" }]);
});
