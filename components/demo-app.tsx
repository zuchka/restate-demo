"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  DisplayStatus,
  FaultKind,
  HealthSnapshot,
  RunAction,
  RunRecord,
  RunSnapshot,
  SubmitRunResponse,
  TimelineEvent,
} from "@contracts";
import { StatusDot } from "./status-dot";
import { Wordmark } from "./wordmark";

type ControllerHealth = HealthSnapshot & { restateUiUrl: string };

const presets = [
  {
    label: "Rate limiting",
    prompt:
      "Compare fixed-window, sliding-window, and token-bucket rate limiting. Calculate requests per minute at 12 requests per second and recommend an approach.",
  },
  {
    label: "Launch copy",
    prompt:
      "Write a concise launch announcement for a developer tool that makes distributed workflows resilient, then give me three headline options.",
  },
  {
    label: "Limerick",
    prompt: "Write a limerick about distributed systems and explain the joke in one sentence.",
  },
];

const statusLabels: Record<DisplayStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  retrying: "Retrying",
  "pause-requested": "Pause requested",
  paused: "Paused",
  recovering: "Recovering",
  cancelling: "Cancelling",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  unknown: "Checking",
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
  }
  return body as T;
}

function isTerminal(status: DisplayStatus) {
  return ["completed", "cancelled", "failed"].includes(status);
}

function shortId(value: string) {
  return value.length > 23 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDuration(milliseconds: number) {
  return milliseconds < 1_000
    ? `${Math.round(milliseconds)}ms`
    : `${(milliseconds / 1_000).toFixed(1)}s`;
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
  if (event.kind.includes("recovery") || event.kind.includes("completed") || event.kind.includes("succeeded")) {
    return "success";
  }
  if (event.kind.includes("fault") || event.kind.includes("exited") || event.kind.includes("crash")) {
    return "danger";
  }
  if (event.kind.includes("retry") || event.kind.includes("pause") || event.kind.includes("delayed")) {
    return "warning";
  }
  return "neutral";
}

export function DemoApp() {
  const [prompt, setPrompt] = useState(presets[0].prompt);
  const [demoPacing, setDemoPacing] = useState(true);
  const [health, setHealth] = useState<ControllerHealth | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedInvocationId, setSelectedInvocationId] = useState<string | null>(null);
  const [storedSnapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const snapshot = storedSnapshot?.run.invocationId === selectedInvocationId ? storedSnapshot : null;
  const [submitting, setSubmitting] = useState(false);
  const [busyControl, setBusyControl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timelineRef = useRef<HTMLOListElement>(null);
  const snapshotRequestRef = useRef<AbortController | null>(null);
  const selectedInvocationRef = useRef(selectedInvocationId);

  useEffect(() => {
    selectedInvocationRef.current = selectedInvocationId;
    return () => {
      selectedInvocationRef.current = null;
    };
  }, [selectedInvocationId]);

  const loadHealth = useCallback(async () => {
    try {
      const nextHealth = await fetchJson<ControllerHealth>("/api/control/health");
      setHealth(nextHealth);
    } catch {
      setHealth(null);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const result = await fetchJson<{ runs: RunRecord[] }>("/api/control/runs");
      setRuns(result.runs);
      setSelectedInvocationId((current) => current ?? result.runs[0]?.invocationId ?? null);
    } catch {
      setRuns([]);
    }
  }, []);

  const loadSnapshot = useCallback(async (invocationId: string) => {
    if (invocationId !== selectedInvocationRef.current) return;
    snapshotRequestRef.current?.abort();
    const request = new AbortController();
    snapshotRequestRef.current = request;
    try {
      const nextSnapshot = await fetchJson<RunSnapshot>(`/api/control/runs/${invocationId}`, {
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      setSnapshot(nextSnapshot);
      setRuns((current) => {
        const withoutSelected = current.filter((run) => run.invocationId !== invocationId);
        return [nextSnapshot.run, ...withoutSelected].slice(0, 20);
      });
      return nextSnapshot;
    } catch (snapshotError) {
      if (request.signal.aborted) return;
      setError(snapshotError instanceof Error ? snapshotError.message : "Could not load the run.");
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadHealth(), loadRuns()]);
    const interval = window.setInterval(() => void loadHealth(), 2_000);
    return () => window.clearInterval(interval);
  }, [loadHealth, loadRuns]);

  useEffect(() => {
    if (!selectedInvocationId) {
      setSnapshot(null);
      return;
    }
    setSnapshot((current) =>
      current?.run.invocationId === selectedInvocationId ? current : null,
    );
    let disposed = false;
    let timeout: number | undefined;
    const poll = async () => {
      const latest = await loadSnapshot(selectedInvocationId);
      if (disposed) return;
      timeout = window.setTimeout(
        () => void poll(),
        latest && isTerminal(latest.run.displayStatus) ? 3_500 : 850,
      );
    };
    void poll();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      snapshotRequestRef.current?.abort();
    };
  }, [loadSnapshot, selectedInvocationId]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [selectedInvocationId, snapshot?.events.length]);

  const selectedRun = snapshot?.run ?? runs.find((run) => run.invocationId === selectedInvocationId) ?? null;
  const active = selectedRun ? !isTerminal(selectedRun.displayStatus) : false;
  const armedFault = snapshot?.faults.find((fault) => fault.status === "armed") ?? null;
  const restateLink = selectedInvocationId
    ? `${health?.restateUiUrl ?? "http://127.0.0.1:9070/ui"}/invocations/${selectedInvocationId}`
    : health?.restateUiUrl ?? "http://127.0.0.1:9070/ui";
  const meaningfulJournal = useMemo(
    () => snapshot?.journal.filter((entry) => entry.name && entry.name !== "Checkpoint").slice(0, 12) ?? [],
    [snapshot?.journal],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const result = await fetchJson<SubmitRunResponse>("/api/control/runs", {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: `run-${crypto.randomUUID()}`,
          prompt,
          demoPacing,
        }),
      });
      setSelectedInvocationId(result.invocationId);
      setMessage(result.deduplicated ? "Reconnected to the existing invocation." : "Durable invocation accepted.");
      await loadRuns();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not start the agent.");
    } finally {
      setSubmitting(false);
    }
  };

  const crashWorker = async () => {
    if (!selectedInvocationId) return;
    setBusyControl("crash");
    setError(null);
    try {
      await fetchJson("/api/control/worker/crash", {
        method: "POST",
        body: JSON.stringify({ invocationId: selectedInvocationId }),
      });
      setMessage("Worker terminated. Watching Restate recover the invocation…");
      await loadSnapshot(selectedInvocationId);
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : "Could not crash the worker.");
    } finally {
      setBusyControl(null);
    }
  };

  const armFault = async (kind: FaultKind) => {
    if (!selectedInvocationId) return;
    setBusyControl(kind);
    setError(null);
    try {
      await fetchJson(`/api/control/runs/${selectedInvocationId}/faults`, {
        method: "POST",
        body: JSON.stringify({ kind, target: "any-tool", delayMs: 10_000 }),
      });
      setMessage(`${kind.replaceAll("-", " ")} armed for the next tool request.`);
      await loadSnapshot(selectedInvocationId);
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : "Could not arm the fault.");
    } finally {
      setBusyControl(null);
    }
  };

  const invokeAction = async (action: RunAction) => {
    if (!selectedInvocationId) return;
    setBusyControl(action);
    setError(null);
    try {
      const result = await fetchJson<{ newInvocationId?: string }>(
        `/api/control/runs/${selectedInvocationId}/actions`,
        {
          method: "POST",
          body: JSON.stringify({ actionId: crypto.randomUUID(), action }),
        },
      );
      if (result?.newInvocationId) {
        setSelectedInvocationId(result.newInvocationId);
        setMessage("A fresh invocation was created. The original run is unchanged.");
      } else {
        setMessage(`${action[0].toUpperCase()}${action.slice(1)} requested.`);
        await loadSnapshot(selectedInvocationId);
      }
      await loadRuns();
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : `Could not ${action} the run.`);
    } finally {
      setBusyControl(null);
    }
  };

  const copyInvocationId = async () => {
    if (!selectedInvocationId) return;
    await navigator.clipboard.writeText(selectedInvocationId);
    setMessage("Invocation ID copied.");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <Wordmark />
        <div className="runtime-strip" aria-label="Runtime health">
          <span>
            <StatusDot status={health?.restate.status === "online" ? "online" : "offline"} />
            Restate
          </span>
          <span>
            <StatusDot status={health?.worker.status === "online" ? "online" : health ? "warning" : "offline"} />
            Worker {health?.worker.pid ? `#${health.worker.pid}` : "offline"}
          </span>
          <span>
            <StatusDot status={health?.anthropic.configured ? "online" : "warning"} />
            Claude
          </span>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow"><span>Durability playground</span><span className="eyebrow-line" /></p>
        <h1>Try to stop an AI agent<br />from finishing its task.</h1>
        <p className="hero-copy">
          Give Claude any prompt. Then kill its worker, slow its tools, rate-limit it,
          or pause the invocation. Restate keeps the execution alive.
        </p>
      </section>

      {(error || message) && (
        <div className={`notice ${error ? "notice--error" : "notice--success"}`} role="status">
          <span>{error ? "!" : "✓"}</span>
          <p>{error ?? message}</p>
          <button type="button" onClick={() => { setError(null); setMessage(null); }} aria-label="Dismiss message">×</button>
        </div>
      )}

      <section className="recent-runs" aria-label="Recent runs">
        <span className="section-kicker">Recent invocations</span>
        <div className="recent-run-list">
          {runs.length === 0 ? (
            <span className="muted">No runs yet</span>
          ) : (
            runs.slice(0, 6).map((run) => (
              <button
                type="button"
                key={run.invocationId}
                className={`recent-run ${selectedInvocationId === run.invocationId ? "recent-run--selected" : ""}`}
                onClick={() => setSelectedInvocationId(run.invocationId)}
              >
                <span className={`mini-status mini-status--${run.displayStatus}`} />
                <span>{run.prompt}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="workspace-grid">
        <div className="primary-column">
          <form className="panel composer" onSubmit={submit}>
            <div className="panel-heading">
              <div>
                <span className="panel-index">01</span>
                <div>
                  <p className="section-kicker">Agent input</p>
                  <h2>Ask anything</h2>
                </div>
              </div>
              <span className="model-badge">{health?.anthropic.model ?? "Claude"}</span>
            </div>
            <div className="preset-row" aria-label="Prompt presets">
              {presets.map((preset) => (
                <button type="button" key={preset.label} onClick={() => setPrompt(preset.prompt)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="prompt-field">
              <span className="sr-only">Agent prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                maxLength={6_000}
                placeholder="Ask Claude to plan, compare, calculate, explain…"
              />
              <span className="character-count">{prompt.length.toLocaleString()} / 6,000</span>
            </label>
            <div className="composer-footer">
              <label className="mode-toggle">
                <input
                  type="checkbox"
                  checked={demoPacing}
                  onChange={(event) => setDemoPacing(event.target.checked)}
                />
                <span className="toggle-track"><span /></span>
                <span>
                  <strong>Demo pacing</strong>
                  <small>Forces an initial checkpoint and slows tools</small>
                </span>
              </label>
              <button className="run-button" type="submit" disabled={submitting || !health?.ok || prompt.trim().length < 2}>
                <span>{submitting ? "Starting…" : "Run agent"}</span>
                <b aria-hidden="true">↗</b>
              </button>
            </div>
            {!health?.anthropic.configured && health && (
              <p className="setup-hint">Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> before running the agent.</p>
            )}
          </form>

          <article className="panel answer-panel">
            <div className="panel-heading answer-heading">
              <div>
                <span className="panel-index">02</span>
                <div>
                  <p className="section-kicker">Agent output</p>
                  <h2>Response</h2>
                </div>
              </div>
              {selectedRun && (
                <span className={`run-status run-status--${selectedRun.displayStatus}`}>
                  <span />{statusLabels[selectedRun.displayStatus]}
                </span>
              )}
            </div>
            {!selectedRun ? (
              <div className="answer-empty">
                <span className="empty-orbit"><i /><i /><i /></span>
                <h3>Your agent is standing by</h3>
                <p>Start a run, then use the controls while it works.</p>
              </div>
            ) : selectedRun.answer ? (
              <div className="answer-copy">{selectedRun.answer}</div>
            ) : (
              <div className="answer-progress">
                <span className="thinking-mark"><i /><i /><i /></span>
                <div>
                  <h3>{statusLabels[selectedRun.displayStatus]}</h3>
                  <p>
                    {selectedRun.displayStatus === "recovering"
                      ? "The worker is restarting. Completed journal entries remain available."
                      : selectedRun.displayStatus === "paused"
                        ? "No new work will begin until this invocation resumes."
                        : selectedRun.error ?? "Waiting for the durable invocation to return an answer."}
                  </p>
                </div>
              </div>
            )}
            {selectedRun?.error && selectedRun.displayStatus === "failed" && (
              <div className="inline-error">{selectedRun.error}</div>
            )}
          </article>
        </div>

        <aside className="secondary-column">
          <section className="panel execution-panel">
            <div className="panel-heading compact-heading">
              <div>
                <span className="panel-index">03</span>
                <div>
                  <p className="section-kicker">Live evidence</p>
                  <h2>Execution</h2>
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
                <ol className="timeline" ref={timelineRef}>
                  {snapshot.events.length === 0 && <li className="timeline-empty">Waiting for the first observation…</li>}
                  {snapshot.events.map((event) => (
                    <li key={event.sequence} className={`timeline-event timeline-event--${eventTone(event)}`}>
                      <span className="event-glyph">{eventGlyph(event)}</span>
                      <div>
                        <div><strong>{event.title}</strong><time>{formatClock(event.occurredAt)}</time></div>
                        {event.detail && <p>{event.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="timeline-placeholder">
                <span>↳</span>
                <p>The event timeline will show process exits, external requests, retries, and recovery.</p>
              </div>
            )}
          </section>

          <section className="panel chaos-panel">
            <div className="panel-heading compact-heading">
              <div>
                <span className="panel-index panel-index--danger">04</span>
                <div>
                  <p className="section-kicker section-kicker--danger">Interference</p>
                  <h2>Break it</h2>
                </div>
              </div>
              {armedFault && <span className="armed-badge">Armed</span>}
            </div>
            <button
              type="button"
              className="crash-button"
              disabled={!active || health?.worker.status !== "online" || busyControl !== null}
              onClick={crashWorker}
            >
              <span className="control-icon">×</span>
              <span><strong>{busyControl === "crash" ? "Crashing…" : "Crash worker"}</strong><small>Actually sends SIGKILL</small></span>
              <b>⌘</b>
            </button>
            <div className="fault-grid">
              <button type="button" disabled={!active || Boolean(armedFault) || busyControl !== null} onClick={() => armFault("rate-limit")}>
                <span className="control-icon">429</span><span><strong>Rate limit</strong><small>Next tool call</small></span>
              </button>
              <button type="button" disabled={!active || Boolean(armedFault) || busyControl !== null} onClick={() => armFault("server-error")}>
                <span className="control-icon">500</span><span><strong>Server error</strong><small>Next tool call</small></span>
              </button>
              <button type="button" disabled={!active || Boolean(armedFault) || busyControl !== null} onClick={() => armFault("latency")}>
                <span className="control-icon">+10s</span><span><strong>Add latency</strong><small>Next tool call</small></span>
              </button>
            </div>
            <div className="lifecycle-controls">
              <button type="button" disabled={!snapshot?.availableActions.includes("pause") || busyControl !== null} onClick={() => invokeAction("pause")}><span>Ⅱ</span>Pause</button>
              <button type="button" disabled={!snapshot?.availableActions.includes("resume") || busyControl !== null} onClick={() => invokeAction("resume")}><span>▶</span>Resume</button>
              <button type="button" disabled={!snapshot?.availableActions.includes("cancel") || busyControl !== null} onClick={() => invokeAction("cancel")}><span>□</span>Cancel</button>
              <button type="button" disabled={!snapshot?.availableActions.includes("restart") || busyControl !== null} onClick={() => invokeAction("restart")}><span>↻</span>Regenerate</button>
            </div>
            <p className="control-caption">
              Controls call the real worker supervisor, tool boundary, and Restate Admin API.
            </p>
          </section>
        </aside>
      </section>

      <footer className="evidence-bar">
        <div>
          <span className="section-kicker">Invocation</span>
          {selectedInvocationId ? (
            <button type="button" className="invocation-id" onClick={copyInvocationId} title="Copy invocation ID">
              {shortId(selectedInvocationId)} <span>⧉</span>
            </button>
          ) : (
            <span className="muted">Starts with your first run</span>
          )}
        </div>
        <div className="evidence-summary">
          {snapshot?.metrics.workerCrashes ? (
            <>
              <strong>
                {snapshot.metrics.recoveryMs === null ? "Recovery in progress" : "Agent recovered"}
              </strong>
              <span>{snapshot.metrics.workerCrashes} worker crash{snapshot.metrics.workerCrashes === 1 ? "" : "es"}</span>
              {snapshot.metrics.recoveryMs !== null && (
                <span>{formatDuration(snapshot.metrics.recoveryMs)} to resumed work</span>
              )}
              <span>{snapshot.metrics.savedCheckpoints} saved checkpoints</span>
              <span>{snapshot.metrics.deduplicatedRequests} duplicate effect{snapshot.metrics.deduplicatedRequests === 1 ? "" : "s"} prevented</span>
            </>
          ) : (
            <span>Evidence appears here after you interfere with a run.</span>
          )}
        </div>
        <a className={`restate-link ${!selectedInvocationId ? "restate-link--disabled" : ""}`} href={restateLink} target="_blank" rel="noreferrer">
          Open in Restate <span>↗</span>
        </a>
      </footer>
    </main>
  );
}
