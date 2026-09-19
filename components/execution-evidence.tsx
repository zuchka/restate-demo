"use client";

import { useMemo } from "react";
import type { RunSnapshot, TimelineEvent } from "@contracts";

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

export function ExecutionEvidence({ snapshot }: { snapshot: RunSnapshot | null }) {
  const meaningfulJournal = useMemo(
    () => snapshot?.journal.filter((entry) => entry.name && entry.name !== "Checkpoint").slice(0, 12) ?? [],
    [snapshot?.journal],
  );
  const recentEvents = snapshot?.events.slice(-4).reverse() ?? [];
  const allEvents = snapshot?.events.slice().reverse() ?? [];

  return (
    <section className="panel execution-panel" aria-labelledby="execution-heading">
      <div className="panel-heading compact-heading execution-heading">
        <div>
          <span className="panel-index">03</span>
          <div>
            <p className="section-kicker">Live evidence</p>
            <h2 id="execution-heading">Execution</h2>
          </div>
        </div>
        {snapshot && <span className="event-count">{snapshot.events.length} events</span>}
      </div>

      {snapshot ? (
        <>
          <div className="metric-row">
            <div><strong>{snapshot.metrics.savedCheckpoints}</strong><span>checkpoints</span></div>
            <div><strong>{snapshot.metrics.toolRequests}</strong><span>tool requests</span></div>
            <div><strong>{snapshot.metrics.uniqueToolEffects}</strong><span>unique effects</span></div>
          </div>
          {meaningfulJournal.length > 0 && (
            <details className="journal-drawer">
              <summary>
                <span>Restate journal</span>
                <b>{snapshot.metrics.savedCheckpoints} saved</b>
              </summary>
              <div>
                {meaningfulJournal.map((entry) => (
                  <p key={`${entry.index}:${entry.name}`}>
                    <span>{entry.completed ? "✓" : "○"}</span>
                    <strong>{entry.name}</strong>
                    <small>#{entry.index}</small>
                  </p>
                ))}
              </div>
            </details>
          )}
          {recentEvents.length > 0 ? (
            <ol className="timeline" aria-label="Latest execution events">
              {recentEvents.map((event, index) => (
                <li key={event.sequence} className={`timeline-event timeline-event--${eventTone(event)} ${index === 0 ? "timeline-event--latest" : ""}`}>
                  <span className="event-glyph">{eventGlyph(event)}</span>
                  <div>
                    <span className="event-recency">{index === 0 ? "Latest" : "Earlier"}</span>
                    <div><strong>{event.title}</strong><time>{formatClock(event.occurredAt)}</time></div>
                    {event.detail && <p>{event.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="timeline-empty">Waiting for the first observation…</p>
          )}
          {allEvents.length > 4 && (
            <details className="event-history">
              <summary>Show all {allEvents.length} events</summary>
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
        </>
      ) : (
        <div className="timeline-placeholder">
          <span>↳</span>
          <p>The event timeline will show process exits, external requests, retries, and recovery.</p>
        </div>
      )}
    </section>
  );
}
