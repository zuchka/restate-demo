import type { RunRecord, RunSnapshot, TimelineEvent } from "@contracts";
import { ExecutionEvidence } from "./execution-evidence";
import { selectRecoveryStory } from "./recovery-story";

function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 23 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;
}

function isBreakingEvent(event: TimelineEvent) {
  if (event.kind === "worker.exited") return true;
  if (event.kind !== "fault.applied") return false;
  return event.payload.kind === "rate-limit" || event.payload.kind === "server-error";
}

function BaselineExecution({ snapshot, run }: { snapshot: RunSnapshot | null; run: RunRecord | null }) {
  const events = snapshot?.events
    .filter((event) => event.invocationId === run?.invocationId)
    .sort((a, b) => a.sequence - b.sequence) ?? [];
  const breakingEvent = events.find(isBreakingEvent);
  const broken = Boolean(breakingEvent);
  const completed = !broken && run?.displayStatus === "completed";
  const stopped = broken || run?.displayStatus === "failed" || run?.displayStatus === "cancelled";
  const active = Boolean(run) && !completed && !stopped;
  const state = broken || stopped ? "stopped" : completed ? "complete" : active ? "active" : "idle";
  const acceptedEvent = events.find((event) => event.kind === "invocation.accepted") ?? events[0];
  const startedEvent = events.find((event) => event.kind.includes("attempt") && event.kind.includes("started"));
  const latestEvent = breakingEvent ?? events.at(-1);
  const failureLabel = breakingEvent?.kind === "worker.exited"
    ? "Worker died. Execution lost."
    : breakingEvent?.payload.kind === "rate-limit"
      ? "429 stopped the request."
      : breakingEvent?.payload.kind === "server-error"
        ? "500 stopped the request."
        : "Execution stopped.";

  const rows = !run ? [] : [
    {
      key: "accepted",
      title: "Request accepted",
      time: acceptedEvent?.occurredAt ?? run.createdAt,
      tone: "neutral",
      glyph: "·",
    },
    {
      key: "started",
      title: "Agent running in worker memory",
      time: startedEvent?.occurredAt ?? run.createdAt,
      tone: "neutral",
      glyph: "↻",
    },
    {
      key: "result",
      title: broken ? failureLabel : completed ? "Agent returned an answer" : stopped ? "Execution stopped" : "Agent working",
      time: latestEvent?.occurredAt ?? run.updatedAt,
      tone: broken || stopped ? "danger" : completed ? "success" : "neutral",
      glyph: broken || stopped ? "×" : completed ? "✓" : "",
    },
  ];

  return (
    <section className={`panel execution-panel execution-panel--baseline execution-panel--${state}${broken ? " baseline-execution--broken" : ""}`} aria-labelledby="baseline-execution-heading">
      <div className="panel-heading compact-heading execution-heading">
        <div>
          <span className="panel-index">A</span>
          <div>
            <p className="section-kicker">Process-bound execution</p>
            <h2 id="baseline-execution-heading">Without Restate</h2>
          </div>
        </div>
        <span className={`execution-state execution-state--${state}`}>{broken ? "Stopped" : completed ? "Completed" : active ? "Running" : "Ready"}</span>
      </div>

      <div className="execution-summary" aria-label="Baseline execution properties">
        <span><strong>0</strong> durable checkpoints</span>
        <span>State lives in the worker</span>
      </div>
      <div className={`execution-progress execution-progress--${state}`} aria-hidden="true"><span /></div>

      {rows.length > 0 ? (
        <ol className="timeline baseline-timeline" aria-label="Illustrative execution without Restate">
          {rows.map((row, index) => {
            const current = index === rows.length - 1;
            return (
              <li key={row.key} aria-current={current ? "step" : undefined} className={`timeline-event timeline-event--${row.tone} ${current ? "timeline-event--latest" : ""}`}>
                <span className="event-glyph">{current && active ? <span className="event-spinner" /> : row.glyph}</span>
                <div>
                  <span className="event-recency">{current ? broken ? "Execution ended" : active ? "Current step" : "Latest result" : "Previous"}</span>
                  <div><strong>{row.title}</strong><time>{formatClock(row.time)}</time></div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="timeline-placeholder"><span>↳</span><p>Start a run to compare process memory with durable execution.</p></div>
      )}

      <div className="execution-explanation">
        <strong>{broken ? "No recovery path." : "Progress depends on this process."}</strong>
        <p>{broken ? "The user sees an error and must start over. Completed work has no durable journal to replay." : "If the worker dies or an unhandled tool error occurs, the request loses its place."}</p>
        <span>User outcome · {broken ? "Something went wrong. Please retry." : completed ? "Gets the answer if nothing breaks." : "Waiting for the answer."}</span>
      </div>
    </section>
  );
}

export function ExecutionComparison({ snapshot, run, onCopyId, restateLink }: {
  snapshot: RunSnapshot | null;
  run: RunRecord | null;
  onCopyId: () => void;
  restateLink: string;
}) {
  const story = selectRecoveryStory(snapshot, run);

  return (
    <section className={`execution-comparison recovery-comparison--${story.tone}`} aria-labelledby="execution-comparison-heading">
      <div className="comparison-heading">
        <div>
          <p className="section-kicker">The durability difference</p>
          <h2 id="execution-comparison-heading">Same task. Same failure. Two outcomes.</h2>
        </div>
        <div className="comparison-tools">
          <span className="comparison-phase" role="status">{story.phase}</span>
          <div className="comparison-links">
            {run ? (
              <button type="button" className="invocation-id" onClick={onCopyId} title="Copy invocation ID">
                <span className="comparison-link-label">Invocation</span>
                {shortId(run.invocationId)} <span aria-hidden="true">⧉</span>
              </button>
            ) : (
              <span className="comparison-invocation-empty">Invocation starts with your first run</span>
            )}
            <a className={`restate-link restate-link--compact ${!run ? "restate-link--disabled" : ""}`} href={restateLink} target="_blank" rel="noreferrer">
              Open in Restate <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
      <div className="execution-comparison-grid">
        <BaselineExecution snapshot={snapshot} run={run} />
        <ExecutionEvidence snapshot={snapshot} story={story.durable} run={run} onCopyId={onCopyId} />
      </div>
    </section>
  );
}
