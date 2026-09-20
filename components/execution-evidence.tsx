"use client";

import type { RunRecord, RunSnapshot, TimelineEvent } from "@contracts";

function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function eventGlyph(event: TimelineEvent) {
  if (event.kind.includes("recovery") || event.kind.includes("started")) return "↻";
  if (event.kind.includes("exited") || event.kind.includes("crash")) return "×";
  if (event.kind.includes("fault") || event.kind.includes("rate")) return "!";
  if (event.kind.includes("completed") || event.kind.includes("succeeded")) return "✓";
  if (event.kind.includes("tool")) return "◇";
  if (event.kind.includes("command")) return "→";
  return "·";
}

function eventTone(event: TimelineEvent) {
  if (event.kind.includes("recovery") || event.kind.includes("completed") || event.kind.includes("succeeded")) return "success";
  if (event.kind.includes("fault") || event.kind.includes("exited") || event.kind.includes("crash")) return "danger";
  if (event.kind.includes("retry") || event.kind.includes("pause") || event.kind.includes("delayed")) return "warning";
  return "neutral";
}

export function ExecutionEvidence({ snapshot, story, run, onCopyId }: {
  snapshot: RunSnapshot | null;
  story?: { title: string; description: string; outcome: string };
  run?: RunRecord | null;
  onCopyId?: () => void;
}) {
  const recentEvents = snapshot?.events.slice(-3).reverse() ?? [];
  const allEvents = snapshot?.events.slice().reverse() ?? [];
  const progressState = !snapshot
    ? "idle"
    : snapshot.run.displayStatus === "completed"
      ? "complete"
      : snapshot.run.displayStatus === "failed" || snapshot.run.displayStatus === "cancelled"
        ? "stopped"
        : snapshot.run.displayStatus === "paused" || snapshot.run.displayStatus === "pause-requested"
          ? "paused"
          : "active";

  return (
    <section className={`panel execution-panel execution-panel--restate execution-panel--${progressState}`} aria-labelledby="execution-heading">
      <div className="panel-heading compact-heading execution-heading">
        <div>
          <span className="panel-index">B</span>
          <div>
            <p className="section-kicker">Durable execution · live evidence</p>
            <h2 id="execution-heading">With Restate</h2>
          </div>
        </div>
        {snapshot && <span className="event-count">{snapshot.events.length} events</span>}
      </div>

      {snapshot ? (
        <>
          <div className="execution-summary" aria-label="Execution metrics">
            <span><strong>{snapshot.metrics.savedCheckpoints}</strong> checkpoints</span>
            <span><strong>{snapshot.metrics.toolRequests}</strong> tool requests</span>
            <span><strong>{snapshot.metrics.uniqueToolEffects}</strong> unique effects</span>
          </div>
          <div className={`execution-progress execution-progress--${progressState}`} aria-hidden="true">
            <span />
          </div>
          {recentEvents.length > 0 ? (
            <ol className="timeline" aria-label="Latest execution events">
              {recentEvents.map((event, index) => (
                <li
                  key={event.sequence}
                  aria-current={index === 0 ? "step" : undefined}
                  className={`timeline-event timeline-event--${eventTone(event)} ${index === 0 ? "timeline-event--latest" : ""}`}
                >
                  <span className="event-glyph">
                    {index === 0 && progressState === "active" ? <span className="event-spinner" /> : eventGlyph(event)}
                  </span>
                  <div>
                    <span className="event-recency">
                      {index === 0 ? progressState === "active" ? "Current step" : "Latest result" : "Previous"}
                    </span>
                    <div><strong>{event.title}</strong><time>{formatClock(event.occurredAt)}</time></div>
                    {event.detail && <p>{event.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="timeline-empty">Waiting for the first observation…</p>
          )}
          {allEvents.length > 3 && (
            <details className="event-history">
              <summary>
                <span>Full execution history</span>
                <b>{allEvents.length} events · {snapshot.metrics.savedCheckpoints} journaled</b>
              </summary>
              <ol>
                {allEvents.map((event) => (
                  <li key={event.sequence} className={`timeline-event--${eventTone(event)}`}>
                    <span className="event-glyph">{eventGlyph(event)}</span>
                    <div>
                      <div><strong>{event.title}</strong><time>{formatClock(event.occurredAt)}</time></div>
                      {event.detail && <p>{event.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {story && (
            <div className="execution-explanation execution-explanation--durable">
              <strong>{story.title}</strong>
              <p>{story.description}</p>
              <span>User outcome · {story.outcome}</span>
              {run && onCopyId && (
                <button type="button" onClick={onCopyId} title="Copy invocation ID">
                  Same durable ID · {run.invocationId.slice(0, 10)}…{run.invocationId.slice(-5)} <b aria-hidden="true">⧉</b>
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="timeline-placeholder">
            <span>↳</span>
            <p>The event timeline will show process exits, external requests, retries, and recovery.</p>
          </div>
          {story && <div className="execution-explanation execution-explanation--durable"><strong>{story.title}</strong><p>{story.description}</p><span>User outcome · {story.outcome}</span></div>}
        </>
      )}
    </section>
  );
}
