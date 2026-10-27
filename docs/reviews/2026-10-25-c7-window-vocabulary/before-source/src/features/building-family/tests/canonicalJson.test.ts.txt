import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";

describe("canonicalJson", () => {
  it("sorts object keys recursively for byte-equivalent hashes", async () => {
    const left = { b: 2, a: { z: true, y: ["same", { d: 4, c: 3 }] } };
    const right = { a: { y: ["same", { c: 3, d: 4 }], z: true }, b: 2 };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    await expect(hashCanonicalJson(left)).resolves.toBe(await hashCanonicalJson(right));
  });
});

