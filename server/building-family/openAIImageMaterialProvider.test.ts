// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  OpenAIImageMaterialProvider,
  type OpenAIImageTransportRequest,
  type RemoteMaterialSourceRequest
} from "./openAIImageMaterialProvider";

const materialRequest = {
  sourceId: "source.wall.primary",
  role: "wall",
  selectedFamily: "running-bond-brick",
  periodicity: "xy",
  physicalSizeM: { width: 18, height: 14 },
  seedPath: "atlas/source/wall.primary/running-bond-brick",
  promptVocabulary: ["running-bond-brick", "primary wall material"],
  widthPx: 256,
  heightPx: 256
} satisfies RemoteMaterialSourceRequest;

function encodedPng(label: string): string {
  return Buffer.from(`png:${label}`).toString("base64");
}

describe("OpenAIImageMaterialProvider", () => {
  it("computes the request hash before transport so callers can cache by request", async () => {
    const provider = new OpenAIImageMaterialProvider({
      apiKey: "sk-buildo-secret-test-key",
      model: "gpt-image-test",
      transport: async () => ({ data: [{ b64_json: encodedPng("wall") }] })
    });

    const requestHash = await provider.requestHashFor(materialRequest);
    const artifact = await provider.generate(materialRequest, new AbortController().signal);

    expect(requestHash).toBe(artifact.requestHash);
  });

  it("generates a server-side remote material artifact through the Images API transport", async () => {
    const transportRequests: OpenAIImageTransportRequest[] = [];
    const provider = new OpenAIImageMaterialProvider({
      apiKey: "sk-buildo-secret-test-key",
      model: "gpt-image-test",
      transport: async (request) => {
        transportRequests.push(request);
        return {
          data: [
            {
              b64_json: encodedPng("wall"),
              revised_prompt: "revised masonry material prompt"
            }
          ]
        };
      }
    });

    const artifact = await provider.generate(materialRequest, new AbortController().signal);

    expect(transportRequests).toHaveLength(1);
    expect(transportRequests[0]).toEqual(
      expect.objectContaining({
        url: "https://api.openai.com/v1/images/generations",
        method: "POST",
        body: expect.objectContaining({
          model: "gpt-image-test",
          n: 1,
          output_format: "png",
          prompt: expect.stringContaining("running-bond-brick"),
          quality: "low",
          size: "1024x1024"
        })
      })
    );
    expect(transportRequests[0].headers.authorization).toBe("Bearer sk-buildo-secret-test-key");
    expect(artifact).toEqual(
      expect.objectContaining({
        schemaVersion: "0.1.0",
        sourceId: "source.wall.primary",
        providerId: "openai-image",
        image: {
          format: "png",
          b64Json: encodedPng("wall")
        },
        revisedPrompt: "revised masonry material prompt",
        requestHash: expect.any(String),
        contentHash: expect.any(String),
        provenance: expect.objectContaining({
          model: "gpt-image-test",
          endpoint: "https://api.openai.com/v1/images/generations",
          prompt: expect.stringContaining("primary wall material")
        })
      })
    );
    expect(JSON.stringify(artifact)).not.toContain("sk-buildo-secret-test-key");
  });

  it("keeps request hashes stable and content hashes tied to returned image bytes", async () => {
    const first = new OpenAIImageMaterialProvider({
      apiKey: "sk-buildo-secret-test-key",
      model: "gpt-image-test",
      transport: async () => ({ data: [{ b64_json: encodedPng("first") }] })
    });
    const second = new OpenAIImageMaterialProvider({
      apiKey: "sk-buildo-secret-test-key",
      model: "gpt-image-test",
      transport: async () => ({ data: [{ b64_json: encodedPng("second") }] })
    });

    const firstArtifact = await first.generate(materialRequest, new AbortController().signal);
    const secondArtifact = await second.generate(materialRequest, new AbortController().signal);

    expect(firstArtifact.requestHash).toBe(secondArtifact.requestHash);
    expect(firstArtifact.contentHash).not.toBe(secondArtifact.contentHash);
  });

  it("throws a sanitized provider error when the Images API response has no base64 image", async () => {
    const provider = new OpenAIImageMaterialProvider({
      apiKey: "sk-buildo-secret-test-key",
      model: "gpt-image-test",
      transport: async () => ({ data: [{}] })
    });

    await expect(provider.generate(materialRequest, new AbortController().signal)).rejects.toThrow(
      /OpenAI image response did not include base64 image data/
    );
  });
});
