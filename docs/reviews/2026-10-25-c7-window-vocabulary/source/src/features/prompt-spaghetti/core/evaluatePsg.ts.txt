import type { PsgEvaluationResult, PsgNode } from "../contracts/psgDocument";
import { PsgDocumentSchema } from "../contracts/psgDocument";

export interface EvaluatePsgOptions {
  seed: string;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function evaluatePsg(input: unknown, options: EvaluatePsgOptions): PsgEvaluationResult {
  const document = PsgDocumentSchema.parse(input);
  const nodes = new Map<string, PsgNode>();
  for (const node of document.nodes) {
    if (nodes.has(node.id)) {
      throw new Error(`Duplicate PSG node id: ${node.id}`);
    }
    nodes.set(node.id, node);
  }

  const values = new Map<string, string | number | boolean | null>();
  const variables: Record<string, string | number | boolean | null> = {};
  const trace: PsgEvaluationResult["trace"] = [];

  const evaluateNode = (nodeId: string): string | number | boolean | null => {
    if (values.has(nodeId)) {
      return values.get(nodeId) ?? null;
    }

    const node = nodes.get(nodeId);
    if (!node) {
      throw new Error(`Missing PSG upstream node: ${nodeId}`);
    }

    const inputValues = (node.inputIds ?? []).map((inputId) => evaluateNode(inputId));
    const seed = `${options.seed}/${node.id}`;
    let outputValue: string | number | boolean | null;
    let selectedChoiceIndex: number | undefined;

    switch (node.type) {
      case "TextBlock":
        outputValue = node.value;
        break;
      case "WeightedChoice": {
        const totalWeight = node.choices.reduce((sum, choice) => sum + choice.weight, 0);
        let threshold = fnv1a32(seed) % Math.max(1, Math.floor(totalWeight));
        selectedChoiceIndex = node.choices.length - 1;
        for (let index = 0; index < node.choices.length; index += 1) {
          threshold -= node.choices[index].weight;
          if (threshold < 0) {
            selectedChoiceIndex = index;
            break;
          }
        }
        outputValue = node.choices[selectedChoiceIndex].value;
        break;
      }
      case "Concat": {
        if (node.parts) {
          outputValue = node.parts
            .map((part) => {
              const match = /^\$(\d+)$/.exec(part);
              return match ? stringValue(inputValues[Number(match[1])]) : part;
            })
            .join("");
        } else {
          outputValue = inputValues.map(stringValue).join("");
        }
        break;
      }
      case "SetVariable":
        outputValue = inputValues[0] ?? node.value ?? null;
        variables[node.variableName] = outputValue;
        break;
      case "GetVariable":
        outputValue = variables[node.variableName] ?? null;
        break;
      case "Output":
        outputValue = inputValues[0] ?? node.value ?? "";
        break;
      default:
        throw new Error(`Unsupported PSG node type: ${(node as { type: string }).type}`);
    }

    values.set(nodeId, outputValue);
    trace.push({
      nodeId: node.id,
      nodeType: node.type,
      semanticPath: node.semanticPath ?? node.id,
      inputValues,
      outputValue,
      selectedChoiceIndex,
      seed
    });

    return outputValue;
  };

  for (const node of document.nodes) {
    evaluateNode(node.id);
  }

  const outputs = document.nodes
    .filter((node) => node.type === "Output")
    .map((node) => ({
      nodeId: node.id,
      value: stringValue(values.get(node.id))
    }));

  return { outputs, variables, trace };
}
