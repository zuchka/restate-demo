import type { RunRecord, RunSnapshot } from "@contracts";
import { selectRecoveryStory } from "./recovery-story";

export function RecoveryComparison({ snapshot, run, onCopyId }: {
  snapshot: RunSnapshot | null;
  run: RunRecord | null;
  onCopyId: () => void;
}) {
  const story = selectRecoveryStory(snapshot, run);
  return (
    <section className={`recovery-comparison recovery-comparison--${story.tone}`} aria-labelledby="comparison-heading">
      <div className="comparison-heading">
        <div><p className="section-kicker">The durability difference</p><h2 id="comparison-heading">{story.heading}</h2></div>
        <span className="comparison-phase" role="status">{story.phase}</span>
      </div>
      <div className="comparison-grid">
        <article className={`panel outcome-card outcome-card--baseline${story.baselineBroken ? " outcome-card--broken" : ""}`}>
          <div className="outcome-heading"><h3>Without Restate</h3><span>Illustrative baseline</span></div>
          <p className="outcome-title">{story.baseline.title}</p>
          <p className="outcome-description">{story.baseline.description}</p>
          <p className="baseline-note">In-memory execution, without durable recovery or application-owned retries.</p>
          <div className="outcome-user"><span>User outcome</span><p>{story.baseline.outcome}</p></div>
        </article>
        <article className="panel outcome-card outcome-card--durable">
          <div className="outcome-heading"><h3>With Restate</h3><span><i aria-hidden="true" />{snapshot ? "Observed execution" : "Durable execution"}</span></div>
          <p className="outcome-title">{story.durable.title}</p>
          <p className="outcome-description">{story.durable.description}</p>
          {story.proof.length > 0 && <dl className="recovery-proof">{story.proof.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
          {run && <details className="identity-details"><summary>{story.identity} <span className="identity-short">{run.invocationId.slice(0, 12)}…{run.invocationId.slice(-6)}</span></summary><span>Invocation ID · click to copy</span><button type="button" onClick={onCopyId} aria-label="Copy invocation ID">{run.invocationId} <span aria-hidden="true">⧉</span></button>{run.parentInvocationId && <><span>Regenerated from · different invocation</span><code>{run.parentInvocationId}</code></>}</details>}
          <div className="outcome-user"><span>User outcome</span><p>{story.durable.outcome}</p></div>
        </article>
      </div>
    </section>
  );
}
