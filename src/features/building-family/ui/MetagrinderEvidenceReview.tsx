import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { METAGRINDER_EXTRACT_REVISION } from "../contracts/metagrinderExtractStaging";
import { readMetagrinderExtractStaging, stageMetagrinderExtract } from "../core/metagrinderExtractStaging";
import { createConstructionEvidenceProposal, readConstructionEvidenceProposal } from "../core/constructionEvidenceProposal";
import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";

type Staged = Awaited<ReturnType<typeof stageMetagrinderExtract>>;
type Proposal = Awaited<ReturnType<typeof createConstructionEvidenceProposal>>;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Local review only: staged candidates never change the construction or reference snapshot. */
export function MetagrinderEvidenceReview({ onSave, graph, onSaveProposal, onApplyProposal, applicationLocked, appliedProposalHash }: { onSave: (value: Staged) => void; graph?: BayConstructionGraph | null; onSaveProposal?: (value: Proposal) => void; onApplyProposal?: (value: Proposal) => void; applicationLocked?: boolean; appliedProposalHash?: string }) {
  const input = useRef<HTMLInputElement>(null), sequence = useRef(0);
  const proposalInput = useRef<HTMLInputElement>(null), graphRef = useRef(graph), proposalSequence = useRef(0);
  const [staged, setStaged] = useState<Staged | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [visible, setVisible] = useState(5);
  const [claimId, setClaimId] = useState(""), [head, setHead] = useState<"" | "flat" | "round">(""), [proposal, setProposal] = useState<Proposal | null>(null), [proposalBusy, setProposalBusy] = useState(false), [proposalError, setProposalError] = useState<string | null>(null);
  useLayoutEffect(() => { graphRef.current = graph; }, [graph]);
  useEffect(() => () => { sequence.current++; proposalSequence.current++; }, []);
  async function open(file: File) {
    const token = ++sequence.current;
    if (file.size > MAX_FILE_BYTES) { setBusy(false); setError("This file is larger than 4 MiB. Choose a smaller extract or staged file."); return; }
    setBusy(true); setError(null);
    try {
      const value: unknown = JSON.parse(await file.text());
      const isStaged = value !== null && typeof value === "object" && "kind" in value && value.kind === "metagrinder-extract-staging";
      const next = isStaged ? await readMetagrinderExtractStaging(value) : await stageMetagrinderExtract({ schemaVersion: "0.1.0", kind: "metagrinder-extract-staging-request", declaredProducerRevision: METAGRINDER_EXTRACT_REVISION, artifact: value });
      if (sequence.current === token) { proposalSequence.current++; setProposalBusy(false); setStaged(next); setVisible(5); setClaimId(""); setHead(""); setProposal(null); setProposalError(null); }
    } catch {
      if (sequence.current === token) setError("Could not open this extract or staged file. Check its format and choose it again; the previous extract is retained.");
    } finally { if (sequence.current === token) setBusy(false); }
  }
  async function propose() {
    const sourceGraph = graphRef.current, token = ++proposalSequence.current;
    if (!sourceGraph || !staged || !claimId || !head) return;
    setProposalBusy(true); setProposalError(null);
    try {
      const next = await createConstructionEvidenceProposal({ schemaVersion: "0.1.0", kind: "construction-evidence-proposal-request", staged, graph: sourceGraph, claimId, choice: { target: "upper-front-opening-head", value: head } });
      if (token === proposalSequence.current) {
        if (graphRef.current !== sourceGraph) throw new Error("changed");
        setProposal(next);
      }
    } catch { if (token === proposalSequence.current) setProposalError("Could not create the proposal for this building. Apply or discard pending edits, then try again."); }
    finally { if (token === proposalSequence.current) setProposalBusy(false); }
  }
  async function openProposal(file: File) {
    const sourceGraph = graphRef.current, token = ++proposalSequence.current;
    if (!sourceGraph) { setProposalError("Finish applying or discarding building edits before opening a proposal."); return; }
    if (file.size > MAX_FILE_BYTES) { setProposalError("This proposal is larger than 4 MiB."); return; }
    setProposalBusy(true); setProposalError(null);
    try {
      const next = await readConstructionEvidenceProposal(JSON.parse(await file.text()), sourceGraph);
      if (token === proposalSequence.current) {
        if (graphRef.current !== sourceGraph) throw new Error("changed");
        setStaged(next.staged); setClaimId(next.claimId); setHead(next.choice.value); setProposal(next); setVisible(Math.max(5, next.staged.candidates.findIndex(candidate => candidate.claimId === next.claimId) + 1));
      }
    } catch { if (token === proposalSequence.current) setProposalError("Could not open this proposal for the current building. It may be invalid or belong to a changed building; the previous research is retained."); }
    finally { if (token === proposalSequence.current) setProposalBusy(false); }
  }
  async function saveProposal() {
    const sourceGraph = graphRef.current, token = ++proposalSequence.current;
    if (!proposal || !sourceGraph || !onSaveProposal) return;
    setProposalBusy(true); setProposalError(null);
    try {
      const checked = await readConstructionEvidenceProposal(proposal, sourceGraph);
      if (token === proposalSequence.current) {
        if (graphRef.current !== sourceGraph) throw new Error("changed");
        onSaveProposal(checked);
      }
    } catch { if (token === proposalSequence.current) setProposalError("This proposal no longer matches the current building. Create a new proposal before saving."); }
    finally { if (token === proposalSequence.current) setProposalBusy(false); }
  }
  return <details className="construction-research-review"><summary>Inspect research extract</summary>
    <section aria-label="Research evidence review">
      <p>Open a Metagrinder extract using the May 2026 format or a saved staged file. The format is declared, not verified; source, rights and historical accuracy still need review.</p>
      <div className="control-panel__actions"><button type="button" disabled={busy || proposalBusy} onClick={() => input.current?.click()}>Open research file</button>
        <input ref={input} type="file" accept=".json,application/json" aria-label="Open research file input" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void open(file); }} />
        {staged ? <button type="button" disabled={busy} onClick={() => onSave(staged)}>Save staged file</button> : null}</div>
      {onSaveProposal ? <div className="control-panel__actions"><button type="button" disabled={!graph || proposalBusy || busy} onClick={() => proposalInput.current?.click()}>Open interpretation</button>
        <input ref={proposalInput} type="file" accept=".json,application/json" aria-label="Open interpretation file input" hidden onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void openProposal(file); }} /></div> : null}
      {busy ? <p role="status">Opening research file…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {staged ? <><p role="status">{staged.candidates.length} architecture {staged.candidates.length === 1 ? "candidate" : "candidates"} · Unreviewed · Coverage unknown</p>
        <p>These candidates do not change the building or its reference snapshot. Save the staged file separately. If you apply an interpretation, saving the linked building includes the full staged extract.</p>
        {staged.candidates.length ? <ol>{staged.candidates.slice(0, visible).map(candidate => <li key={candidate.claimId}>
          <p>{candidate.text}</p><p>{candidate.attributionMode} · extractor confidence {candidate.confidence} · unreviewed</p>
          {onSaveProposal ? <label><input type="radio" name="interpretation-claim" checked={claimId === candidate.claimId} onChange={() => { proposalSequence.current++; setProposalBusy(false); setClaimId(candidate.claimId); setProposal(null); setProposalError(null); }} /> Use this claim for an interpretation</label> : null}
          <details><summary>Source identifiers</summary><p>Claim: {candidate.claimId}</p><p>Inputs: {candidate.sourceInputIds.join(", ")}</p><p>Chunks: {candidate.sourceChunkIds.join(", ")}</p></details>
        </li>)}</ol> : <p>No architecture-tagged candidates were found. This does not establish that architectural evidence is absent.</p>}
        {visible < staged.candidates.length ? <button type="button" onClick={() => setVisible(value => value + 5)}>Show more candidates</button> : null}
        {onSaveProposal && staged.candidates.length ? <section aria-label="Propose an interpretation"><p>Choose a claim and describe an upper-front opening head. Creating a proposal does not verify the claim or change the building; applying it changes the building.</p>
          <div className="control-panel__fields"><label className="control-panel__field-wide"><span>Opening head</span><select aria-label="Proposed opening head" value={head} onChange={event => { proposalSequence.current++; setProposalBusy(false); setHead(event.currentTarget.value as "" | "flat" | "round"); setProposal(null); setProposalError(null); }}><option value="">Choose a shape</option><option value="flat">Flat</option><option value="round">Round</option></select></label></div>
          {!graph ? <p>Finish applying or discarding building edits before creating or saving an interpretation.</p> : null}
          {applicationLocked ? <p>Unlock openings before applying an interpretation.</p> : null}
          <div className="control-panel__actions"><button type="button" disabled={!graph || !claimId || !head || proposalBusy || busy} onClick={() => void propose()}>Create interpretation</button>
            {proposal ? <button type="button" disabled={!graph || proposal.contentHash === appliedProposalHash || proposalBusy || busy} onClick={() => void saveProposal()}>Save interpretation</button> : null}
            {proposal && onApplyProposal ? <button type="button" disabled={!graph || applicationLocked || proposal.contentHash === appliedProposalHash || proposalBusy || busy} onClick={() => onApplyProposal(proposal)}>Apply to building</button> : null}</div>
          {proposal ? <p role="status">{proposal.contentHash === appliedProposalHash ? `Applied ${proposal.choice.value} upper-front opening head · claim ${proposal.claimId}. Saving the building includes this evidence record and the full staged extract.` : `Proposed ${proposal.choice.value} upper-front opening head · claim ${proposal.claimId}. Save this proposal separately until it is applied.`}</p> : null}
        </section> : null}</> : null}
      {proposalError ? <p role="alert">{proposalError}</p> : null}
    </section>
  </details>;
}
