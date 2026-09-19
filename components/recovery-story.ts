import type { RunRecord, RunSnapshot } from "@contracts";

export interface RecoveryStory {
  heading: string;
  phase: string;
  tone: "neutral" | "waiting" | "success" | "danger";
  identity: "Invocation ID" | "Same invocation" | "New invocation";
  baselineBroken: boolean;
  baseline: { title: string; description: string; outcome: string };
  durable: { title: string; description: string; outcome: string };
  proof: Array<{ label: string; value: string }>;
}

const memoryBaseline = {
  title: "Progress lives in the process.",
  description: "An in-memory agent depends on its worker staying alive, unless the application adds persistent recovery.",
  outcome: "Waiting for the answer.",
};

export function selectRecoveryStory(snapshot: RunSnapshot | null, selectedRun: RunRecord | null = null): RecoveryStory {
  const run = snapshot?.run ?? selectedRun;
  const story: RecoveryStory = {
    heading: run ? "Agent working. Introduce a failure." : "One failure. Two different outcomes.",
    phase: run ? "Watching execution" : "Ready to compare",
    tone: "neutral",
    identity: "Invocation ID",
    baselineBroken: false,
    baseline: { ...memoryBaseline, outcome: run ? "Waiting for the answer." : "Start a run to explore the difference." },
    durable: {
      title: "Progress has a durable home.",
      description: "Restate journals completed model and tool operations so execution can continue after a process failure.",
      outcome: run ? "Waiting for the answer." : "Give the agent a task, then try to break it.",
    },
    proof: [],
  };
  if (!run) return story;
  if (!snapshot) {
    story.heading = "Checking this invocation’s evidence.";
    story.phase = "Loading evidence";
    story.durable.outcome = "Waiting for the latest observed state.";
    return story;
  }

  const events = snapshot.events
    .filter((event) => event.invocationId === run.invocationId)
    .sort((a, b) => a.sequence - b.sequence);
  const incidentKinds = ["worker.crash-requested", "worker.exited", "fault.applied", "command.pause", "command.resume", "invocation.restarted-from"];
  const incident = events.filter((event) => incidentKinds.includes(event.kind)).at(-1);
  const completed = run.displayStatus === "completed" && Boolean(run.answer);
  const terminal = ["completed", "failed", "cancelled"].includes(run.displayStatus);
  const armed = snapshot.faults.find((fault) => fault.status === "armed");
  story.identity = incident && incident.kind !== "invocation.restarted-from"
    ? "Same invocation" : run.parentInvocationId ? "New invocation" : "Invocation ID";

  if (incident?.kind.startsWith("worker.")) {
    const exited = incident.kind === "worker.exited";
    // A later crash supersedes any earlier recovery, including its global metric.
    const recovered = exited ? events.find((event) =>
      event.sequence > incident.sequence && event.kind === "worker.recovery-observed" &&
      (!incident.payload.bootId || event.payload.bootId !== incident.payload.bootId),
    ) : undefined;
    story.heading = exited ? "Worker killed. What survives?" : "Crash requested. Watching the worker.";
    story.baseline = {
      title: "The request stops here.",
      description: "With progress held only in memory, a dead process loses its place. Your user has to try again.",
      outcome: "“Something went wrong. Please retry.”",
    };
    story.baselineBroken = exited;
    story.phase = recovered ? "Recovery observed" : exited ? "Recovery pending" : "Signal requested";
    story.tone = recovered ? "success" : "waiting";
    story.durable = {
      title: recovered ? "New worker. Same invocation." : exited ? "Worker stopped. Run retained." : "Waiting for the process to exit.",
      description: recovered
        ? "The supervisor started a replacement worker. Restate resumed the original invocation using its durable journal."
        : "The invocation is independent of the worker process. Watching for execution to resume on a replacement worker.",
      outcome: recovered ? "Work continues. No resubmission needed." : "Recovery is being checked. No new request needed.",
    };
    if (recovered) {
      const oldPid = incident.payload.pid;
      const newPid = recovered.payload.pid;
      if (typeof oldPid === "number" && typeof newPid === "number" && oldPid !== newPid) {
        story.proof.push({ label: "Worker replaced", value: `${oldPid} → ${newPid}` });
      }
      const recoveryMs = recovered.payload.recoveryMs;
      if (typeof recoveryMs === "number" && Number.isFinite(recoveryMs) && recoveryMs >= 0) {
        story.proof.push({ label: "Work resumed after", value: `${(recoveryMs / 1_000).toFixed(2)}s` });
      }
      if (completed) {
        story.phase = "Answer delivered";
        story.durable.title = "Worker gone. Work delivered.";
        story.durable.outcome = "Gets the answer. No resubmission.";
      }
    }
  } else if (incident?.kind === "fault.applied") {
    const kind = incident.payload.kind;
    const failedAttempt = snapshot.attempts.find((attempt) => attempt.id === incident.payload.attemptId);
    const retry = failedAttempt ? snapshot.attempts.find((attempt) =>
      attempt.invocationId === run.invocationId && attempt.operationKey === failedAttempt.operationKey &&
      attempt.id !== failedAttempt.id && attempt.startedAt >= (failedAttempt.completedAt ?? failedAttempt.startedAt) &&
      attempt.status === "succeeded",
    ) : undefined;
    if (kind === "latency") {
      const responded = failedAttempt?.status === "succeeded";
      story.heading = "Tool delayed. Does the work survive?";
      story.phase = responded ? "Tool response received" : "Latency applied";
      story.tone = responded ? "neutral" : "waiting";
      story.baseline = {
        title: "Slow does not mean broken.",
        description: "An in-memory request can also wait for a slow tool. Delay alone does not demonstrate lost work.",
        outcome: "Waits for the tool response.",
      };
      story.durable = {
        title: responded ? "Delayed. Still on track." : "Still waiting. Still durable.",
        description: "The invocation remains identifiable while the tool takes longer. Crash the worker during the delay to test recovery.",
        outcome: completed ? "The answer arrived after the delay." : "Waits for the tool response.",
      };
    } else if (kind === "rate-limit" || kind === "server-error") {
      const rateLimit = kind === "rate-limit";
      story.heading = rateLimit ? "Tool rate-limited. Who handles the retry?" : "Tool returned 500. Does everything restart?";
      story.phase = retry ? "Tool retry succeeded" : "Waiting for a successful retry";
      story.tone = retry ? "success" : "waiting";
      story.baseline = {
        title: rateLimit ? "A temporary limit. A failed request." : "One tool error stops the task.",
        description: "Without retry handling, this tool error interrupts the attempt. A fresh request may repeat earlier work.",
        outcome: rateLimit ? "“Too many requests. Try again later.”" : "“Something went wrong. Start again.”",
      };
      story.baselineBroken = true;
      story.durable = {
        title: retry ? "Retry succeeded. Work continues." : "Retry the interrupted operation.",
        description: "Restate retries the failed tool operation within its retry budget. Completed journaled results remain available.",
        outcome: retry && completed ? "Gets the answer without starting over." : "Waiting for the operation to recover.",
      };
      story.proof.push({ label: "Injected response", value: rateLimit ? "HTTP 429" : "HTTP 500" });
      if (retry) {
        story.proof.push({ label: "Same tool operation", value: "Retry succeeded" });
        if (completed) { story.durable.title = "Temporary error. Answer delivered."; story.phase = "Answer delivered"; }
      }
    }
  } else if (incident?.kind === "command.pause" || incident?.kind === "command.resume") {
    const resume = incident.kind === "command.resume";
    const resumed = resume && (run.displayStatus === "running" || run.displayStatus === "waiting" || run.displayStatus === "retrying" || completed);
    story.heading = "Pause the execution. Keep its place.";
    story.phase = resumed ? "Resume observed" : run.displayStatus === "paused" ? "Pause observed" : resume ? "Resume requested" : "Pause requested";
    story.tone = "waiting";
    story.baseline = {
      title: "Resumption needs saved state.",
      description: "An application must persist its progress and manage resumption to pause safely across process lifetimes.",
      outcome: "Depends on application-owned recovery.",
    };
    story.durable = {
      title: resumed ? "Resumed from the same invocation." : run.displayStatus === "paused" ? "Paused. Progress retained." : "Waiting for the lifecycle change.",
      description: "Restate manages the invocation’s lifecycle while retaining its identity and completed journaled work.",
      outcome: completed ? "The resumed invocation returned an answer." : resumed ? "Work continues from the retained invocation." : "The request remains available to resume.",
    };
  } else if (run.parentInvocationId) {
    story.heading = "A fresh run. A traceable history.";
    story.phase = "New invocation";
    story.baseline = { title: "A fresh request starts again.", description: "Regeneration is a new execution, with new model and tool work.", outcome: "Waits for a new answer." };
    story.durable = { title: "New invocation. Original preserved.", description: "This run has its own identity and a link to the original. Regeneration does not copy the old run’s progress.", outcome: completed ? "Gets a new answer, with the original still available." : "A new request is underway." };
  } else if (armed && !terminal) {
    story.heading = "Fault armed. Waiting for a tool call.";
    story.phase = "Armed · not yet applied";
    story.tone = "waiting";
    story.durable = { title: "No failure observed yet.", description: "The next matching tool request will receive the armed fault. The comparison will update when that actually happens.", outcome: "The agent is still working." };
  } else if (completed) {
    story.heading = "Answer delivered. Try a disruption next.";
    story.phase = "Completed";
    story.durable = { title: "The task is complete.", description: "This invocation returned an answer. Start another run and introduce a failure to see durable recovery in action.", outcome: "Gets the answer." };
    story.baseline.outcome = "An uninterrupted request can also complete.";
  }

  // Lifecycle/terminal outcomes override optimistic incident copy.
  if (run.displayStatus === "failed") {
    story.phase = "Failed"; story.tone = "danger";
    story.durable = { title: "This invocation could not finish.", description: "Durability does not guarantee a successful answer. A terminal error or exhausted retry budget can still end a run; the evidence remains inspectable.", outcome: "Needs attention. Review the error below." };
  } else if (run.displayStatus === "cancelled" || run.displayStatus === "cancelling") {
    const cancelled = run.displayStatus === "cancelled";
    story.heading = "Stop the execution. Keep the record.";
    story.phase = cancelled ? "Cancellation observed" : "Cancellation requested";
    story.tone = "neutral";
    story.baselineBroken = false;
    story.baseline = { title: "Stopping needs coordination.", description: "Stopping a process does not necessarily cancel work already sent to external systems.", outcome: "Previously completed effects may remain." };
    story.durable = { title: cancelled ? "Cancelled as requested." : "Waiting for cancellation.", description: "Restate coordinates invocation cancellation. External effects already completed are not rolled back.", outcome: cancelled ? "The run has stopped. History remains available." : "The cancellation request is being processed." };
  } else if (run.displayStatus === "paused" || run.displayStatus === "pause-requested") {
    story.phase = run.displayStatus === "paused" ? "Pause observed" : "Pause requested";
    story.tone = "waiting";
    story.durable.title = run.displayStatus === "paused" ? "Paused. Progress retained." : "Waiting for the pause.";
    story.durable.outcome = "Resume this invocation when you’re ready.";
  }
  if (snapshot.metrics.savedCheckpoints > 0) {
    story.proof.push({ label: "Checkpoints currently visible", value: String(snapshot.metrics.savedCheckpoints) });
  }
  if (snapshot.metrics.deduplicatedRequests > 0) {
    story.proof.push({ label: "Deduplicated requests · this run", value: String(snapshot.metrics.deduplicatedRequests) });
  }
  return story;
}
