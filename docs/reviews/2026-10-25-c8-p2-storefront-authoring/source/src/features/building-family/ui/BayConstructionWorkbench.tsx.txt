import { withConstructionStorefront, constructionHasStorefront, CONSTRUCTION_FRONTAGE_OPTIONS } from "../core/constructionStorefrontGraph";
import { CONSTRUCTION_WINDOW_LAYOUTS, upgradeConstructionWindowVocabulary } from "../core/constructionWindowVocabulary";
import { ConstructionBuildingControls } from "./ConstructionBuildingControls";
import { groupedWindowCount, groupedStorefrontCount } from "./constructionBuildingBindings";
import { ConstructionReferenceSnapshotSchema, type ConstructionReferenceSnapshot } from "../contracts/constructionGeneration";
import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalJson } from "../core/canonicalJson";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, rebindGenerationSurfaceSources, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { ConstructionGenerationPanel } from "./ConstructionGenerationPanel";
import { ZodError } from "zod";
import { BayConstructionClient } from "../compiler/bayConstructionClient";
import { BayConstructionGraphSchema, BayConstructionNodeSchema, constructionOutputSocket, createBuildingConstructionGraph, type BayConstructionGraph, type BayConstructionNode } from "../contracts/bayConstructionGraph";
import { constructionUsesOperator, completeFacadeAsBuilding, repeatConstructionWithSurfaces, validateConstructionSurfaceSources } from "../core/constructionSurfaceAuthoring";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { ConstructionHistory, type ConstructionHistorySnapshot } from "../state/constructionHistory";
import { constructionRecoveryText, type ConstructionRecoveryStatus } from "../state/useConstructionWorkspace";
import type { BuildingFixtureViewerPreparer, PreparedBuildingFixtureView } from "../state/buildingRunController";
import { AssemblyHall, type AssemblyHallWindowSelection } from "./AssemblyHall";
import { ConstructionSurfacePanel } from "./ConstructionSurfacePanel";
import { ConstructionNodePanel } from "./ConstructionNodePanel";
import type { AssemblyRendererFactory } from "../renderer-three/assemblyRendererFactory";
import type { AssemblyHallFixture } from "./assemblyHallFixture";
import { prepareBayConstructionFixture, createBayConstructionMaterials, createReferenceConstructionMaterials, type BayConstructionFixture, type BayConstructionMaterials } from "./bayConstructionFixture";

export interface BayConstructionSession { graph: BayConstructionGraph; materials: BayConstructionMaterials; history?: ConstructionHistorySnapshot | null; generation?: ConstructionGenerationLineage | null }
interface Props {
  base: AssemblyHallFixture;
  acquireBaseLease: (fixture: AssemblyHallFixture) => () => void;
  initialSession: BayConstructionSession | null;
  onSessionChange: (session: BayConstructionSession) => void;
  onReturn: () => void;
  rendererFactory?: AssemblyRendererFactory;
  recoveryStatus?: ConstructionRecoveryStatus;
  onInitialFailure?: () => void;
}
const names: Record<BayConstructionNode["type"], string> = {
  Footprint: "Footprint", Storeys: "Storeys", PlaceStorefront: "Ground frontage", PlaceDoor: "Entrance layout", AssembleDoor: "Door assembly", BuildingRoof: "Complete roof", FacadeScope: "Facade scope", PlaceOpening: "Opening layout", EmitWall: "Wall", AssembleWindow: "Window assembly", Output: "Output",
  SplitFloors: "Split floors", SplitBays: "Split bays", SelectScopes: "Select scopes", ProfileTrim: "Profile trim", RoofCap: "Roof cap", JoinGeometry: "Join geometry", SetSurface: "Surface finish"
};
const labels: Record<string, string> = {
  mode: "Ground frontage", pierWidthM: "Masonry pier width (m)", bulkheadHeightM: "Bulkhead height (m)", headHeightM: "Head band height (m)", transomBaseM: "Transom level (m)",
  layout: "Window assembly",
  groundHeightM: "Ground storey height (m)", upperHeightM: "Upper storey height (m)", leafHeightM: "Door leaf height (m)", thresholdProjectionM: "Threshold projection (m)", parapetHeightM: "Parapet height (m)", copingProjectionM: "Coping projection (m)", corniceHeightM: "Cornice height (m)", corniceProjectionM: "Cornice projection (m)",
  widthM: "Width (m)", heightM: "Height (m)", wallDepthM: "Wall depth (m)", sillM: "Sill height (m)",
  recessM: "Recess (m)", frameWidthM: "Frame width (m)", sillProjectionM: "Sill projection (m)",
  count: "Count", floorIndex: "Floor index (-1 = all)", bayIndex: "Bay index (-1 = all)", depthM: "Depth (m)", projectionM: "Projection (m)"
};
const displayNumber = (value: number) => String(Number(value.toPrecision(12)));
function fieldsFor(graph: BayConstructionGraph): Record<string, Record<string, string>> {
  return Object.fromEntries(graph.nodes.map(node => [node.id, "parameters" in node
    ? Object.fromEntries(Object.entries(node.parameters).map(([key, value]) => [key, displayNumber(value)])) : {}]));
}
function problem(error: unknown): string {
  if (error instanceof ZodError) { const issue = error.issues[0]; return `${labels[String(issue?.path.at(-1))] ?? "Construction"}: ${issue?.message ?? "Invalid instructions."}`; }
  return error instanceof Error ? error.message : "The change could not be applied. Your previous bay is retained.";
}
function controlsFrom(lineage: ConstructionGenerationLineage) {
  const { seeds, requested, locks } = lineage.source.intent;
  const locked = (id: string) => locks.some(lock => lock.reason === "Workbench control lock" && lock.semanticPath.startsWith("construction/" + id + "/"));
  return { recipeId: lineage.source.recipe.id, floorCount: requested.floorCount ?? 3, bayCount: requested.bayCount ?? 4,
    buildingSeed: seeds.building, materialSeed: seeds.material, trimSeed: seeds.trim,
    lockFootprint: locked("footprint"), lockStoreys: locked("facade"), lockOpenings: locked("opening") || locked("window") };
}
interface Owner { fixture: BayConstructionFixture; leases: number; retired: boolean }

/** An authoring mode in the primary workbench. The existing generator stays separately owned. */
export function BayConstructionWorkbench({ base, acquireBaseLease, initialSession, onSessionChange, onReturn, rendererFactory, recoveryStatus, onInitialFailure }: Props) {
  const [startingSession] = useState(initialSession);
  const [history] = useState(() => new ConstructionHistory(startingSession?.history));
  const [generation, setGeneration] = useState<ConstructionGenerationLineage | null>(startingSession?.generation ?? null);
  const [generationControls, setGenerationControls] = useState({ ...defaultConstructionGenerationControls, ...(startingSession?.generation ? controlsFrom(startingSession.generation) : {}) });
  const [referenceDraft, setReferenceDraft] = useState<ConstructionReferenceSnapshot | null>(null);
  const referenceSequence = useRef(0);
  const initialFailure = useRef(onInitialFailure);
  useEffect(() => { initialFailure.current = onInitialFailure; }, [onInitialFailure]);
  const [draft, setDraft] = useState(() => startingSession?.graph ?? createBuildingConstructionGraph());
  const [fields, setFields] = useState(() => fieldsFor(draft));
  const [selected, setSelected] = useState(draft.nodes[0].id);
  const [accepted, setAccepted] = useState<BayConstructionFixture | null>(null);
  const [pending, setPending] = useState(true), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null), [viewerReady, setViewerReady] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [previewNode, setPreviewNode] = useState<string | null>(null);
  const shown = useRef<BayConstructionFixture | null>(null);
  const alive = useRef(false), sequence = useRef(0), abort = useRef<AbortController | null>(null);
  const compiler = useRef<BayConstructionClient | null>(null);
  const current = useRef<{ fixture: BayConstructionFixture; materials: BayConstructionMaterials; generation: ConstructionGenerationLineage | null } | null>(null);
  const owners = useRef(new Map<AssemblyHallFixture, Owner>());
  const viewer = useRef<BuildingFixtureViewerPreparer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), downloads = useRef(new Map<string, number>());

  const selectFrame = useCallback((selection: AssemblyHallWindowSelection | null) => {
    setSelectedFrame(selection && selection.fixture === current.current?.fixture && shown.current === selection.fixture ? selection.semanticPath : null);
  }, []);

  const collect = useCallback((owner: Owner) => {
    if (owner.retired && owner.leases === 0) {
      owners.current.delete(owner.fixture);
      owner.fixture.familyRuntime.dispose();
    }
  }, []);
  const retire = useCallback((fixture: AssemblyHallFixture) => {
    const owner = owners.current.get(fixture);
    if (owner) { owner.retired = true; collect(owner); }
  }, [collect]);
  const acquireLease = useCallback((fixture: AssemblyHallFixture) => {
    const owner = owners.current.get(fixture);
    if (!owner || owner.retired) throw new Error("This construction view has expired.");
    owner.leases++;
    let released = false;
    return () => { if (!released) { released = true; owner.leases--; collect(owner); } };
  }, [collect]);
  const registerViewer = useCallback((prepare: BuildingFixtureViewerPreparer) => {
    viewer.current = prepare; setViewerReady(true);
    return () => { if (viewer.current === prepare) { viewer.current = null; if (alive.current) setViewerReady(false); } };
  }, []);

  const publish = useCallback(async (graph: BayConstructionGraph, materials: BayConstructionMaterials, token: number, signal: AbortSignal,
    historyAction: "edit" | "open" | "undo" | "redo" = "edit", lineage?: ConstructionGenerationLineage | null) => {
    const isCurrent = () => alive.current && sequence.current === token && !signal.aborted;
    if (!isCurrent()) return;
    const previous = current.current;
    const nextGeneration = lineage === undefined ? previous?.generation ?? null : lineage;
    if (previous && shown.current === previous.fixture && JSON.stringify(previous.fixture.construction.graph) === JSON.stringify(graph) &&
        previous.materials.file.contentHash === materials.file.contentHash && canonicalJson(previous.generation) === canonicalJson(nextGeneration)) {
      setDraft(graph); setFields(fieldsFor(graph)); setDirty(false); setError(null);
      if (historyAction === "open") { history.record(graph, materials.file.contentHash, true, nextGeneration); onSessionChange({ graph, materials, history: history.snapshot(), generation: nextGeneration }); }
      return;
    }
    validateConstructionSurfaceSources(graph, materials.packedAtlas);
    compiler.current ??= new BayConstructionClient(new Worker(
      new URL("../compiler/bayConstruction.worker.ts", import.meta.url), { type: "module" }
    ));
    const result = await compiler.current.evaluate(graph);
    if (!isCurrent()) return;
    const candidate = await prepareBayConstructionFixture(base, result, materials, signal);
    if (!isCurrent()) { candidate.familyRuntime.dispose(); return; }
    owners.current.set(candidate, { fixture: candidate, leases: 0, retired: false });
    let prepared: PreparedBuildingFixtureView | undefined;
    try {
      if (viewer.current) prepared = await viewer.current(candidate, { signal });
      if (!isCurrent()) { prepared?.discard(); retire(candidate); return; }
      if ((historyAction === "undo" || historyAction === "redo") && JSON.stringify(history.target(historyAction)) !== JSON.stringify(result.graph)) throw new Error("Construction history changed before the view was ready.");
      const finalize = prepared?.commit();
      const previousShown = shown.current; shown.current = candidate;
      current.current = { fixture: candidate, materials, generation: nextGeneration };
      setGeneration(nextGeneration);
      if (historyAction === "open" || historyAction === "undo" || historyAction === "redo") { referenceSequence.current++; setReferenceDraft(null); }
      if (nextGeneration) setGenerationControls(controls => ({ ...controls, ...controlsFrom(nextGeneration) }));
      setPreviewNode(null);
      setAccepted(candidate); setDraft(result.graph); setFields(fieldsFor(result.graph));
      setSelected(id => result.graph.nodes.some(node => node.id === id) ? id : result.graph.nodes[0].id);
      setDirty(false); setError(null);
      if (historyAction === "undo" || historyAction === "redo") history.acceptTraversal(historyAction, result.graph);
      else history.record(result.graph, materials.file.contentHash, historyAction === "open", nextGeneration);
      onSessionChange({ graph: result.graph, materials, history: history.snapshot(), generation: nextGeneration });
      if (previous) retire(previous.fixture);
      if (previousShown && previousShown !== previous?.fixture) retire(previousShown);
      finalize?.();
    } catch (failure) { prepared?.discard(); retire(candidate); throw failure; }
  }, [base, history, onSessionChange, retire]);

  useEffect(() => {
    alive.current = true;
    const token = ++sequence.current, controller = new AbortController();
    abort.current = controller;
    const releaseBase = acquireBaseLease(base);
    const urls = downloads.current, owned = owners.current;
    void (async () => {
      try {
        const materials = startingSession?.materials ?? await createBayConstructionMaterials(base, controller.signal, undefined, "building");
        await publish(startingSession?.graph ?? createBuildingConstructionGraph(), materials, token, controller.signal, "edit", startingSession?.generation ?? null);
      } catch (failure) {
        if (alive.current && sequence.current === token) { setError(problem(failure)); initialFailure.current?.(); }
      } finally { if (alive.current && sequence.current === token) setPending(false); }
    })();
    return () => {
      alive.current = false; controller.abort(); abort.current?.abort();
      compiler.current?.dispose(); compiler.current = null;
      for (const owner of [...owned.values()]) { owner.retired = true; collect(owner); }
      for (const [url, timer] of urls) { window.clearTimeout(timer); URL.revokeObjectURL(url); }
      urls.clear(); releaseBase();
    };
  }, [acquireBaseLease, base, collect, publish, startingSession]);

  async function perform(action: (token: number, signal: AbortSignal) => Promise<void>) {
    const token = ++sequence.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setPending(true); setError(null);
    try { await action(token, controller.signal); }
    catch (failure) {
      if (alive.current && sequence.current === token) {
        compiler.current?.dispose(); compiler.current = null;
        setError(problem(failure));
      }
    } finally { if (alive.current && sequence.current === token) setPending(false); }
  }
  async function apply() {
    const materials = current.current?.materials;
    if (!materials) return;
    await perform(async (token, signal) => {
      const graph = structuredClone(draft);
      for (const node of graph.nodes) if ("parameters" in node) {
        for (const [key, text] of Object.entries(fields[node.id])) {
          const value = Number(text);
          if (!text.trim() || !Number.isFinite(value)) throw new Error(`Enter a finite value for ${labels[key] ?? key}.`);
          if (text !== displayNumber((node.parameters as Record<string,number>)[key])) Object.assign(node.parameters, { [key]: value });
        }
      }
      await publish(BayConstructionGraphSchema.parse(graph), materials, token, signal);
    });
  }
  async function open(file: File) {
    await perform(async (token, signal) => {
      const { project, materials } = await readBayConstructionProject(JSON.parse(await file.text()));
      await publish(project.graph, { ...materials, file: project.materialSource }, token, signal, "open", project.generation ?? null);
    });
  }
  async function generateBuilding(reroll: boolean) {
    const acceptedSource = current.current;
    if (!acceptedSource || dirty) return;
    const controls = structuredClone(generationControls), reference = referenceDraft ? structuredClone(referenceDraft) : undefined;
    await perform(async (token, signal) => {
      const result = await resolveWorkbenchGeneration(acceptedSource.fixture.construction.graph, acceptedSource.generation, controls, reroll, reference);
      if (signal.aborted) return;
      const templateSpec = acceptedSource.generation?.materialPlan.templateSpec ?? base.spec;
      let plan = await planConstructionReferenceMaterials(templateSpec, result.source), materials = acceptedSource.materials;
      if (acceptedSource.generation?.materialPlan.materialInputsHash !== plan.materialInputsHash) {
        const generated = await createReferenceConstructionMaterials(base, result.source, signal, templateSpec);
        plan = generated.plan; materials = generated.materials;
      }
      if (signal.aborted) return;
      const lineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage",
        source: result.source, resolution: result.resolution, materialPlan: plan, materialSourceHash: materials.file.contentHash };
      const graph = materials === acceptedSource.materials ? result.graph : rebindGenerationSurfaceSources(result.graph, acceptedSource.materials.packedAtlas, materials.packedAtlas);
      await publish(graph, materials, token, signal, "edit", lineage);
      if (current.current?.generation === lineage && !signal.aborted) { referenceSequence.current++; setReferenceDraft(null); }
    });
  }
  async function importReference(file: File) {
    const token = ++referenceSequence.current;
    try {
      const snapshot = ConstructionReferenceSnapshotSchema.parse(JSON.parse(await file.text()));
      if (alive.current && referenceSequence.current === token) { setReferenceDraft(snapshot); setError(null); }
    } catch (failure) { if (alive.current && referenceSequence.current === token) setError(problem(failure)); }
  }
  async function repeat() {
    const source = current.current;
    if (!source) return;
    await perform((token, signal) => publish(repeatConstructionWithSurfaces(source.fixture.construction.graph), source.materials, token, signal));
  }
  async function completeBuilding() {
    const source=current.current;if(!source)return;
    await perform((token,signal)=>publish(completeFacadeAsBuilding(source.fixture.construction.graph),source.materials,token,signal));
  }
  async function traverseHistory(direction: "undo" | "redo") {
    const source = current.current, target = history.target(direction);
    if (!source || !target || pending || saving || dirty) return;
    await perform((token, signal) => publish(target, source.materials, token, signal, direction, history.targetGeneration(direction)));
  }
  function revertDraft() {
    const source = current.current; if (!source) return;
    const graph = source.fixture.construction.graph;
    setDraft(graph); setFields(fieldsFor(graph)); setDirty(false); setError(null);
    setSelected(id => graph.nodes.some(node => node.id === id) ? id : graph.nodes[0].id);
  }
  async function preview(id: string | null) {
    const source = current.current;
    if (!source) return;
    await perform(async (token, signal) => {
      const isCurrent = () => alive.current && sequence.current === token && !signal.aborted && current.current === source;
      let candidate = source.fixture;
      if (id) {
        compiler.current ??= new BayConstructionClient(new Worker(new URL("../compiler/bayConstruction.worker.ts", import.meta.url), { type: "module" }));
        const result = await compiler.current.evaluate(source.fixture.construction.graph, id);
        if (!isCurrent()) return;
        candidate = await prepareBayConstructionFixture(base, result, source.materials, signal);
        if (!isCurrent()) { candidate.familyRuntime.dispose(); return; }
        owners.current.set(candidate, { fixture: candidate, leases: 0, retired: false });
      }
      let prepared: PreparedBuildingFixtureView | undefined;
      try {
        if (viewer.current) prepared = await viewer.current(candidate, { signal });
        if (!isCurrent()) { prepared?.discard(); if (id) retire(candidate); return; }
        const finalize = prepared?.commit(), previous = shown.current;
        shown.current = candidate; setAccepted(candidate); setPreviewNode(id);
        if (previous && previous !== source.fixture && previous !== candidate) retire(previous);
        finalize?.();
      } catch (failure) { prepared?.discard(); if (id) retire(candidate); throw failure; }
    });
  }
  async function save() {
    const source = current.current;
    if (!source) return;
    setSaving(true); setError(null);
    try {
      const project = await createBayConstructionProject(source.fixture.construction.graph, source.materials.file, source.generation ?? undefined);
      if (!alive.current || current.current !== source) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${project.graph.documentId}.buildo-construction.json`;
      document.body.appendChild(link); link.click(); link.remove();
      const timer = window.setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1500);
      downloads.current.set(url, timer);
    } catch (failure) { if (alive.current) setError(problem(failure)); }
    finally { if (alive.current) setSaving(false); }
  }
  const node = draft.nodes.find(node => node.id === selected) ?? draft.nodes[0];
  const output = accepted?.construction.trace.find(entry => entry.nodeId === node.id);
  const disabled = pending || saving;
  function replace(next: BayConstructionNode) {
    setDraft(graph => ({ ...graph, nodes: graph.nodes.map(value => value.id === next.id ? next : value) }));
    setDirty(true);
  }
  function changeGraph(graph: BayConstructionGraph) {
    setDraft(graph); setFields(all => Object.fromEntries(graph.nodes.map(value => [value.id, all[value.id] ?? fieldsFor(graph)[value.id]])));
    setDirty(true);
  }
  const labelFor = (key: string) => key === "bayIndex" && node.type === "PlaceDoor" ? "Entrance bay index" : key === "count" ? (node.type === "SplitFloors" || node.type === "Storeys") ? "Floor count" : "Bay count" : labels[key];
  const buildingMode = accepted && constructionUsesOperator(accepted.construction.graph,"Footprint");
  const facadeMode = accepted && (constructionUsesOperator(accepted.construction.graph,"SplitFloors") || constructionUsesOperator(accepted.construction.graph,"SplitBays"));
  const displayName = (value: BayConstructionNode) => {
    const same = draft.nodes.filter(item => item.type === value.type);
    return names[value.type] + (same.length > 1 ? ` ${same.findIndex(item => item.id === value.id) + 1}` : "");
  };
  const fileActions = <>
        <button type="button" aria-label="Save construction" disabled={disabled || !accepted || dirty} onClick={() => void save()}>{saving ? "Saving…" : buildingMode ? "Save" : "Save construction"}</button>
        <button type="button" aria-label="Open construction" disabled={disabled} onClick={() => fileInput.current?.click()}>{buildingMode ? "Open" : "Open construction"}</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Open construction file"
          onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void open(file); }} />
  </>;
  const historyActions = <div className="control-panel__actions construction-history" aria-label="Construction history">
        <button type="button" aria-label="Undo construction" disabled={disabled || dirty || !viewerReady || !history.canUndo} onClick={() => void traverseHistory("undo")}>{buildingMode ? "Undo" : "Undo construction"}</button>
        <button type="button" aria-label="Redo construction" disabled={disabled || dirty || !viewerReady || !history.canRedo} onClick={() => void traverseHistory("redo")}>{buildingMode ? "Redo" : "Redo construction"}</button>
      </div>;
  const nodeProperties = <section className="construction-properties" aria-label="Selected node properties">
      <form noValidate onSubmit={event => { event.preventDefault(); void apply(); }}>
        <fieldset disabled={disabled}>
          <legend>Construction step</legend>
          <div className="control-panel__fields">
            <label className="control-panel__field-wide"><span>Step</span>
              <select aria-label="Construction step" value={node.id} onChange={event => setSelected(event.currentTarget.value)}>
                {draft.nodes.map(value => <option key={value.id} value={value.id}>{displayName(value)}</option>)}
              </select>
            </label>
            {"parameters" in node ? Object.keys(node.parameters).map(key => <label key={key}>
              <span>{labelFor(key)}</span>{key === "layout" ? <select aria-label={labelFor(key)} value={fields[node.id]?.[key] ?? "0"}
                onChange={event => { const text=event.currentTarget.value;setFields(all=>({...all,[node.id]:{...all[node.id],[key]:text}}));setDirty(true); }}>
                {CONSTRUCTION_WINDOW_LAYOUTS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : key === "mode" && node.type === "PlaceStorefront" ? <select aria-label="Ground frontage" value={fields[node.id]?.[key] ?? "0"}
                onChange={event => {const text=event.currentTarget.value;setFields(all=>({...all,[node.id]:{...all[node.id],[key]:text}}));setDirty(true);}}>
                {CONSTRUCTION_FRONTAGE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : <input type="number" step={["count", "floorIndex", "bayIndex"].includes(key) ? "1" : "0.01"} aria-label={labelFor(key)} value={fields[node.id]?.[key] ?? ""}
                disabled={constructionHasStorefront(draft) && (node.type === "PlaceDoor" && key === "heightM" || node.type === "AssembleDoor" && key !== "thresholdProjectionM")}
                onChange={event => { const text = event.currentTarget.value; setFields(all => ({ ...all, [node.id]: { ...all[node.id], [key]: text } })); setDirty(true); }} />}
            </label>) : null}
            {constructionHasStorefront(draft) && (node.type === "PlaceDoor" || node.type === "AssembleDoor") ? <p>The ground frontage sets the door height, frame and recess. Use its head band and transom controls.</p> : null}
            {"input" in node ? <label className="control-panel__field-wide"><span>{node.input.socket === "scope" ? "Scope input" : node.input.socket === "footprint" ? "Footprint input" : "Geometry input"}</span>
              <select aria-label={node.input.socket === "scope" ? "Scope input" : node.input.socket === "footprint" ? "Footprint input" : "Geometry input"} value={node.input.nodeId}
                onChange={event => replace(BayConstructionNodeSchema.parse({ ...node, input: { nodeId: event.currentTarget.value, socket: node.input.socket } }))}>
                {draft.nodes.filter(value => value.id !== node.id && constructionOutputSocket(value.type) === node.input.socket)
                  .map(value => <option key={value.id} value={value.id}>{displayName(value)}</option>)}
              </select>
            </label> : null}
            {"input" in node && node.type !== "Storeys" ? <label className="control-panel__field-wide construction-contribution"><input type="checkbox" aria-label="Bypass selected node" checked={Boolean(node.bypassed)}
              onChange={event => { setDraft(graph => ({ ...graph, schemaVersion: ["0.3.0", "0.4.0", "0.5.0", "0.6.0"].includes(graph.schemaVersion) ? graph.schemaVersion : "0.2.0" })); replace({ ...node, bypassed: event.currentTarget.checked }); }} /><span>Bypass this node</span></label> : null}
            {"inputs" in node ? draft.nodes.filter(value => value.id !== node.id && constructionOutputSocket(value.type) === "geometry").map(value =>
              <label className="control-panel__field-wide construction-contribution" key={value.id}>
                <input type="checkbox" aria-label={`Include ${displayName(value)}`} checked={node.inputs.some(link => link.nodeId === value.id)}
                  onChange={event => replace({ ...node, inputs: event.currentTarget.checked
                    ? [...node.inputs, { nodeId: value.id, socket: "geometry" }] : node.inputs.filter(link => link.nodeId !== value.id) })} />
                <span>{displayName(value)}</span>
              </label>) : null}
            {node.type === "Output" && node.id !== draft.outputNodeId ? <button type="button" onClick={() => { setDraft(graph => ({ ...graph, outputNodeId: node.id })); setDirty(true); }}>Use as construction output</button> : null}
          </div>
          <div className="control-panel__actions"><button type="submit" disabled={!accepted || !viewerReady}>Apply construction</button>
            {dirty ? <button type="button" onClick={revertDraft}>Revert draft</button> : null}</div>
        </fieldset>
      </form>
      {accepted ? <p aria-label="Construction step output">{output
        ? output.type === "Footprint" ? `Footprint: ${(output.bounds.max[0]-output.bounds.min[0]).toFixed(2)} m wide, ${(output.bounds.max[2]-output.bounds.min[2]).toFixed(2)} m deep.` : `Current output: ${output.scopeCount !== undefined ? `${output.scopeCount} scopes; ` : ""}${(output.bounds.max[0] - output.bounds.min[0]).toFixed(2)} m wide, ${(output.bounds.max[1] - output.bounds.min[1]).toFixed(2)} m high.`
        : "This step is not connected to the current output."}</p> : null}
      {output?.scopeNames?.length ? <p className="construction-scope-names">{output.scopeNames.slice(0, 4).map(name => { const match = name.match(/floor\/(\d+)\/bay\/(\d+)/); return match ? `Floor ${match[1]}, bay ${match[2]}` : name; }).join(" · ")}{output.scopeNames.length > 4 ? ` · ${output.scopeNames.length - 4} more` : ""}. Indices start at 0; -1 selects all.</p> : null}
      </section>;
  const previewType = accepted?.construction.graph.nodes.find(value => value.id === previewNode)?.type;
  return <div className={`building-workspace construction-workspace${buildingMode ? " construction-workspace--grouped" : ""}`} aria-label="Construction workspace"
    data-construction-undo={history.undoCount} data-construction-redo={history.redoCount}
    onKeyDown={event => { if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault(); void traverseHistory(event.shiftKey ? "redo" : "undo"); }}
    data-construction-hash={accepted?.ir.sourceGraphHash} data-construction-triangles={accepted?.ir.metrics.triangleCount}
    data-construction-kind={buildingMode ? "building" : facadeMode ? "facade" : "bay"} data-surface-layer-count={accepted?.construction.surfaceComposition?.layers.length ?? 0} data-construction-preview={previewNode ?? "output"}>
    {buildingMode ? <header className="construction-workspace__toolbar"><p>Building construction</p><div className="construction-project-actions">{historyActions}{fileActions}</div></header> : null}
    <div className="building-workspace__stage">
      {accepted ? <AssemblyHall workspace constructionFrameSelection onWindowSelectionChange={selectFrame} fixture={accepted} acquireFixtureViewerLease={acquireLease} registerFixtureViewer={registerViewer} rendererFactory={rendererFactory}
        title={buildingMode ? "Building construction" : facadeMode ? "Facade construction" : "Facade bay"} description={buildingMode ? "Footprint, storeys, openings and continuous architectural profiles" : facadeMode ? "Connected scopes, openings and shared procedural assemblies" : "An authored opening, sash and masonry scope"} showFamilyTools={false} lighting={buildingMode ? "construction" : "bay"} conciseFallback framing={buildingMode || facadeMode ? "facade" : "building"} />
        : <div className="room-panel__loading" role="status">Preparing construction materials and geometry…</div>}
      {!buildingMode ? nodeProperties : <p className="construction-workspace__target">Whole building · Shared architectural controls{selectedFrame ? ". A frame is selected for surface finishes; geometry edits remain shared." : ""}</p>}
    </div>
    <aside className="building-workspace__inspector" aria-label="Construction inspector" aria-busy={pending}>
      <h2>{buildingMode ? "Building controls" : "Construction"}</h2>
      <div className="construction-workspace__status">
      {recoveryStatus ? <p role="status" aria-label="Construction recovery" data-construction-recovery={recoveryStatus.state}
        data-construction-project-hash={recoveryStatus.projectHash}>{constructionRecoveryText(recoveryStatus)}</p> : null}
      <p role="status">{pending ? "Updating construction…" : dirty ? "Changes are not applied." : previewNode ? `Previewing ${previewType ? names[previewType] : "intermediate output"}. Saved construction is unchanged.` : accepted ? buildingMode ? "Building is up to date." : facadeMode ? "Facade is up to date." : "Bay is up to date." : "Construction is unavailable."}</p>
      {error ? <p role="alert">{error}</p> : null}
      </div>
      {buildingMode && !advancedOpen && accepted ? <ConstructionBuildingControls graph={draft} fields={fields} windowCount={groupedWindowCount(accepted.construction.graph,accepted.ir)} storefrontCount={groupedStorefrontCount(accepted.construction.graph,accepted.ir)}
        disabled={disabled || !viewerReady || Boolean(previewNode)} dirty={dirty}
        onFieldChange={(id,key,text) => {
          if (id === "frontage" && !draft.nodes.some(node => node.id === "frontage")) {
            const migrated = withConstructionStorefront(draft, 0);
            setDraft(migrated);setFields(all => ({...fieldsFor(migrated),...all,[id]:{...fieldsFor(migrated)[id],...all[id],[key]:text}}));
          } else {
            if (key === "layout") setDraft(graph => upgradeConstructionWindowVocabulary(graph));
            setFields(all => ({...all,[id]:{...all[id],[key]:text}}));
          }
          setSelected(id);setDirty(true);
        }}
        onApply={() => void apply()} onRevert={revertDraft} onAdvanced={() => setAdvancedOpen(true)} /> : null}
      {!buildingMode ? <>
      <div className="control-panel__actions">
        <button type="button" onClick={onReturn}>{buildingMode ? "Advanced generator" : "Back to building"}</button>
        {facadeMode && !buildingMode ? <button type="button" disabled={disabled || dirty || !accepted || !viewerReady} onClick={()=>void completeBuilding()}>Complete building</button> : null}
        {!facadeMode ? <button type="button" disabled={disabled || dirty || !accepted || !viewerReady} onClick={() => void repeat()}>Repeat bay into facade</button> : null}
        {fileActions}
      </div>

      <div className="control-panel__actions construction-history" aria-label="Construction history">
        <button type="button" aria-label="Undo construction" disabled={disabled || dirty || !viewerReady || !history.canUndo} onClick={() => void traverseHistory("undo")}>{buildingMode ? "Undo" : "Undo construction"}</button>
        <button type="button" aria-label="Redo construction" disabled={disabled || dirty || !viewerReady || !history.canRedo} onClick={() => void traverseHistory("redo")}>{buildingMode ? "Redo" : "Redo construction"}</button>
      </div>
      </> : null}
      {buildingMode ? <details className="construction-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
        <summary>Advanced recipe graph</summary>
        {advancedOpen ? <><p>Connections change construction logic. Added nodes or custom connections pause recipe generation until restored.</p>
          {nodeProperties}
      <ConstructionNodePanel graph={draft} selected={node.id} disabled={disabled} names={names} onSelect={setSelected} onChange={changeGraph} />
      <div className="control-panel__actions construction-preview-actions">
        <button type="button" disabled={disabled || dirty || !viewerReady} onClick={() => void preview(node.id)}>Preview selected</button>
        <button type="button" disabled={disabled || !previewNode || !viewerReady} onClick={() => void preview(null)}>Show construction</button>
      </div>
          <button type="button" onClick={onReturn}>Advanced generator</button></> : null}
      </details> : <>
      <ConstructionNodePanel graph={draft} selected={node.id} disabled={disabled} names={names} onSelect={setSelected} onChange={changeGraph} />
      <div className="control-panel__actions construction-preview-actions">
        <button type="button" disabled={disabled || dirty || !viewerReady} onClick={() => void preview(node.id)}>Preview selected</button>
        <button type="button" disabled={disabled || !previewNode || !viewerReady} onClick={() => void preview(null)}>Show construction</button>
      </div></>}

      {accepted ? <ConstructionSurfacePanel graph={draft} atlas={accepted.packedAtlas} selectedPath={selectedFrame} selectedNode={selected} disabled={disabled || Boolean(previewNode)}
        onChange={(graph, id) => { changeGraph(graph); setSelected(id); }} /> : null}
      {buildingMode ? <details className="construction-generate"><summary>Generate & vary</summary><ConstructionGenerationPanel controls={generationControls} lineage={generation} reference={referenceDraft} onReferenceFile={file => void importReference(file)} disabled={disabled || dirty || !viewerReady}
        onChange={setGenerationControls} onGenerate={reroll => void generateBuilding(reroll)} /></details> : null}

    </aside>
  </div>;
}

