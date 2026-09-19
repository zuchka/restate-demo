import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DemoDatabase } from "../../apps/controller/src/db.ts";

function createDatabase(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "break-my-agent-"));
  const database = new DemoDatabase(join(directory, "test.sqlite"));
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  database.insertRun({
    invocationId: "inv_test123",
    clientRequestId: "client-test-123",
    prompt: "Test prompt",
    promptHash: "hash",
    demoPacing: true,
    model: "test-model",
  });
  return database;
}

test("consumes a one-shot fault transactionally", (t) => {
  const database = createDatabase(t);
  database.createFault({
    id: "fault-1",
    invocationId: "inv_test123",
    kind: "rate-limit",
    target: "any-tool",
    status: "armed",
    remaining: 1,
    delayMs: null,
    createdAt: new Date().toISOString(),
    appliedAt: null,
  });

  const first = database.consumeFault("inv_test123", "save-note");
  const second = database.consumeFault("inv_test123", "save-note");

  assert.equal(first?.status, "applied");
  assert.equal(first?.remaining, 0);
  assert.equal(second, null);
  assert.equal(database.hasArmedFault("inv_test123"), false);
});

test("deduplicates external effects and associated writes", (t) => {
  const database = createDatabase(t);
  const first = database.commitEffect({
    operationKey: "inv_test123:tool-1",
    invocationId: "inv_test123",
    tool: "save-note",
    inputHash: "first-input",
    result: { saved: true, note: "checkpoint" },
    note: "checkpoint",
  });
  const replay = database.commitEffect({
    operationKey: "inv_test123:tool-1",
    invocationId: "inv_test123",
    tool: "save-note",
    inputHash: "first-input",
    result: { saved: true, note: "duplicate" },
    note: "duplicate",
  });

  assert.equal(first.deduplicated, false);
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(replay.result, first.result);
  assert.equal(database.countEffects("inv_test123"), 1);
  assert.deepEqual(database.listNotes("inv_test123").map((note) => note.content), ["checkpoint"]);
});

test("rejects an operation key reused with different input", (t) => {
  const database = createDatabase(t);
  database.commitEffect({
    operationKey: "inv_test123:tool-1",
    invocationId: "inv_test123",
    tool: "save-note",
    inputHash: "first-input",
    result: { saved: true },
  });

  assert.throws(
    () =>
      database.commitEffect({
        operationKey: "inv_test123:tool-1",
        invocationId: "inv_test123",
        tool: "save-note",
        inputHash: "different-input",
        result: { saved: true },
      }),
    /different tool input/,
  );
  assert.equal(database.countEffects("inv_test123"), 1);
});

test("deduplicates timeline observations by source event ID", (t) => {
  const database = createDatabase(t);
  const event = {
    sourceEventId: "source-event-1",
    invocationId: "inv_test123",
    source: "worker" as const,
    kind: "agent.step-finished",
    title: "Step complete",
    detail: null,
    payload: {},
  };

  assert.equal(database.appendEvent(event), true);
  assert.equal(database.appendEvent(event), false);
  assert.equal(database.getEvents("inv_test123").length, 1);
});
