import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MetagrinderEvidenceReview } from "../ui/MetagrinderEvidenceReview";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";

const synthetic = { inputId: "synthetic-source", claims: [{ claimId: "claim-1", text: "Synthetic example: a storefront has an awning.",
  category: "architecture-and-streetscape", confidence: "medium", sourceInputIds: ["source-a", "source-b"], sourceChunkIds: ["chunk-a", "chunk-b"], attributionMode: "inferred" }], evidence: [{ arbitrary: "retained" }] };
function file(text: string) { return Object.assign(new File([text], "extract.json", { type: "application/json" }), { text: async () => text }); }

it("inspects, saves and reopens staged candidates without promoting them, and retains the last valid extract on error", async () => {
  const save = vi.fn(); render(<MetagrinderEvidenceReview onSave={save} />);
  fireEvent.click(screen.getByText("Inspect research extract"));
  const input = screen.getByLabelText("Open research file input");
  fireEvent.change(input, { target: { files: [file(JSON.stringify(synthetic))] } });
  expect(await screen.findByText(/1 architecture candidate/)).toHaveTextContent("Unreviewed · Coverage unknown");
  expect(screen.getByText(synthetic.claims[0].text)).toBeInTheDocument();
  expect(screen.getByText("inferred · extractor confidence medium · unreviewed")).toBeInTheDocument();
  expect(screen.getByText("Inputs: source-a, source-b")).toBeInTheDocument();
  expect(screen.getByText("Chunks: chunk-a, chunk-b")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save staged file" }));
  expect(save).toHaveBeenCalledTimes(1); const staged = save.mock.calls[0][0];
  expect(staged.artifact).toEqual(synthetic); expect(staged.candidates[0].review).toBe("unreviewed");
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.json")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("larger than 4 MiB");
  expect(screen.getByText(synthetic.claims[0].text)).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [file("not json")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("previous extract is retained");
  expect(screen.getByText(synthetic.claims[0].text)).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [file(JSON.stringify(staged))] } });
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByText(synthetic.claims[0].text)).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [file(JSON.stringify({ inputId: "empty" }))] } });
  expect(await screen.findByText(/does not establish that architectural evidence is absent/)).toBeInTheDocument();
});

it("ignores a stale file read after a newer extract is opened", async () => {
  render(<MetagrinderEvidenceReview onSave={() => {}} />);
  fireEvent.click(screen.getByText("Inspect research extract"));
  const input = screen.getByLabelText("Open research file input");
  let finish!: (value: string) => void;
  const slow = Object.assign(new File(["slow"], "slow.json"), { text: () => new Promise<string>(resolve => { finish = resolve; }) });
  fireEvent.change(input, { target: { files: [slow] } });
  const newer = { ...synthetic, claims: [{ ...synthetic.claims[0], claimId: "newer", text: "Newer synthetic claim." }] };
  fireEvent.change(input, { target: { files: [file(JSON.stringify(newer))] } });
  expect(await screen.findByText("Newer synthetic claim.")).toBeInTheDocument();
  await act(async () => { finish(JSON.stringify(synthetic)); await new Promise(resolve => setTimeout(resolve, 25)); });
  await waitFor(() => expect(screen.getByText("Newer synthetic claim.")).toBeInTheDocument());
  expect(screen.queryByText(synthetic.claims[0].text)).not.toBeInTheDocument();
});

it("lets an artist save and reopen an explicit interpretation, rejecting a changed building", async () => {
  const graph = createBuildingConstructionGraph("review_building"), saveProposal = vi.fn();
  const view = render(<MetagrinderEvidenceReview onSave={() => {}} graph={graph} onSaveProposal={saveProposal} />);
  fireEvent.click(screen.getByText("Inspect research extract"));
  fireEvent.change(screen.getByLabelText("Open research file input"), { target: { files: [file(JSON.stringify(synthetic))] } });
  await screen.findByText(synthetic.claims[0].text);
  fireEvent.click(screen.getByLabelText("Use this claim for an interpretation"));
  fireEvent.change(screen.getByLabelText("Proposed opening head"), { target: { value: "round" } });
  fireEvent.click(screen.getByRole("button", { name: "Create interpretation" }));
  expect(await screen.findByText(/Proposed round upper-front opening head/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save interpretation" }));
  await waitFor(() => expect(saveProposal).toHaveBeenCalledTimes(1));
  const proposal = saveProposal.mock.calls[0][0];
  expect(proposal.staged.artifact).toEqual(synthetic); expect(proposal.staged.candidates[0].review).toBe("unreviewed");
  fireEvent.change(screen.getByLabelText("Open interpretation file input"), { target: { files: [file(JSON.stringify(proposal))] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save interpretation" })).toBeEnabled());
  const changed = structuredClone(graph); changed.nodes.find(node => node.type === "Footprint")!.parameters.widthM = 20;
  view.rerender(<MetagrinderEvidenceReview onSave={() => {}} graph={changed} onSaveProposal={saveProposal} />);
  fireEvent.click(screen.getByRole("button", { name: "Save interpretation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer matches");
  expect(saveProposal).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Open interpretation file input"), { target: { files: [file(JSON.stringify(proposal))] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("changed building");
  expect(screen.getByText(synthetic.claims[0].text)).toBeInTheDocument();
});

it("requires an explicit unlocked apply action and marks the same proposal as applied", async () => {
  const graph = createBuildingConstructionGraph("apply_review"), apply = vi.fn(), save = vi.fn();
  const view = render(<MetagrinderEvidenceReview onSave={() => {}} graph={graph} onSaveProposal={save} onApplyProposal={apply} applicationLocked />);
  fireEvent.click(screen.getByText("Inspect research extract"));
  fireEvent.change(screen.getByLabelText("Open research file input"), { target: { files: [file(JSON.stringify(synthetic))] } });
  await screen.findByText(synthetic.claims[0].text);
  fireEvent.click(screen.getByLabelText("Use this claim for an interpretation"));
  fireEvent.change(screen.getByLabelText("Proposed opening head"), { target: { value: "round" } });
  fireEvent.click(screen.getByRole("button", { name: "Create interpretation" }));
  expect(await screen.findByRole("button", { name: "Apply to building" })).toBeDisabled();
  view.rerender(<MetagrinderEvidenceReview onSave={() => {}} graph={graph} onSaveProposal={save} onApplyProposal={apply} />);
  fireEvent.click(screen.getByRole("button", { name: "Apply to building" })); expect(apply).toHaveBeenCalledTimes(1);
  view.rerender(<MetagrinderEvidenceReview onSave={() => {}} graph={graph} onSaveProposal={save} onApplyProposal={apply} appliedProposalHash={apply.mock.calls[0][0].contentHash} />);
  expect(screen.getByText(/Applied round upper-front opening head/)).toHaveTextContent("Saving the building includes this evidence record");
  expect(screen.getByRole("button", { name: "Apply to building" })).toBeDisabled();
});
