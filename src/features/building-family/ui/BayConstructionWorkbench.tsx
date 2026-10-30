import { withConstructionFacadePiers, withoutConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { CONSTRUCTION_CORNICE_LAYOUTS, withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { CONSTRUCTION_PARAPET_SILHOUETTES, withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionStorefront, constructionHasStorefront, CONSTRUCTION_FRONTAGE_OPTIONS } from "../core/constructionStorefrontGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { CONSTRUCTION_WINDOW_LAYOUTS, upgradeConstructionWindowVocabulary } from "../core/constructionWindowVocabulary";
import { ConstructionBuildingControls } from "./ConstructionBuildingControls";
import { ConstructionOpeningControls } from "./ConstructionOpeningControls";
import { ConstructionGroupedBayControls, type GroupedBayEdit } from "./ConstructionGroupedBayControls";
import { ConstructionFamilyFabricControls } from "./ConstructionFamilyFabricControls";
import { createConstructionFamilyFabricAssignments } from "../materials/constructionFamilyFabric";
import type { ConstructionFamilyFabricAssignments } from "../contracts/constructionFamilyFabric";
import type { ConstructionAwningFabricArtifact } from "../contracts/constructionAwningFabric";
import { ConstructionAwningControls } from "./ConstructionAwningControls";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionOpeningWidth, withoutConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { constructionOpeningOptions, supportsGroupedConstruction, groupedWindowCount, groupedStorefrontCount } from "./constructionBuildingBindings";
import { ConstructionReferenceSnapshotSchema, type ConstructionReferenceSnapshot } from "../contracts/constructionGeneration";
import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalJson } from "../core/canonicalJson";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { createConstructionFamilySource, readConstructionFamilySource, withUpdatedConstructionFamilyMembers, type ConstructionFamilyPayload } from "../state/constructionFamilySource";
import { resolveConstructionFamilyComposition } from "../core/constructionFamilyComposition";
import { resolveConstructionFamilyPierVariation } from "../core/constructionFamilyPierVariation";
import { parseBuildingSourceFile } from "../state/buildingSourceFile";
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
import { prepareBayConstructionFixture, prepareConstructionFamilyFixture, createBayConstructionMaterials, createReferenceConstructionMaterials, type BayConstructionFixture, type BayConstructionMaterials } from "./bayConstructionFixture";

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
  familyMemberMode?: boolean;
  familyReturning?: boolean;
  familyMemberNumber?: number;
}
const names: Record<BayConstructionNode["type"], string> = {
  EditOpeningWidth: "Selected opening widths",
  Footprint: "Footprint", Storeys: "Storeys", PlaceStorefront: "Ground frontage", PlaceDoor: "Entrance layout", AssembleDoor: "Door assembly", BuildingRoof: "Complete roof", FacadeScope: "Facade scope", PlaceOpening: "Opening layout", EmitWall: "Wall", AssembleWindow: "Window assembly", Output: "Output",
  SplitFloors: "Split floors", SplitBays: "Split bays", SelectScopes: "Select scopes", ProfileTrim: "Profile trim", RoofCap: "Roof cap", JoinGeometry: "Join geometry", SetSurface: "Surface finish"
};
const labels: Record<string, string> = {
  mode: "Ground frontage", pierWidthM: "Masonry pier width (m)", bulkheadHeightM: "Bulkhead height (m)", headHeightM: "Head band height (m)", transomBaseM: "Transom level (m)",
  layout: "Window assembly", corniceAssembly: "Cornice treatment", parapetSilhouette: "Parapet silhouette",
  groundHeightM: "Ground storey height (m)", upperHeightM: "Upper storey height (m)", leafHeightM: "Door leaf height (m)", thresholdProjectionM: "Threshold projection (m)", parapetHeightM: "Parapet height (m)", copingProjectionM: "Coping projection (m)", corniceHeightM: "Cornice height (m)", corniceProjectionM: "Cornice projection (m)",
  widthM: "Width (m)", heightM: "Height (m)", wallDepthM: "Wall depth (m)", sillM: "Sill height (m)",
  recessM: "Recess (m)", frameWidthM: "Frame width (m)", sillProjectionM: "Sill projection (m)",
  count: "Count", floorIndex: "Floor index (-1 = all)", bayIndex: "Bay index (-1 = all)", depthM: "Depth (m)", projectionM: "Projection (m)"
};
const displayNumber = (value: number) => String(Number(value.toPrecision(12)));
function describeFamilyMember(graph: BayConstructionGraph) {
  const opening = graph.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead ?? 0;
  const sash = graph.nodes.find(node => node.type === "AssembleWindow")?.parameters.layout ?? 0;
  const frontage = graph.nodes.find(node => node.type === "PlaceStorefront")?.parameters.mode ?? 0;
  const floorCount = graph.nodes.find(node => node.type === "Storeys")?.parameters.count, bayCount = graph.nodes.find(node => node.type === "SplitBays")?.parameters.count;
  const roof = graph.nodes.find(node => node.type === "BuildingRoof")?.parameters;
  const groups = graph.upperBayGroups ?? [];
  const grouped = groups.length ? groups.map(group => `${group.memberCount === 2 ? "Pair" : "Three windows"} at storey ${group.floorIndex+1}, bay ${group.bayIndex+1} (${group.memberWidthM} m)`).join("; ") : "Single openings";
  const lights = graph.storefrontDivision ?? { displayLights: 1, transomLights: 1 };
  return `${floorCount} storeys / ${bayCount} bays · ${opening ? "Round head" : "Flat head"} · ${["Double-hung", "Twin casement", "Six-light casement"][sash]} · ${grouped} · ${frontage ? `Storefront (${lights.displayLights} display / ${lights.transomLights} transom)` : "Punched ground floor"} · ${["Moulded", "Dentil", "Bracket"][roof?.corniceAssembly ?? 0]} cornice · ${roof?.parapetSilhouette ? "Raised parapet" : "Flat parapet"}`;
}
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
export function BayConstructionWorkbench({ base, acquireBaseLease, initialSession, onSessionChange, onReturn, rendererFactory, recoveryStatus, onInitialFailure, familyMemberMode = false, familyReturning = false, familyMemberNumber }: Props) {
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
  const [awningFabric, setAwningFabric] = useState<BayConstructionMaterials["awningFabric"]>(startingSession?.materials.awningFabric);
  const [pending, setPending] = useState(true), [saving, setSaving] = useState(false), [buildingDirty, setDirty] = useState(false);
  const [openingDirty, setOpeningDirty] = useState(false);
  const [groupDirty, setGroupDirty] = useState(false);
  const dirty = buildingDirty || openingDirty || groupDirty;
  const [error, setError] = useState<string | null>(null), [viewerReady, setViewerReady] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const selectedFrameRef = useRef<string | null>(null);
  const [previewNode, setPreviewNode] = useState<string | null>(null);
  const [familyPreview, setFamilyPreview] = useState(false);
  const [familyDirty, setFamilyDirty] = useState(false);
  const [familySeed, setFamilySeed] = useState("building-family-1");
  const [familyVariation, setFamilyVariation] = useState({ openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: false, entranceBay: false });
  const [familyPierVariation, setFamilyPierVariation] = useState(false);
  const [familyDetails, setFamilyDetails] = useState<string[]>([]);
  const [familyFabricView, setFamilyFabricView] = useState<{ inherited: ConstructionAwningFabricArtifact; memberIds: string[]; assignments?: ConstructionFamilyFabricAssignments } | null>(null);
  const familySource = useRef<ConstructionFamilyPayload | null>(null);
  const [memberIndex, setMemberIndex] = useState(0);
  const [memberEdit, setMemberEdit] = useState<{ documentId: string; number: number; session: BayConstructionSession } | null>(null);
  const memberEditId = useRef<string | null>(null);
  const memberHistories = useRef(new Map<string, ConstructionHistorySnapshot | null>());
  const shown = useRef<BayConstructionFixture | null>(null);
  const alive = useRef(false), sequence = useRef(0), abort = useRef<AbortController | null>(null);
  const compiler = useRef<BayConstructionClient | null>(null);
  const current = useRef<{ fixture: BayConstructionFixture; materials: BayConstructionMaterials; generation: ConstructionGenerationLineage | null } | null>(null);
  const owners = useRef(new Map<AssemblyHallFixture, Owner>());
  const viewer = useRef<BuildingFixtureViewerPreparer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), familyInput = useRef<HTMLInputElement>(null), downloads = useRef(new Map<string, number>());

  const chooseFrame = useCallback((path: string | null) => {
    if (selectedFrameRef.current !== path) { selectedFrameRef.current = path; setSelectedFrame(path); setOpeningDirty(false); }
  }, []);
  const selectFrame = useCallback((selection: AssemblyHallWindowSelection | null) => {
    if (selection && (selection.fixture !== current.current?.fixture || shown.current !== selection.fixture)) return;
    chooseFrame(selection?.semanticPath ?? null);
  }, [chooseFrame]);

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
        previous.materials.file.contentHash === materials.file.contentHash && previous.materials.awningFabric?.contentHash === materials.awningFabric?.contentHash && canonicalJson(previous.generation) === canonicalJson(nextGeneration)) {
      setDraft(graph); setFields(fieldsFor(graph)); setDirty(false); setOpeningDirty(false); setGroupDirty(false); setError(null);
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
      setAwningFabric(materials.awningFabric);
      setGeneration(nextGeneration);
      if (historyAction === "open" || historyAction === "undo" || historyAction === "redo") { referenceSequence.current++; setReferenceDraft(null); }
      if (nextGeneration) setGenerationControls(controls => ({ ...controls, ...controlsFrom(nextGeneration) }));
      setPreviewNode(null);
      setFamilyPreview(false);
      setFamilyDirty(false);
      familySource.current = null;
      memberHistories.current.clear();
      setAccepted(candidate); setDraft(result.graph); setFields(fieldsFor(result.graph));
      setSelected(id => result.graph.nodes.some(node => node.id === id) ? id : result.graph.nodes[0].id);
      setDirty(false); setOpeningDirty(false); setGroupDirty(false); setError(null);
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
      if (graph.schemaVersion === "0.12.0" && !constructionHasStorefront(graph)) {
        const { storefrontDivision: _removed, ...prior } = graph; void _removed;
        await publish(BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.11.0" }), materials, token, signal);
        return;
      }
      await publish(BayConstructionGraphSchema.parse(graph), materials, token, signal);
    });
  }
  async function open(file: File) {
    await perform(async (token, signal) => {
      const { project, materials } = await readBayConstructionProject(JSON.parse(await file.text()));
      await publish(project.graph, { ...materials, file: project.materialSource, ...(project.awningFabric ? { awningFabric: project.awningFabric } : {}) }, token, signal, "open", project.generation ?? null);
    });
  }
  async function changeFacadePiers(enabled: boolean) {
    const source = current.current;
    if (!source || dirty || previewNode || shown.current !== source.fixture) return;
    await perform(async (token, signal) => {
      const graph = enabled ? withConstructionFacadePiers(source.fixture.construction.graph, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 })
        : withoutConstructionFacadePiers(source.fixture.construction.graph);
      await publish(graph, source.materials, token, signal);
    });
  }
  async function applyOpeningWidth(text: string | null) {
    const source = current.current;
    if (!source || buildingDirty || previewNode || shown.current !== source.fixture) return;
    const option = constructionOpeningOptions(source.fixture.construction.graph, source.fixture.ir).find(value=>value.path===selectedFrameRef.current);
    await perform(async (token,signal) => {
      if (!option) throw new Error("Select a current upper-front window before editing its width.");
      if (text !== null && (!text.trim() || !Number.isFinite(Number(text)))) throw new Error("Enter a finite selected-window width.");
      const graph = text === null ? withoutConstructionOpeningWidth(source.fixture.construction.graph,option.target)
        : withConstructionOpeningWidth(source.fixture.construction.graph,{target:option.target,widthM:Number(text)});
      await publish(graph,source.materials,token,signal);
    });
  }
  async function applyGroupedBay(edit: GroupedBayEdit) {
    const source = current.current;
    if (!source || buildingDirty || openingDirty || previewNode || shown.current !== source.fixture) return;
    await perform(async (token, signal) => {
      const original = source.fixture.construction.graph;
      const groups = (original.upperBayGroups ?? []).filter(group => !(group.storeysNodeId === "facade" && group.floorIndex === edit.floorIndex && group.bayIndex === edit.bayIndex));
      if (edit.memberCount !== 1) {
        if (original.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead === 1)
          throw new Error("Grouped windows need flat heads. Change Upper front opening head to Flat head first.");
        const widthEdits = original.nodes.find(node => node.type === "EditOpeningWidth");
        if (widthEdits && !widthEdits.bypassed && widthEdits.overrides.some(({ target }) => target.storeysNodeId === "facade" && target.face === "front" && target.floorIndex === edit.floorIndex && target.bayIndex === edit.bayIndex))
          throw new Error("Reset this bay's selected-window width before grouping it.");
        if (!edit.memberWidthM.trim() || !edit.pierWidthM.trim() || !Number.isFinite(Number(edit.memberWidthM)) || !Number.isFinite(Number(edit.pierWidthM)))
          throw new Error("Enter finite window and masonry widths.");
        groups.push({ storeysNodeId: "facade", floorIndex: edit.floorIndex, bayIndex: edit.bayIndex,
          memberCount: edit.memberCount, memberWidthM: Number(edit.memberWidthM), pierWidthM: Number(edit.pierWidthM) });
      }
      let graph: BayConstructionGraph;
      if (groups.length || ["0.12.0", "0.13.0", "0.14.0", "0.15.0"].includes(original.schemaVersion)) graph = withConstructionGroupedBays(original, groups);
      else if (original.schemaVersion === "0.11.0") {
        const { upperBayGroups: _removed, ...prior } = original; void _removed;
        graph = BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.10.0" });
      } else graph = original;
      await publish(graph, source.materials, token, signal);
      if (current.current && canonicalJson(current.current.fixture.construction.graph) === canonicalJson(graph)) chooseFrame(null);
    });
  }
  async function changeAwning(bayIndex: number, enabled: boolean, dimensions?: { projectionM: number; dropM: number; valanceHeightM: number }) {
    const source = current.current;
    if (!source || dirty || previewNode || shown.current !== source.fixture) return;
    await perform(async (token, signal) => {
      if (familyMemberMode && !source.materials.awningFabric) throw new Error("Add awnings to the original building before creating this family.");
      const original = source.fixture.construction.graph;
      const awnings = (original.awnings ?? []).filter(awning => awning.bayIndex !== bayIndex);
      if (enabled) awnings.push({ bayIndex, ...(dimensions ?? { projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }) });
      awnings.sort((a, b) => a.bayIndex - b.bayIndex);
      let baseGraph = original;
      if (!enabled && original.awningSupports) {
        const remaining = original.awningSupports.filter(support => support.bayIndex !== bayIndex);
        if (remaining.length) baseGraph = BayConstructionGraphSchema.parse({ ...original, awningSupports: remaining });
        else { const { awningSupports: _removed, ...prior } = original; void _removed; baseGraph = BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.13.0" }); }
      }
      let graph: BayConstructionGraph;
      if (awnings.length) graph = withConstructionAwnings(baseGraph, awnings);
      else if (baseGraph.schemaVersion === "0.13.0") {
        const { awnings: _removed, ...prior } = baseGraph; void _removed;
        graph = BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.12.0" });
      } else return;
      const fabric = source.materials.awningFabric ?? await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "buildo-awning-demo-v1", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
      if (signal.aborted) return;
      await publish(graph, { ...source.materials, awningFabric: fabric }, token, signal);
    });
  }
  async function changeAwningSupport(bayIndex: number, enabled: boolean) {
    const source = current.current;
    if (!source || familyMemberMode || dirty || previewNode || shown.current !== source.fixture) return;
    await perform(async (token, signal) => {
      const original = source.fixture.construction.graph;
      if (!original.awnings?.some(awning => awning.bayIndex === bayIndex)) throw new Error("Add an awning to this bay before adding supports.");
      const supports = (original.awningSupports ?? []).filter(support => support.bayIndex !== bayIndex);
      if (enabled) supports.push({ bayIndex, anchorRiseM: 0.15, thicknessM: 0.03 });
      supports.sort((a, b) => a.bayIndex - b.bayIndex);
      let graph: BayConstructionGraph;
      if (supports.length) graph = withConstructionAwningSupports(original, supports);
      else if (original.schemaVersion === "0.14.0") { const { awningSupports: _removed, ...prior } = original; void _removed; graph = BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.13.0" }); }
      else return;
      await publish(graph, source.materials, token, signal);
    });
  }
  async function changeAwningFabric(pattern: "solid" | "striped", primary: [number, number, number], secondary: [number, number, number]) {
    const source = current.current;
    if (!source || !source.materials.awningFabric || familyMemberMode || dirty || previewNode || shown.current !== source.fixture) return;
    await perform(async (token, signal) => {
      const fabric = await createConstructionAwningFabric({ ...source.materials.awningFabric!.source, pattern, primary, secondary });
      if (signal.aborted) return;
      await publish(source.fixture.construction.graph, { ...source.materials, awningFabric: fabric }, token, signal);
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
        plan = generated.plan; materials = { ...generated.materials, ...(acceptedSource.materials.awningFabric ? { awningFabric: acceptedSource.materials.awningFabric } : {}) };
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
    if (!source || !target || pending || saving || dirty || familyReturning) return;
    await perform((token, signal) => publish(target, source.materials, token, signal, direction, history.targetGeneration(direction)));
  }
  function revertDraft() {
    const source = current.current; if (!source) return;
    const graph = source.fixture.construction.graph;
    setDraft(graph); setFields(fieldsFor(graph)); setDirty(false); setOpeningDirty(false); setGroupDirty(false); setError(null);
    setSelected(id => graph.nodes.some(node => node.id === id) ? id : graph.nodes[0].id);
  }
  async function preview(id: string | null) {
    const source = current.current;
    if (!source || familyDirty) return;
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
        shown.current = candidate; setAccepted(candidate); setPreviewNode(id); setFamilyPreview(false); setFamilyDirty(false); familySource.current = null; memberHistories.current.clear();
        if (previous && previous !== source.fixture && previous !== candidate) retire(previous);
        finalize?.();
      } catch (failure) { prepared?.discard(); if (id) retire(candidate); throw failure; }
    });
  }
  async function previewFamily() {
    const source = current.current;
    if (!source?.generation || dirty) return;
    await perform(async (token, signal) => {
      if (familyVariation.awnings && !source.materials.awningFabric) throw new Error("Add an awning to the original building before varying awnings across the family.");
      const isCurrent = () => alive.current && sequence.current === token && !signal.aborted && current.current === source;
      const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request",
        familyId: "preview_family", familySeed, graph: source.fixture.construction.graph });
      const { entranceBay: _entrancePolicy, ...v5Policy } = familyVariation; void _entrancePolicy;
      const { awnings: _awningPolicy, ...legacyPolicy } = v5Policy; void _awningPolicy;
      const composition = Object.values(familyVariation).some(Boolean) ? resolveConstructionFamilyComposition(familyVariation.entranceBay
        ? { schemaVersion: "0.6.0", kind: "construction-family-composition-request", familySeed, policy: familyVariation, openingLock: generationControls.lockOpenings }
        : familyVariation.awnings
        ? { schemaVersion: "0.5.0", kind: "construction-family-composition-request", familySeed, policy: v5Policy, openingLock: generationControls.lockOpenings }
        : familyVariation.massing
        ? { schemaVersion: "0.4.0", kind: "construction-family-composition-request", familySeed, policy: legacyPolicy, openingLock: generationControls.lockOpenings }
        : familyVariation.storefrontLights ? { schemaVersion: "0.3.0", kind: "construction-family-composition-request", familySeed, policy: { openings: familyVariation.openings, frontage: familyVariation.frontage, roof: familyVariation.roof, groupedBays: familyVariation.groupedBays, storefrontLights: true }, openingLock: generationControls.lockOpenings }
        : familyVariation.groupedBays ? { schemaVersion: "0.2.0", kind: "construction-family-composition-request", familySeed, policy: { openings: familyVariation.openings, frontage: familyVariation.frontage, roof: familyVariation.roof, groupedBays: true }, openingLock: generationControls.lockOpenings }
        : { schemaVersion: "0.1.0", kind: "construction-family-composition-request", familySeed,
          policy: { openings: familyVariation.openings, frontage: familyVariation.frontage, roof: familyVariation.roof }, openingLock: generationControls.lockOpenings }) : null;
      const pierVariation = familyPierVariation ? resolveConstructionFamilyPierVariation({ schemaVersion: "0.1.0", kind: "construction-family-pier-variation-request", familySeed, enabled: true, openingLock: generationControls.lockOpenings }) : null;
      const family = await resolveConstructionFamily(plan, source.generation, generationControls, signal, composition ?? undefined, pierVariation ?? undefined);
      if (!isCurrent()) return;
      const candidate = await prepareConstructionFamilyFixture(base, family.members.map(member => member.construction), source.materials, signal);
      if (!isCurrent()) { candidate.familyRuntime.dispose(); return; }
      owners.current.set(candidate, { fixture: candidate, leases: 0, retired: false });
      let prepared: PreparedBuildingFixtureView | undefined;
      try {
        if (viewer.current) prepared = await viewer.current(candidate, { signal });
        if (!isCurrent()) { prepared?.discard(); retire(candidate); return; }
        const finalize = prepared?.commit(), previous = shown.current;
        shown.current = candidate; setAccepted(candidate); setPreviewNode(null); setFamilyPreview(true); setFamilyDirty(false); chooseFrame(null);
        const familyBase = { kind: "construction-family-source" as const, familyId: plan.source.familyId,
          sourceDocumentId: source.fixture.construction.graph.documentId, familySeed: plan.source.familySeed,
          sourceGraph: source.fixture.construction.graph, sourceGeneration: source.generation!, materialSource: source.materials.file,
          members: family.members.map(member => ({ documentId: member.documentId, graph: member.construction.graph, generation: member.lineage })) };
        if (composition?.schemaVersion === "0.5.0" && !source.materials.awningFabric) throw new Error("Awning variation requires its saved fabric source.");
        familySource.current = pierVariation ? { ...familyBase, schemaVersion: "0.14.0", initialPierVariation: pierVariation, ...(composition ? { initialComposition: composition } : {}), ...(source.materials.awningFabric ? { awningFabric: source.materials.awningFabric } : {}) }
          : familyBase.sourceGraph.schemaVersion === "0.15.0" || familyBase.members.some(member => member.graph.schemaVersion === "0.15.0") ? { ...familyBase, schemaVersion: "0.13.0", ...(composition ? { initialComposition: composition } : {}), ...(source.materials.awningFabric ? { awningFabric: source.materials.awningFabric } : {}) }
          : composition?.schemaVersion === "0.6.0" ? { ...familyBase, schemaVersion: "0.12.0", initialComposition: composition, ...(source.materials.awningFabric ? { awningFabric: source.materials.awningFabric } : {}) }
          : familyBase.sourceGraph.schemaVersion === "0.14.0" && source.materials.awningFabric ? { ...familyBase, schemaVersion: "0.10.0", awningFabric: source.materials.awningFabric, ...(composition ? { initialComposition: composition } : {}) }
          : composition?.schemaVersion === "0.5.0" ? { ...familyBase, schemaVersion: "0.9.0", awningFabric: source.materials.awningFabric!, initialComposition: composition }
          : source.materials.awningFabric ? { ...familyBase, schemaVersion: "0.8.0", awningFabric: source.materials.awningFabric, ...(composition ? { initialComposition: composition } : {}) }
          : composition?.schemaVersion === "0.4.0" ? { ...familyBase, schemaVersion: "0.7.0", initialComposition: composition }
          : composition?.schemaVersion === "0.3.0" ? { ...familyBase, schemaVersion: "0.6.0", initialComposition: composition }
          : [familyBase.sourceGraph, ...familyBase.members.map(member => member.graph)].some(graph => graph.schemaVersion === "0.12.0")
          ? { ...familyBase, schemaVersion: "0.5.0", ...(composition ? { initialComposition: composition } : {}) }
          : composition?.schemaVersion === "0.2.0" ? { ...familyBase, schemaVersion: "0.4.0", initialComposition: composition }
          : composition ? { ...familyBase, schemaVersion: "0.3.0", initialComposition: composition } : { ...familyBase, schemaVersion: "0.2.0" };
        setFamilyFabricView(source.materials.awningFabric ? { inherited: source.materials.awningFabric, memberIds: familyBase.members.map(member => member.documentId) } : null);
        setFamilyDetails(familyBase.members.map(member => describeFamilyMember(member.graph)));
        memberHistories.current.clear(); setMemberIndex(0);
        if (previous && previous !== source.fixture && previous !== candidate) retire(previous);
        finalize?.();
      } catch (failure) { prepared?.discard(); retire(candidate); throw failure; }
    });
  }
  const updateFamilyMember = useCallback((session: BayConstructionSession) => {
    const source = familySource.current, id = memberEditId.current;
    if (!source || !id || session.graph.documentId !== id || !session.generation || session.materials.file.contentHash !== source.materialSource.contentHash) return;
    const assignment = (source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") ? source.fabricAssignments?.members.find(member => member.documentId === id) : undefined;
    const expectedFabric = assignment?.mode === "override" ? assignment.fabric : source.schemaVersion === "0.8.0" || source.schemaVersion === "0.9.0" || source.schemaVersion === "0.10.0" || source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0" ? source.awningFabric : undefined;
    if (session.materials.awningFabric?.contentHash !== expectedFabric?.contentHash) return;
    const currentMember = source.members.find(member => member.documentId === id);
    if (!currentMember) return;
    if (canonicalJson(currentMember.graph) !== canonicalJson(session.graph) || canonicalJson(currentMember.generation) !== canonicalJson(session.generation)) {
      const members = source.members.map(member => member.documentId === id
        ? { documentId: id, graph: session.graph, generation: session.generation! } : member);
      familySource.current = withUpdatedConstructionFamilyMembers(source, members);
      setFamilyDetails(familySource.current.members.map(member => describeFamilyMember(member.graph)));
      setFamilyDirty(true);
    }
    memberHistories.current.set(id, session.history ?? null);
  }, []);
  function editFamilyMember() {
    const source = familySource.current, materials = current.current?.materials, member = source?.members[memberIndex];
    if (!source || !materials || !member || pending || saving) return;
    memberEditId.current = member.documentId;
    const assignment = (source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") ? source.fabricAssignments?.members.find(value => value.documentId === member.documentId) : undefined;
    const memberMaterials = assignment?.mode === "override" ? { ...materials, awningFabric: assignment.fabric } : materials;
    setMemberEdit({ documentId: member.documentId, number: memberIndex + 1, session: { graph: member.graph, generation: member.generation,
      materials: memberMaterials, history: memberHistories.current.get(member.documentId) ?? null } });
  }
  async function returnToFamily() {
    const source = familySource.current, original = current.current;
    if (!source || !original || pending) return;
    await perform(async (token, signal) => {
      const isCurrent = () => alive.current && sequence.current === token && !signal.aborted && current.current === original && familySource.current === source;
      compiler.current ??= new BayConstructionClient(new Worker(new URL("../compiler/bayConstruction.worker.ts", import.meta.url), { type: "module" }));
      const results = [];
      for (const member of source.members) { results.push(await compiler.current.evaluate(member.graph)); if (!isCurrent()) return; }
      const candidate = await prepareConstructionFamilyFixture(base, results, original.materials, signal, (source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") ? source.fabricAssignments : undefined);
      if (!isCurrent()) { candidate.familyRuntime.dispose(); return; }
      owners.current.set(candidate, { fixture: candidate, leases: 0, retired: false });
      let prepared: PreparedBuildingFixtureView | undefined;
      try {
        if (viewer.current) prepared = await viewer.current(candidate, { signal });
        if (!isCurrent()) { prepared?.discard(); retire(candidate); return; }
        const finalize = prepared?.commit(), previous = shown.current;
        shown.current = candidate; setAccepted(candidate); setFamilyPreview(true); setMemberEdit(null); memberEditId.current = null;
        if (previous && previous !== original.fixture) retire(previous);
        finalize?.();
      } catch (failure) { prepared?.discard(); retire(candidate); throw failure; }
    });
  }
  async function changeFamilyFabric(pattern: "solid" | "striped" | null, primary?: [number, number, number], secondary?: [number, number, number]) {
    const source = familySource.current, original = current.current, member = source?.members[memberIndex];
    if (!source || !original || !member || !("awningFabric" in source) || !source.awningFabric || !familyPreview) return;
    const inheritedFabric = source.awningFabric;
    await perform(async (token, signal) => {
      const isCurrent = () => alive.current && sequence.current === token && !signal.aborted && current.current === original && familySource.current === source;
      const prior = (source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") && source.fabricAssignments ? source.fabricAssignments.members : source.members.map(item => ({ documentId: item.documentId, mode: "inherit" as const }));
      const selected = prior.find(item => item.documentId === member.documentId)!;
      const oldFabric = selected.mode === "override" ? selected.fabric : inheritedFabric;
      const replacement = pattern === null ? { documentId: member.documentId, mode: "inherit" as const }
        : { documentId: member.documentId, mode: "override" as const, fabric: await createConstructionAwningFabric({ ...oldFabric.source, pattern, primary, secondary }) };
      if (!isCurrent()) return;
      const assignments = await createConstructionFamilyFabricAssignments({ schemaVersion: "0.1.0", kind: "construction-family-fabric-assignments", familyId: source.familyId,
        sourceDocumentId: source.sourceDocumentId, inheritedFabric, members: prior.map(item => item.documentId === member.documentId ? replacement : item) });
      if (!isCurrent()) return;
      const results = []; compiler.current ??= new BayConstructionClient(new Worker(new URL("../compiler/bayConstruction.worker.ts", import.meta.url), { type: "module" }));
      for (const item of source.members) { results.push(await compiler.current.evaluate(item.graph)); if (!isCurrent()) return; }
      const candidate = await prepareConstructionFamilyFixture(base, results, original.materials, signal, assignments);
      if (!isCurrent()) { candidate.familyRuntime.dispose(); return; }
      owners.current.set(candidate, { fixture: candidate, leases: 0, retired: false });
      let prepared: PreparedBuildingFixtureView | undefined;
      try {
        if (viewer.current) prepared = await viewer.current(candidate, { signal });
        if (!isCurrent()) { prepared?.discard(); retire(candidate); return; }
        const finalize = prepared?.commit(), previous = shown.current;
        shown.current = candidate; setAccepted(candidate);
        familySource.current = source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0" ? { ...source, fabricAssignments: assignments } : { ...source, schemaVersion: "0.11.0", fabricAssignments: assignments };
        setFamilyFabricView({ inherited: inheritedFabric, memberIds: source.members.map(item => item.documentId), assignments }); setFamilyDirty(true);
        if (previous && previous !== original.fixture && previous !== candidate) retire(previous);
        finalize?.();
      } catch (failure) { prepared?.discard(); retire(candidate); throw failure; }
    });
  }
  function downloadJson(value: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    const timer = window.setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1500);
    downloads.current.set(url, timer);
  }
  async function saveFamily() {
    const snapshot = familySource.current;
    if (!snapshot) return;
    setSaving(true); setError(null);
    try {
      const file = await createConstructionFamilySource(snapshot);
      if (alive.current && familySource.current === snapshot) { downloadJson(file, `${file.familyId}.buildo-family.json`); setFamilyDirty(false); }
    } catch (failure) { if (alive.current && familySource.current === snapshot) setError(problem(failure)); }
    finally { if (alive.current) setSaving(false); }
  }
  async function openFamily(file: File) {
    if (familyDirty) return;
    await perform(async (token, signal) => {
      const previous = current.current;
      const isCurrent = () => alive.current && sequence.current === token && !signal.aborted && current.current === previous;
      const source = await readConstructionFamilySource(JSON.parse(await file.text()));
      if (!isCurrent()) return;
      const parsed = await parseBuildingSourceFile(source.materialSource);
      const materials = { ...parsed, file: source.materialSource, ...(source.schemaVersion === "0.8.0" || source.schemaVersion === "0.9.0" || source.schemaVersion === "0.10.0" || source.schemaVersion === "0.11.0" || (source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") && source.awningFabric ? { awningFabric: source.awningFabric } : {}) };
      if (!isCurrent()) return;
      compiler.current ??= new BayConstructionClient(new Worker(new URL("../compiler/bayConstruction.worker.ts", import.meta.url), { type: "module" }));
      const originalResult = await compiler.current.evaluate(source.sourceGraph);
      if (!isCurrent()) return;
      const results = [];
      for (const member of source.members) { results.push(await compiler.current.evaluate(member.graph)); if (!isCurrent()) return; }
      let original: BayConstructionFixture | undefined, candidate: BayConstructionFixture | undefined;
      let prepared: PreparedBuildingFixtureView | undefined;
      try {
        original = await prepareBayConstructionFixture(base, originalResult, materials, signal);
        if (!isCurrent()) { original.familyRuntime.dispose(); return; }
        owners.current.set(original, { fixture: original, leases: 0, retired: false });
        candidate = await prepareConstructionFamilyFixture(base, results, materials, signal, (source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") ? source.fabricAssignments : undefined);
        if (!isCurrent()) { candidate.familyRuntime.dispose(); retire(original); return; }
        owners.current.set(candidate, { fixture: candidate, leases: 0, retired: false });
        if (viewer.current) prepared = await viewer.current(candidate, { signal });
        if (!isCurrent()) { prepared?.discard(); retire(candidate); retire(original); return; }
        const finalize = prepared?.commit(), previousShown = shown.current;
        current.current = { fixture: original, materials, generation: source.sourceGeneration };
        setAwningFabric(materials.awningFabric);
        shown.current = candidate; setAccepted(candidate); setDraft(source.sourceGraph); setFields(fieldsFor(source.sourceGraph));
        setSelected(source.sourceGraph.nodes[0].id); setGeneration(source.sourceGeneration);
        setGenerationControls(controls => ({ ...controls, ...controlsFrom(source.sourceGeneration) }));
        const composition = "initialComposition" in source ? source.initialComposition : undefined;
        setFamilyFabricView("awningFabric" in source && source.awningFabric ? { inherited: source.awningFabric, memberIds: source.members.map(member => member.documentId), ...((source.schemaVersion === "0.11.0" || source.schemaVersion === "0.12.0" || source.schemaVersion === "0.13.0" || source.schemaVersion === "0.14.0") && source.fabricAssignments ? { assignments: source.fabricAssignments } : {}) } : null);
        setFamilySeed(source.familySeed); setFamilyPierVariation(source.schemaVersion === "0.14.0" && source.initialPierVariation.source.enabled); setFamilyVariation(composition ? { ...composition.source.policy, groupedBays: "groupedBays" in composition.source.policy ? composition.source.policy.groupedBays : false, storefrontLights: "storefrontLights" in composition.source.policy ? composition.source.policy.storefrontLights : false, massing: "massing" in composition.source.policy ? composition.source.policy.massing : false, awnings: "awnings" in composition.source.policy ? composition.source.policy.awnings : false, entranceBay: "entranceBay" in composition.source.policy ? composition.source.policy.entranceBay : false } : { openings: false, frontage: false, roof: false, groupedBays: false, storefrontLights: false, massing: false, awnings: false, entranceBay: false }); setFamilyDetails(source.members.map(member => describeFamilyMember(member.graph))); setPreviewNode(null); setFamilyPreview(true); setFamilyDirty(false); chooseFrame(null);
        setDirty(false); setOpeningDirty(false); setError(null); referenceSequence.current++; setReferenceDraft(null);
        const { contentHash: _hash, ...payload } = source; void _hash; familySource.current = payload;
        memberHistories.current.clear(); setMemberIndex(0);
        history.record(source.sourceGraph, materials.file.contentHash, true, source.sourceGeneration);
        onSessionChange({ graph: source.sourceGraph, materials, history: history.snapshot(), generation: source.sourceGeneration });
        if (previous) retire(previous.fixture);
        if (previousShown && previousShown !== previous?.fixture) retire(previousShown);
        finalize?.();
      } catch (failure) { prepared?.discard(); if (candidate) retire(candidate); if (original) retire(original); throw failure; }
    });
  }
  async function save() {
    const source = current.current;
    if (!source) return;
    setSaving(true); setError(null);
    try {
      const project = await createBayConstructionProject(source.fixture.construction.graph, source.materials.file, source.generation ?? undefined, source.materials.awningFabric);
      if (!alive.current || current.current !== source) return;
      downloadJson(project, `${project.graph.documentId}.buildo-construction.json`);
    } catch (failure) { if (alive.current) setError(problem(failure)); }
    finally { if (alive.current) setSaving(false); }
  }
  const node = draft.nodes.find(node => node.id === selected) ?? draft.nodes[0];
  const output = accepted?.construction.trace.find(entry => entry.nodeId === node.id);
  const disabled = pending || saving || openingDirty || groupDirty || familyPreview || familyReturning;
  function replace(next: BayConstructionNode) {
    setDraft(graph => ({ ...graph, nodes: graph.nodes.map(value => value.id === next.id ? next : value) }));
    setDirty(true);
  }
  function changeGraph(graph: BayConstructionGraph) {
    setDraft(graph); setFields(all => Object.fromEntries(graph.nodes.map(value => [value.id, all[value.id] ?? fieldsFor(graph)[value.id]])));
    setDirty(true);
  }
  const labelFor = (key: string) => key === "bayIndex" && node.type === "PlaceDoor" ? "Entrance bay index" : key === "count" ? (node.type === "SplitFloors" || node.type === "Storeys") ? "Floor count" : "Bay count" : labels[key];
  const pierProtected = accepted?.construction.graph.schemaVersion === "0.15.0";
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
              </select> : key === "corniceAssembly" ? <select aria-label="Cornice treatment" value={fields[node.id]?.[key] ?? "0"}
                onChange={event => {const text=event.currentTarget.value;setFields(all=>({...all,[node.id]:{...all[node.id],[key]:text}}));setDirty(true);}}>
                {CONSTRUCTION_CORNICE_LAYOUTS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : key === "parapetSilhouette" ? <select aria-label="Parapet silhouette" value={fields[node.id]?.[key] ?? "0"}
                onChange={event => {const text=event.currentTarget.value;setFields(all=>({...all,[node.id]:{...all[node.id],[key]:text}}));setDirty(true);}}>
                {CONSTRUCTION_PARAPET_SILHOUETTES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : key === "mode" && node.type === "PlaceStorefront" ? <select aria-label="Ground frontage" value={fields[node.id]?.[key] ?? "0"}
                onChange={event => {const text=event.currentTarget.value;setFields(all=>({...all,[node.id]:{...all[node.id],[key]:text}}));setDirty(true);}}>
                {CONSTRUCTION_FRONTAGE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : <input type="number" step={["count", "floorIndex", "bayIndex"].includes(key) ? "1" : "0.01"} aria-label={labelFor(key)} value={fields[node.id]?.[key] ?? ""}
                disabled={constructionHasStorefront(draft) && (node.type === "PlaceDoor" && key === "heightM" || node.type === "AssembleDoor" && key !== "thresholdProjectionM")}
                onChange={event => { const text = event.currentTarget.value; setFields(all => ({ ...all, [node.id]: { ...all[node.id], [key]: text } })); setDirty(true); }} />}
            </label>) : null}
            {constructionHasStorefront(draft) && (node.type === "PlaceDoor" || node.type === "AssembleDoor") ? <p>The ground frontage sets the door height, frame and recess. Use its head band and transom controls.</p> : null}
            {node.type === "EditOpeningWidth" ? <div><p>{node.overrides.length} local width {node.overrides.length===1?"override":"overrides"}. Use Selected window controls to apply or reset a width.</p>
              <ul>{node.overrides.map(({target,widthM})=><li key={`${target.floorIndex}/${target.bayIndex}`}>Front · Storey {target.floorIndex+1} · Bay {target.bayIndex+1}: {widthM} m</li>)}</ul></div> : null}
            {"input" in node ? <label className="control-panel__field-wide"><span>{node.input.socket === "scope" ? "Scope input" : node.input.socket === "footprint" ? "Footprint input" : "Geometry input"}</span>
              <select aria-label={node.input.socket === "scope" ? "Scope input" : node.input.socket === "footprint" ? "Footprint input" : "Geometry input"} value={node.input.nodeId}
                onChange={event => replace(BayConstructionNodeSchema.parse({ ...node, input: { nodeId: event.currentTarget.value, socket: node.input.socket } }))}>
                {draft.nodes.filter(value => value.id !== node.id && constructionOutputSocket(value.type) === node.input.socket)
                  .map(value => <option key={value.id} value={value.id}>{displayName(value)}</option>)}
              </select>
            </label> : null}
            {"input" in node && node.type !== "Storeys" ? <label className="control-panel__field-wide construction-contribution"><input type="checkbox" aria-label="Bypass selected node" checked={Boolean(node.bypassed)}
              onChange={event => { setDraft(graph => ({ ...graph, schemaVersion: ["0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0", "0.13.0", "0.14.0"].includes(graph.schemaVersion) ? graph.schemaVersion : "0.2.0" })); replace({ ...node, bypassed: event.currentTarget.checked }); }} /><span>Bypass this node</span></label> : null}
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
  return <><div hidden={Boolean(memberEdit)} style={memberEdit ? { display: "none" } : undefined} className={`building-workspace construction-workspace${buildingMode ? " construction-workspace--grouped" : ""}`} aria-label="Construction workspace"
    data-construction-undo={history.undoCount} data-construction-redo={history.redoCount}
    onKeyDown={event => { if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault(); void traverseHistory(event.shiftKey ? "redo" : "undo"); }}
    data-construction-hash={accepted?.ir.sourceGraphHash} data-construction-triangles={accepted?.ir.metrics.triangleCount}
    data-construction-kind={buildingMode ? "building" : facadeMode ? "facade" : "bay"} data-surface-layer-count={accepted?.construction.surfaceComposition?.layers.length ?? 0} data-construction-preview={familyPreview ? "family" : previewNode ?? "output"}>
    {buildingMode ? <header className="construction-workspace__toolbar"><p>{familyMemberMode ? `Building ${familyMemberNumber ?? ""} of 6` : "Building construction"}</p><div className="construction-project-actions">{historyActions}{!familyMemberMode ? fileActions : <button type="button" disabled={disabled || dirty || familyReturning} onClick={onReturn}>{familyReturning ? "Updating family…" : "Back to family"}</button>}</div></header> : null}
    <div className="building-workspace__stage">
      {accepted ? <AssemblyHall workspace constructionFrameSelection={!familyPreview} selectedConstructionPath={selectedFrame} onWindowSelectionChange={selectFrame} fixture={accepted} acquireFixtureViewerLease={acquireLease} registerFixtureViewer={registerViewer} rendererFactory={rendererFactory}
        title={buildingMode ? "Building construction" : facadeMode ? "Facade construction" : "Facade bay"} description={buildingMode ? "Footprint, storeys, openings and continuous architectural profiles" : facadeMode ? "Connected scopes, openings and shared procedural assemblies" : "An authored opening, sash and masonry scope"} showFamilyTools={false} lighting={buildingMode ? "construction" : "bay"} conciseFallback framing={buildingMode || facadeMode ? "facade" : "building"} />
        : <div className="room-panel__loading" role="status">Preparing construction materials and geometry…</div>}
      {!buildingMode ? nodeProperties : <p className="construction-workspace__target">Whole building · Shared architectural controls{selectedFrame ? ". Selected upper-front window widths can be edited separately; surface finishes retain their own scope." : ""}</p>}
    </div>
    <aside className="building-workspace__inspector" aria-label="Construction inspector" aria-busy={pending}>
      <h2>{buildingMode ? "Building controls" : "Construction"}</h2>
      <div className="construction-workspace__status">
      {recoveryStatus ? <p role="status" aria-label="Construction recovery" data-construction-recovery={recoveryStatus.state}
        data-construction-project-hash={recoveryStatus.projectHash}>{constructionRecoveryText(recoveryStatus)}</p> : null}
      <p role="status">{pending ? "Updating construction…" : familyPreview ? "Previewing six related buildings. Your authored building is unchanged." : dirty ? "Changes are not applied." : previewNode ? `Previewing ${previewType ? names[previewType] : "intermediate output"}. Saved construction is unchanged.` : accepted ? buildingMode ? "Building is up to date." : facadeMode ? "Facade is up to date." : "Bay is up to date." : "Construction is unavailable."}</p>
      {error ? <p role="alert">{error}</p> : null}
      </div>
      {buildingMode && !advancedOpen && accepted && supportsGroupedConstruction(accepted.construction.graph) ? <ConstructionOpeningControls
        key={accepted.ir.sourceGraphHash+":"+selectedFrame} options={constructionOpeningOptions(accepted.construction.graph,accepted.ir)} selectedPath={selectedFrame}
        disabled={pending || saving || familyPreview || familyReturning || buildingDirty || groupDirty || !viewerReady || Boolean(previewNode)} buildingDirty={buildingDirty}
        onSelect={path=>{const source=current.current;if(!source || shown.current!==source.fixture)return;
          if(!path || constructionOpeningOptions(source.fixture.construction.graph,source.fixture.ir).some(option=>option.path===path))chooseFrame(path||null);}}
        onApply={text=>void applyOpeningWidth(text)} onReset={()=>void applyOpeningWidth(null)} onDraftChange={value=>{setOpeningDirty(value);if(!value)setError(null);}} /> : null}
      {buildingMode && !advancedOpen && accepted && supportsGroupedConstruction(accepted.construction.graph) ? <ConstructionGroupedBayControls
        key={`${accepted.construction.graph.nodes.find(node => node.type === "Storeys")?.parameters.count}:${accepted.construction.graph.nodes.find(node => node.type === "SplitBays")?.parameters.count}`}
        graph={accepted.construction.graph} dirty={groupDirty} disabled={pending || saving || openingDirty || buildingDirty || familyPreview || familyReturning || !viewerReady || Boolean(previewNode)}
        onDraftChange={value => { setGroupDirty(value); if (!value) setError(null); }} onApply={edit => void applyGroupedBay(edit)} /> : null}
      {buildingMode && !advancedOpen && accepted && supportsGroupedConstruction(accepted.construction.graph) && constructionHasStorefront(accepted.construction.graph) ? <ConstructionAwningControls
        graph={accepted.construction.graph} disabled={pierProtected || pending || saving || openingDirty || buildingDirty || groupDirty || familyPreview || familyReturning || !viewerReady || Boolean(previewNode) || (familyMemberMode && !startingSession?.materials.awningFabric)}
        unavailableReason={familyMemberMode && !startingSession?.materials.awningFabric ? "Add an awning to the original building before creating this family." : undefined}
        supportDisabled={familyMemberMode} onSupportChange={(bay, enabled) => void changeAwningSupport(bay, enabled)}
        fabric={awningFabric} fabricDisabled={familyMemberMode}
        onFabricChange={(pattern, primary, secondary) => void changeAwningFabric(pattern, primary, secondary)}
        onChange={(bay, enabled, dimensions) => void changeAwning(bay, enabled, dimensions)} /> : null}
      {buildingMode && !advancedOpen && accepted && supportsGroupedConstruction(accepted.construction.graph) ? <section className="construction-generate" aria-label="Upper facade piers">
        <h3>Upper facade piers</h3>
        <p>Place a vertical pier at each front bay edge on upper storeys. The demo proportions require clearance from windows and trim.</p>
        <button type="button" disabled={disabled || dirty || openingDirty || groupDirty || !viewerReady || Boolean(previewNode)}
          onClick={() => void changeFacadePiers(!pierProtected)}>{pierProtected ? "Remove facade piers" : "Add facade piers"}</button>
      </section> : null}
      {buildingMode && !advancedOpen && accepted ? <ConstructionBuildingControls graph={draft} fields={fields} windowCount={groupedWindowCount(accepted.construction.graph,accepted.ir)} storefrontCount={groupedStorefrontCount(accepted.construction.graph,accepted.ir)} localWidthCount={constructionOpeningOptions(accepted.construction.graph,accepted.ir).filter(option=>option.overridden).length}
        disabled={disabled || !viewerReady || Boolean(previewNode)} dirty={buildingDirty}
        onStorefrontDivisionChange={(field, value) => {
          const division = { displayLights: 1, transomLights: 1, ...draft.storefrontDivision, [field]: value };
          if (division.displayLights === 1 && division.transomLights === 1 && draft.schemaVersion === "0.12.0") {
            const { storefrontDivision: _removed, ...prior } = draft; void _removed;
            setDraft(BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.11.0" }));
          } else setDraft(withConstructionStorefrontDivision(draft, division));
          setDirty(true);
        }}
        onFieldChange={(id,key,text) => {
          if (key === "upperFrontRoundHead") {
            const migrated = withConstructionRoundHead(draft, draft.nodes.find(node => node.type === "PlaceOpening")?.parameters.upperFrontRoundHead ?? 0);
            setDraft(migrated);setFields(all => ({...fieldsFor(migrated),...all,[id]:{...fieldsFor(migrated)[id],...all[id],[key]:text}}));
          } else if (key === "parapetSilhouette") {
            const migrated = withConstructionParapetSilhouette(draft, draft.nodes.find(node => node.type === "BuildingRoof")?.parameters.parapetSilhouette ?? 0);
            setDraft(migrated);setFields(all => ({...fieldsFor(migrated),...all,[id]:{...fieldsFor(migrated)[id],...all[id],[key]:text}}));
          } else if (key === "corniceAssembly") {
            const migrated = withConstructionCorniceLayout(draft, draft.nodes.find(node => node.type === "BuildingRoof")?.parameters.corniceAssembly ?? 0);
            setDraft(migrated);setFields(all => ({...fieldsFor(migrated),...all,[id]:{...fieldsFor(migrated)[id],...all[id],[key]:text}}));
          } else if (id === "frontage" && !draft.nodes.some(node => node.id === "frontage")) {
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
        <button type="button" disabled={familyMemberMode && (disabled || dirty || familyReturning)} onClick={onReturn}>{familyMemberMode ? "Back to family" : buildingMode ? "Advanced generator" : "Back to building"}</button>
        {facadeMode && !buildingMode ? <button type="button" disabled={disabled || dirty || !accepted || !viewerReady} onClick={()=>void completeBuilding()}>Complete building</button> : null}
        {!facadeMode ? <button type="button" disabled={disabled || dirty || !accepted || !viewerReady} onClick={() => void repeat()}>Repeat bay into facade</button> : null}
        {!familyMemberMode ? fileActions : null}
      </div>

      <div className="control-panel__actions construction-history" aria-label="Construction history">
        <button type="button" aria-label="Undo construction" disabled={disabled || dirty || !viewerReady || !history.canUndo} onClick={() => void traverseHistory("undo")}>{buildingMode ? "Undo" : "Undo construction"}</button>
        <button type="button" aria-label="Redo construction" disabled={disabled || dirty || !viewerReady || !history.canRedo} onClick={() => void traverseHistory("redo")}>{buildingMode ? "Redo" : "Redo construction"}</button>
      </div>
      </> : null}
      {buildingMode ? <details className="construction-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
        <summary>Advanced recipe graph</summary>
        {advancedOpen ? <><p>Connections change construction logic. Added nodes or custom connections pause recipe generation until restored.</p>
          {pierProtected ? <p>Advanced graph editing and node previews are unavailable while facade piers are present.</p> : nodeProperties}
      <ConstructionNodePanel graph={draft} selected={node.id} disabled={pierProtected || disabled} names={names} onSelect={setSelected} onChange={changeGraph} />
      <div className="control-panel__actions construction-preview-actions">
        <button type="button" disabled={pierProtected || disabled || dirty || !viewerReady} onClick={() => void preview(node.id)}>Preview selected</button>
        <button type="button" disabled={disabled || !previewNode || !viewerReady} onClick={() => void preview(null)}>Show construction</button>
      </div>
          {!familyMemberMode ? <button type="button" onClick={onReturn}>Advanced generator</button> : null}</> : null}
      </details> : <>
      <ConstructionNodePanel graph={draft} selected={node.id} disabled={pierProtected || disabled} names={names} onSelect={setSelected} onChange={changeGraph} />
      <div className="control-panel__actions construction-preview-actions">
        <button type="button" disabled={pierProtected || disabled || dirty || !viewerReady} onClick={() => void preview(node.id)}>Preview selected</button>
        <button type="button" disabled={disabled || !previewNode || !viewerReady} onClick={() => void preview(null)}>Show construction</button>
      </div></>}

      {accepted ? <ConstructionSurfacePanel graph={draft} atlas={accepted.packedAtlas} selectedPath={selectedFrame} selectedNode={selected} disabled={pierProtected || disabled || Boolean(previewNode)}
        onChange={(graph, id) => { changeGraph(graph); setSelected(id); }} /> : null}
      {buildingMode && !familyMemberMode ? <details className="construction-generate"><summary>Generate & vary</summary><ConstructionGenerationPanel controls={generationControls} lineage={generation} reference={referenceDraft} onReferenceFile={file => void importReference(file)} disabled={disabled || dirty || !viewerReady}
        onChange={setGenerationControls} onGenerate={reroll => void generateBuilding(reroll)} /></details> : null}
      {buildingMode && !familyMemberMode ? <section className="construction-generate" aria-label="Building family preview"><h3>Related buildings</h3>
        <p>Preview six related buildings using this building's material. Choose which architectural details may vary; unchecked groups keep your authored choices. The current choices use a small demo catalog.</p>
        <div className="control-panel__fields"><label><span>Family seed</span><input aria-label="Family seed" value={familySeed} disabled={pending || saving || familyPreview} onChange={event => setFamilySeed(event.currentTarget.value)} /></label></div>
        <fieldset className="construction-family-variation" disabled={pending || saving || familyPreview}><legend>Vary architectural details</legend>
          <label><input type="checkbox" checked={familyVariation.openings} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, openings: checked })); }} /> Opening heads and sash</label>
          <label><input type="checkbox" checked={familyVariation.groupedBays} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, groupedBays: checked })); }} /> Grouped upper windows</label>
          <label><input type="checkbox" checked={familyVariation.frontage} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, frontage: checked })); }} /> Ground frontage</label>
          <label><input type="checkbox" checked={familyVariation.storefrontLights} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, storefrontLights: checked })); }} /> Storefront pane divisions</label>
          <label><input type="checkbox" checked={familyVariation.entranceBay} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, entranceBay: checked })); }} /> Entrance position</label>
          <label><input type="checkbox" checked={familyVariation.awnings} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, awnings: checked })); }} /> Additional storefront awnings</label>
          <label><input type="checkbox" checked={familyVariation.massing} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, massing: checked })); }} /> Storey and bay counts</label>
          <label><input type="checkbox" checked={familyVariation.roof} onChange={event => { const checked = event.currentTarget.checked; setFamilyVariation(value => ({ ...value, roof: checked })); }} /> Cornice and parapet</label>
          <label><input type="checkbox" checked={familyPierVariation} onChange={event => setFamilyPierVariation(event.currentTarget.checked)} /> Upper facade piers</label>
        </fieldset>
        {familyVariation.entranceBay ? <p>Entrance variation requires an unchanged entrance bay and a storefront without authored awnings. Turn off ground-frontage and additional-awning variation.</p> : null}
        {familyPierVariation ? <p>Vary demo piers across the family. Existing authored piers are retained; openings need enough clearance.</p> : null}
        {generationControls.lockOpenings && (familyVariation.openings || familyVariation.frontage || familyVariation.groupedBays || familyVariation.storefrontLights || familyVariation.awnings || familyVariation.entranceBay || familyPierVariation) ? <p>Unlock openings to vary opening heads, grouped windows, sash, storefronts, entrances, awnings or piers.</p> : null}
        <div className="control-panel__actions">{familyPreview ? <button type="button" disabled={pending || saving || !viewerReady || familyDirty} onClick={() => void preview(null)}>Return to building</button>
          : <button type="button" disabled={disabled || dirty || !viewerReady || !generation || Boolean(previewNode) || !familySeed.trim()} onClick={() => void previewFamily()}>Preview family</button>}</div>
        <div className="control-panel__actions"><button type="button" disabled={pending || saving || !familyPreview} onClick={() => void saveFamily()}>Save family</button>
          <button type="button" disabled={pending || saving || dirty || familyDirty || !viewerReady} onClick={() => familyInput.current?.click()}>Open family</button>
          <input ref={familyInput} type="file" accept=".json,application/json" hidden aria-label="Open family file"
            onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void openFamily(file); }} /></div>
        {familyPreview ? <><div className="control-panel__fields"><label><span>Family member</span><select aria-label="Family member" value={memberIndex} disabled={pending || saving} onChange={event => setMemberIndex(Number(event.currentTarget.value))}>
          {Array.from({ length: 6 }, (_, index) => <option key={index} value={index}>Building {index + 1}</option>)}</select></label></div>
          {familyDetails[memberIndex] ? <p aria-label="Selected building details">{familyDetails[memberIndex]}</p> : null}
          {familyFabricView ? (() => { const assignment = familyFabricView.assignments?.members.find(item => item.documentId === familyFabricView.memberIds[memberIndex]);
            const fabric = assignment?.mode === "override" ? assignment.fabric : familyFabricView.inherited;
            return <ConstructionFamilyFabricControls buildingNumber={memberIndex + 1} fabric={fabric} inherited={assignment?.mode !== "override"} disabled={pending || saving}
              onApply={(pattern, primary, secondary) => void changeFamilyFabric(pattern, primary, secondary)} onReset={() => void changeFamilyFabric(null)} />;
          })() : null}
          <div className="control-panel__actions"><button type="button" disabled={pending || saving} onClick={editFamilyMember}>Edit selected building</button></div></> : null}
        {familyDirty ? <p role="status">Family changes are unsaved. Save the family before returning to the original building or opening another family.</p> : null}
        {!generation ? <p>Generate the building once to pin its reference and material source.</p> : null}
      </section> : null}

    </aside>
  </div>{memberEdit ? <div>{error ? <p role="alert">{error}</p> : null}<BayConstructionWorkbench base={base} acquireBaseLease={acquireBaseLease} initialSession={memberEdit.session}
      onSessionChange={updateFamilyMember} onReturn={() => void returnToFamily()} rendererFactory={rendererFactory} familyMemberMode familyReturning={pending} familyMemberNumber={memberEdit.number} /></div> : null}</>;
}

