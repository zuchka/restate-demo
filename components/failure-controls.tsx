import type { FaultKind, FaultRecord, RunAction } from "@contracts";

export function FailureControls({ active, workerOnline, busy, armedFault, availableActions, onCrash, onFault, onAction }: {
  active: boolean;
  workerOnline: boolean;
  busy: string | null;
  armedFault: FaultRecord | null;
  availableActions: RunAction[];
  onCrash: () => void;
  onFault: (kind: FaultKind) => void;
  onAction: (action: RunAction) => void;
}) {
  return (
    <section className="failure-strip" aria-labelledby="failure-heading">
      <div className="failure-intro"><p className="section-kicker">Introduce a failure</p><h2 id="failure-heading">Break it.</h2></div>
      <div className="failure-buttons">
        <button type="button" className="failure-crash" disabled={!active || !workerOnline || busy !== null} onClick={onCrash}><span aria-hidden="true">×</span><span>{busy === "crash" ? "Crashing…" : "Crash worker"}<small>Real SIGKILL</small></span></button>
        {([
          ["rate-limit", "429", "Rate limit"],
          ["server-error", "500", "Server error"],
          ["latency", "+10s", "Add latency"],
        ] as const).map(([kind, glyph, label]) => <button type="button" key={kind} disabled={!active || Boolean(armedFault) || busy !== null} onClick={() => onFault(kind)}><span className="failure-code" aria-hidden="true">{glyph}</span><span>{label}<small>Next tool call</small></span></button>)}
      </div>
      <div className="failure-lifecycle" aria-label="Invocation lifecycle">
        {([
          ["pause", "Ⅱ", "Pause"], ["resume", "▶", "Resume"], ["cancel", "□", "Cancel"], ["restart", "↻", "Regenerate"],
        ] as const).map(([action, glyph, label]) => <button type="button" key={action} disabled={!availableActions.includes(action) || busy !== null} onClick={() => onAction(action)}><span aria-hidden="true">{glyph}</span>{label}</button>)}
      </div>
      {armedFault && <p className="fault-armed" role="status">{armedFault.kind === "rate-limit" ? "429" : armedFault.kind === "server-error" ? "500" : "Latency"} armed — waiting for the next matching tool call.</p>}
    </section>
  );
}
