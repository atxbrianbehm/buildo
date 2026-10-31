import { useEffect, useRef, useState } from "react";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { readMetagrinderExtractStaging, stageMetagrinderExtract } from "../core/metagrinderExtractStaging";

type Staged = Awaited<ReturnType<typeof stageMetagrinderExtract>>;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Local review only: staged candidates never change the construction or reference snapshot. */
export function MetagrinderEvidenceReview({ onSave }: { onSave: (value: Staged) => void }) {
  const input = useRef<HTMLInputElement>(null), sequence = useRef(0);
  const [staged, setStaged] = useState<Staged | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [visible, setVisible] = useState(5);
  useEffect(() => () => { sequence.current++; }, []);
  async function open(file: File) {
    const token = ++sequence.current;
    if (file.size > MAX_FILE_BYTES) { setBusy(false); setError("This file is larger than 4 MiB. Choose a smaller extract or staged file."); return; }
    setBusy(true); setError(null);
    try {
      const value: unknown = JSON.parse(await file.text());
      const isStaged = value !== null && typeof value === "object" && "kind" in value && value.kind === "metagrinder-extract-staging";
      const next = isStaged ? await readMetagrinderExtractStaging(value) : await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION, artifact: value });
      if (sequence.current === token) { setStaged(next); setVisible(5); }
    } catch {
      if (sequence.current === token) setError("Could not open this extract or staged file. Check its format and choose it again; the previous extract is retained.");
    } finally { if (sequence.current === token) setBusy(false); }
  }
  return <details className="construction-research-review"><summary>Inspect research extract</summary>
    <section aria-label="Research evidence review">
      <p>Open a Metagrinder extract using the May 2026 format or a saved staged file. The format is declared, not verified; source, rights and historical accuracy still need review.</p>
      <div className="control-panel__actions"><button type="button" disabled={busy} onClick={() => input.current?.click()}>Open research file</button>
        <input ref={input} type="file" accept=".json,application/json" aria-label="Open research file input" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void open(file); }} />
        {staged ? <button type="button" disabled={busy} onClick={() => onSave(staged)}>Save staged file</button> : null}</div>
      {busy ? <p role="status">Opening research file…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {staged ? <><p role="status">{staged.candidates.length} architecture {staged.candidates.length === 1 ? "candidate" : "candidates"} · Unreviewed · Coverage unknown</p>
        <p>These candidates do not change the building or its reference snapshot. Save the staged file separately; it is not included when you save the building.</p>
        {staged.candidates.length ? <ol>{staged.candidates.slice(0, visible).map(candidate => <li key={candidate.claimId}>
          <p>{candidate.text}</p><p>{candidate.attributionMode} · extractor confidence {candidate.confidence} · unreviewed</p>
          <details><summary>Source identifiers</summary><p>Claim: {candidate.claimId}</p><p>Inputs: {candidate.sourceInputIds.join(", ")}</p><p>Chunks: {candidate.sourceChunkIds.join(", ")}</p></details>
        </li>)}</ol> : <p>No architecture-tagged candidates were found. This does not establish that architectural evidence is absent.</p>}
        {visible < staged.candidates.length ? <button type="button" onClick={() => setVisible(value => value + 5)}>Show more candidates</button> : null}</> : null}
    </section>
  </details>;
}
