import assert from "node:assert/strict";
import test from "node:test";
import {
  extractAnswer,
  mapDisplayStatus,
  mapJournalRows,
} from "../../apps/controller/src/restate.ts";

test("maps Restate and local lifecycle state to honest display labels", () => {
  assert.equal(
    mapDisplayStatus({ rawStatus: "running", workerOnline: false }),
    "recovering",
  );
  assert.equal(
    mapDisplayStatus({
      rawStatus: "running",
      requestedStatus: "recovering",
      workerOnline: true,
    }),
    "recovering",
  );
  assert.equal(
    mapDisplayStatus({ rawStatus: "backing-off", workerOnline: true }),
    "retrying",
  );
  assert.equal(
    mapDisplayStatus({
      rawStatus: "running",
      requestedStatus: "pause-requested",
      workerOnline: true,
    }),
    "pause-requested",
  );
  assert.equal(
    mapDisplayStatus({
      rawStatus: "paused",
      requestedStatus: "pause-requested",
      workerOnline: true,
    }),
    "paused",
  );
  assert.equal(
    mapDisplayStatus({
      rawStatus: "completed",
      completionResult: "success",
      workerOnline: true,
    }),
    "completed",
  );
  assert.equal(
    mapDisplayStatus({
      rawStatus: "completed",
      completionFailure: "Invocation cancelled",
      workerOnline: true,
    }),
    "cancelled",
  );
});

test("extracts an answer from supported output shapes", () => {
  assert.equal(extractAnswer("plain response"), "plain response");
  assert.equal(extractAnswer({ answer: "structured response" }), "structured response");
  assert.equal(extractAnswer({ text: "text response" }), "text response");
  assert.equal(
    extractAnswer({ output: { answer: "nested response" } }),
    "nested response",
  );
  assert.equal(extractAnswer(null), null);
});

test("maps documented journal rows without relying on optional columns", () => {
  const entries = mapJournalRows([
    {
      index: 1,
      entry_type: "Command: Run",
      name: "Tool: save-note",
      version: 2,
      entry_json: '{"Command":{"Run":{"completion_id":4,"name":"Tool: save-note"}}}',
    },
    {
      index: 2,
      entry_type: "Notification: Run",
      name: "",
      version: 2,
      entry_json: { Notification: { Completion: { Run: { completion_id: 4 } } } },
    },
  ]);

  assert.equal(entries[0]?.name, "Tool: save-note");
  assert.equal(entries[0]?.completed, false);
  assert.equal(entries[1]?.name, "Notification: Run");
  assert.equal(entries[1]?.completed, true);
});
