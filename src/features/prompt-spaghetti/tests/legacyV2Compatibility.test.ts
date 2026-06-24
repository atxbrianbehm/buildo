import fixture from "../fixtures/legacy-v2.psg.json";
import { exportPsgDocument } from "../io/exportPsg";
import { parsePsgDocument } from "../io/importPsg";

describe("PSG v2 compatibility", () => {
  it("loads and exports legacy v2 fixtures without changing schema version", () => {
    const document = parsePsgDocument(fixture);
    const exported = exportPsgDocument(document);

    expect(document.schemaVersion).toBe("2.0.0");
    expect(exported.schemaVersion).toBe("2.0.0");
    expect(exported.nodes.some((node) => node.type === "Output")).toBe(true);
  });
});

