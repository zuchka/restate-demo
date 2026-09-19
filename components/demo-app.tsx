"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  DisplayStatus,
  FaultKind,
  HealthSnapshot,
  RunAction,
  RunRecord,
  RunSnapshot,
  SubmitRunResponse,
} from "@contracts";
import { StatusDot } from "./status-dot";
import { Wordmark } from "./wordmark";
import { FailureControls } from "./failure-controls";
import { RecoveryComparison } from "./recovery-comparison";
import { ExecutionEvidence } from "./execution-evidence";
import { MarkdownResponse } from "./markdown-response";

type ControllerHealth = HealthSnapshot & { restateUiUrl: string };
const selectedRunStorageKey = "break-my-agent.selected-invocation";

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
  const snapshotRequestRef = useRef<AbortController | null>(null);
  const selectedInvocationRef = useRef(selectedInvocationId);

  useEffect(() => {
    selectedInvocationRef.current = selectedInvocationId;
    if (selectedInvocationId) {
      try { localStorage.setItem(selectedRunStorageKey, selectedInvocationId); } catch {}
    }
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
      let savedId: string | null = null;
      try { savedId = localStorage.getItem(selectedRunStorageKey); } catch {}
      const restored = result.runs.find((run) => run.invocationId === savedId);
      setSelectedInvocationId((current) => current ?? restored?.invocationId ?? result.runs[0]?.invocationId ?? null);
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

  const selectedRun = snapshot?.run ?? runs.find((run) => run.invocationId === selectedInvocationId) ?? null;
  const active = selectedRun ? !isTerminal(selectedRun.displayStatus) : false;
  const armedFault = snapshot?.faults.find((fault) => fault.status === "armed") ?? null;
  const restateLink = selectedInvocationId
    ? `${health?.restateUiUrl ?? "http://127.0.0.1:9070/ui"}/invocations/${selectedInvocationId}`
    : health?.restateUiUrl ?? "http://127.0.0.1:9070/ui";
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
    try {
      await navigator.clipboard.writeText(selectedInvocationId);
      setMessage("Invocation ID copied.");
    } catch {
      setError("Could not copy the ID. Select it from the execution identity details.");
    }
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

      <section className="hero-grid" aria-label="Start an agent run">
        <div className="hero">
          <p className="eyebrow"><span>Durability playground</span><span className="eyebrow-line" /></p>
          <h1>Break the worker.<br />Keep the promise.</h1>
          <p className="hero-copy">Give Claude a task. Introduce a failure.<br /> See what Restate saves when things break.</p>
        </div>
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
                rows={3}
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
                  <small>Adds time to try the failure controls</small>
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
      </section>

      {error && (
        <div className="notice notice--error" role="alert">
          <span>!</span>
          <p>{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}
      {message && !error && (
        <p className="activity-message" role="status">
          <span aria-hidden="true">↳</span>
          {message}
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss status">×</button>
        </p>
      )}

      <FailureControls
        active={active}
        workerOnline={health?.worker.status === "online"}
        busy={busyControl}
        armedFault={armedFault}
        availableActions={snapshot?.availableActions ?? []}
        onCrash={crashWorker}
        onFault={armFault}
        onAction={invokeAction}
      />
      <ExecutionEvidence snapshot={snapshot} />
      <RecoveryComparison snapshot={snapshot} run={selectedRun} onCopyId={copyInvocationId} />

      <article className="panel answer-panel answer-panel--wide">
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
          <MarkdownResponse>{selectedRun.answer}</MarkdownResponse>
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
        <a className={`restate-link ${!selectedInvocationId ? "restate-link--disabled" : ""}`} href={restateLink} target="_blank" rel="noreferrer">
          Open in Restate <span>↗</span>
        </a>
      </footer>
    </main>
  );
}
