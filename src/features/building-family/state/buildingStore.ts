import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type { GenerationRun, GenerationRunEvent, GenerationStage } from "../contracts/generationRun";
import type { Seeds } from "../contracts/shared";
import {
  computeBuildingInvalidation,
  type BuildingControlSnapshot,
  type BuildingInvalidation
} from "../core/invalidation";
import type { BuildingArtifactMetadata, BuildingArtifactType } from "./artifactRegistry";

export type BuildingRoom =
  | "promptLab"
  | "atlasLab"
  | "componentForge"
  | "artKitLab"
  | "sampleGallery"
  | "periodRef"
  | "assemblyHall";
export type BuildingDetailLevel = "high" | "low";
export type BuildingRoofType = "flat" | "gable";
export type BuildingTrimDensity = "restrained" | "moderate" | "ornate";
export type BuildingFidelityMode = "proof" | "kit";
export const defaultBuildingDocumentId = "buildo-demo-family";

export interface BuildingPromptControls {
  prompt: string;
  psgPresetId: "late19cCommercialDemo";
  stylePackId: "late-19c-commercial-demo";
  seeds: Seeds;
  floorCount: number;
  bayCount: number;
  detailLevel: BuildingDetailLevel;
  fidelityMode: BuildingFidelityMode;
  roofType: BuildingRoofType;
  trimDensity: BuildingTrimDensity;
  windowFamily: string;
  corniceFamily: string;
  remoteMaterialEnabled: boolean;
  lockedComponentKeys: string[];
}

export type BuildingPromptControlPatch = Partial<Omit<BuildingPromptControls, "seeds">> & {
  seeds?: Partial<Seeds>;
};

export interface BuildingRunSliceState {
  activeRunId?: string;
  activeFixtureArtifactId?: string;
  currentRun: GenerationRun | null;
  error?: string;
  status: "idle" | "running" | "complete" | "failed" | "cancelled";
}

export interface BuildingArtifactSliceState {
  byId: Record<string, BuildingArtifactMetadata>;
  byType: Partial<Record<BuildingArtifactType, string[]>>;
}

export interface BuildingControlSliceState {
  baselineStatus: "known" | "unknown";
  committedPrompt: BuildingPromptControls | undefined;
  invalidation: BuildingInvalidation;
}

export interface BuildingSelectionSliceState {
  documentId: string;
  room: BuildingRoom;
  selectedSemanticPath?: string;
  selectedComponentRecipeId?: string;
  showProvenance: boolean;
  showSemanticPaths: boolean;
}

export interface BuildingStoreState {
  prompt: BuildingPromptControls;
  controls: BuildingControlSliceState;
  runs: BuildingRunSliceState;
  artifacts: BuildingArtifactSliceState;
  selection: BuildingSelectionSliceState;
  beginRun(input: { runId: string; event: GenerationRunEvent }): void;
  appendRunEvent(runId: string, event: GenerationRunEvent): void;
  completeRun(input: { runId: string; artifactId: string; event: GenerationRunEvent }): void;
  publishCompletedFixture(input: {
    runId: string;
    artifactId: string;
    metadata: readonly BuildingArtifactMetadata[];
    replacedArtifactIds: readonly string[];
    event: GenerationRunEvent;
    prompt?: BuildingPromptControls;
    draftAtStart?: BuildingPromptControls;
    targetDocumentId?: string;
    publishArtifacts: () => void;
  }): boolean;
  failRun(input: { runId: string; event: GenerationRunEvent; message: string }): void;
  cancelRun(input: { runId: string; event: GenerationRunEvent }): void;
  registerArtifact(metadata: BuildingArtifactMetadata): void;
  updatePromptControls(patch: BuildingPromptControlPatch): void;
  commitPromptControls(prompt?: BuildingPromptControls): void;
  selectRoom(room: BuildingRoom): void;
  selectDocument(documentId: string): void;
  selectSemanticPath(semanticPath: string | undefined): void;
}

export type BuildingStoreApi = StoreApi<BuildingStoreState>;

export const defaultBuildingPromptControls: BuildingPromptControls = {
  prompt: "four floors, 7 bays, brick, flat roof, ornate trim",
  psgPresetId: "late19cCommercialDemo",
  stylePackId: "late-19c-commercial-demo",
  seeds: {
    family: "family-seed",
    building: "building-seed",
    material: "material-seed",
    trim: "trim-seed"
  },
  floorCount: 4,
  bayCount: 7,
  detailLevel: "high",
  fidelityMode: "kit",
  roofType: "flat",
  trimDensity: "ornate",
  windowFamily: "tall-arched",
  corniceFamily: "bracketed-metal",
  remoteMaterialEnabled: false,
  lockedComponentKeys: []
};

function clonePromptControls(prompt: BuildingPromptControls): BuildingPromptControls {
  return {
    ...prompt,
    seeds: {
      ...prompt.seeds
    },
    lockedComponentKeys: [...prompt.lockedComponentKeys]
  };
}

function runWithEvent(runId: string, event: GenerationRunEvent): GenerationRun {
  return {
    schemaVersion: "0.1.0",
    runId,
    stage: event.stage,
    events: [event]
  };
}

function appendEvent(run: GenerationRun, event: GenerationRunEvent): GenerationRun {
  return {
    ...run,
    stage: event.stage,
    events: [...run.events, event]
  };
}

function statusForStage(stage: GenerationStage): BuildingRunSliceState["status"] {
  if (stage === "complete" || stage === "failed" || stage === "cancelled") {
    return stage;
  }
  return "running";
}

function mergePromptControls(previous: BuildingPromptControls, patch: BuildingPromptControlPatch): BuildingPromptControls {
  return {
    ...previous,
    ...patch,
    seeds: {
      ...previous.seeds,
      ...(patch.seeds ?? {})
    },
    lockedComponentKeys: [...(patch.lockedComponentKeys ?? previous.lockedComponentKeys)]
  };
}

function unknownControlInvalidation(): BuildingInvalidation {
  // No structural/material inference is possible without a control baseline.
  const unchanged = computeBuildingInvalidation(defaultBuildingPromptControls, defaultBuildingPromptControls);
  return { ...unchanged, reusableArtifacts: { materialSources: false, packedAtlas: false, componentCatalog: false } };
}

function controlSnapshot(controls: BuildingPromptControls): BuildingControlSnapshot {
  return controls;
}

export function createBuildingStore(
  initialPrompt: BuildingPromptControls = defaultBuildingPromptControls,
  initialRoom: BuildingRoom = "promptLab",
  initialDocumentId = defaultBuildingDocumentId
): BuildingStoreApi {
  return createStore<BuildingStoreState>()((set) => ({
    prompt: initialPrompt,
    controls: {
      baselineStatus: "known",
      committedPrompt: clonePromptControls(initialPrompt),
      invalidation: computeBuildingInvalidation(controlSnapshot(initialPrompt), controlSnapshot(initialPrompt))
    },
    runs: {
      currentRun: null,
      status: "idle"
    },
    artifacts: {
      byId: {},
      byType: {}
    },
    selection: {
      documentId: initialDocumentId,
      room: initialRoom,
      showProvenance: false,
      showSemanticPaths: true
    },
    beginRun: ({ runId, event }) =>
      set((state) => ({
        runs: {
          activeFixtureArtifactId: state.runs.activeFixtureArtifactId,
          activeRunId: runId,
          currentRun: runWithEvent(runId, event),
          error: undefined,
          status: statusForStage(event.stage)
        }
      })),
    appendRunEvent: (runId, event) =>
      set((state) => {
        const currentRun = state.runs.currentRun;
        if (!currentRun || state.runs.activeRunId !== runId || currentRun.runId !== runId) {
          return state;
        }

        return {
          runs: {
            ...state.runs,
            currentRun: appendEvent(currentRun, event)
          }
        };
      }),
    completeRun: ({ runId, artifactId, event }) =>
      set((state) => {
        const currentRun = state.runs.currentRun;
        if (!currentRun || state.runs.activeRunId !== runId || currentRun.runId !== runId) {
          return state;
        }

        return {
          runs: {
            ...state.runs,
            activeFixtureArtifactId: artifactId,
            currentRun: appendEvent(currentRun, event),
            error: undefined,
            status: "complete"
          }
        };
      }),
    publishCompletedFixture: (input) => {
      let published = false;
      set((state) => {
        const currentRun = state.runs.currentRun;
        if (!currentRun || state.runs.status !== "running" || state.runs.activeRunId !== input.runId || currentRun.runId !== input.runId) return state;
        const byId = { ...state.artifacts.byId };
        for (const id of input.replacedArtifactIds) delete byId[id];
        for (const metadata of input.metadata) byId[metadata.artifactId] = metadata;
        const byType: BuildingArtifactSliceState["byType"] = {};
        for (const metadata of Object.values(byId)) (byType[metadata.artifactType] ??= []).push(metadata.artifactId);
        const committedPrompt = input.prompt ? clonePromptControls(input.prompt) : undefined;
        const draftChanged = input.draftAtStart && computeBuildingInvalidation(input.draftAtStart, state.prompt).changedControls.length > 0;
        const prompt = committedPrompt ? (draftChanged ? state.prompt : committedPrompt) : undefined;
        const next = {
          ...(input.targetDocumentId !== undefined ? { selection: { ...state.selection, documentId: input.targetDocumentId } } : {}),
          artifacts: { byId, byType },
          runs: {
            ...state.runs,
            activeFixtureArtifactId: input.artifactId,
            currentRun: appendEvent(currentRun, input.event),
            error: undefined,
            status: "complete" as const
          },
          ...(prompt && committedPrompt ? {
            prompt,
            controls: { baselineStatus: "known" as const, committedPrompt, invalidation: computeBuildingInvalidation(controlSnapshot(committedPrompt), controlSnapshot(prompt)) }
          } : { controls: { baselineStatus: "unknown" as const, committedPrompt: undefined, invalidation: unknownControlInvalidation() } })
        };
        // The guard and next state are ready before registry aliases become visible.
        input.publishArtifacts();
        published = true;
        return next;
      });
      return published;
    },
    failRun: ({ runId, event, message }) =>
      set((state) => {
        const currentRun = state.runs.currentRun;
        if (!currentRun || state.runs.activeRunId !== runId || currentRun.runId !== runId) {
          return state;
        }

        return {
          runs: {
            ...state.runs,
            currentRun: appendEvent(currentRun, event),
            error: message,
            status: "failed"
          }
        };
      }),
    cancelRun: ({ runId, event }) =>
      set((state) => {
        const currentRun = state.runs.currentRun;
        if (!currentRun || state.runs.activeRunId !== runId || currentRun.runId !== runId) {
          return state;
        }

        return {
          runs: {
            ...state.runs,
            currentRun: appendEvent(currentRun, event),
            status: "cancelled"
          }
        };
      }),
    registerArtifact: (metadata) =>
      set((state) => {
        const existingByType = state.artifacts.byType[metadata.artifactType] ?? [];
        const byType = existingByType.includes(metadata.artifactId)
          ? existingByType
          : [...existingByType, metadata.artifactId];
        return {
          artifacts: {
            byId: {
              ...state.artifacts.byId,
              [metadata.artifactId]: metadata
            },
            byType: {
              ...state.artifacts.byType,
              [metadata.artifactType]: byType
            }
          }
        };
      }),
    updatePromptControls: (patch) =>
      set((state) => {
        const nextPrompt = mergePromptControls(state.prompt, patch);
        return {
          prompt: nextPrompt,
          controls: {
            ...state.controls,
            invalidation: state.controls.baselineStatus === "known" && state.controls.committedPrompt
              ? computeBuildingInvalidation(controlSnapshot(state.controls.committedPrompt), controlSnapshot(nextPrompt))
              : unknownControlInvalidation()
          }
        };
      }),
    commitPromptControls: (prompt) =>
      set((state) => {
        const committedPrompt = clonePromptControls(prompt ?? state.prompt);
        return {
          prompt: committedPrompt,
          controls: {
            ...state.controls,
            baselineStatus: "known",
            committedPrompt,
            invalidation: computeBuildingInvalidation(controlSnapshot(committedPrompt), controlSnapshot(committedPrompt))
          }
        };
      }),
    selectRoom: (room) =>
      set((state) => ({
        selection: {
          ...state.selection,
          room
        }
      })),
    selectDocument: (documentId) =>
      set((state) => ({
        selection: {
          ...state.selection,
          documentId
        }
      })),
    selectSemanticPath: (semanticPath) =>
      set((state) => ({
        selection: {
          ...state.selection,
          selectedSemanticPath: semanticPath
        }
      }))
  }));
}

export const buildingStore = createBuildingStore();

export function useBuildingStore<T>(selector: (state: BuildingStoreState) => T): T {
  return useStore(buildingStore, selector);
}
