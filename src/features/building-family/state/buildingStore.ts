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

export type BuildingRoom = "promptLab" | "atlasLab" | "componentForge" | "sampleGallery" | "assemblyHall";
export type BuildingDetailLevel = "high" | "low";
export type BuildingRoofType = "flat" | "gable";
export type BuildingTrimDensity = "restrained" | "moderate" | "ornate";
export const defaultBuildingDocumentId = "buildo-demo-family";

export interface BuildingPromptControls {
  prompt: string;
  psgPresetId: "late19cCommercialDemo";
  stylePackId: "late-19c-commercial-demo";
  seeds: Seeds;
  floorCount: number;
  bayCount: number;
  detailLevel: BuildingDetailLevel;
  roofType: BuildingRoofType;
  trimDensity: BuildingTrimDensity;
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
  committedPrompt: BuildingPromptControls;
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
  roofType: "flat",
  trimDensity: "ornate",
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
            invalidation: computeBuildingInvalidation(
              controlSnapshot(state.controls.committedPrompt),
              controlSnapshot(nextPrompt)
            )
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
