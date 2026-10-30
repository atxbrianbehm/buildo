"""Rebuild the comparison from local benchmark outputs and committed baseline images."""
from hashlib import sha256
from pathlib import Path
import json
import statistics
from PIL import Image, ImageChops

ROOT = Path("docs/reviews/2026-10-29-r6-surface-reuse")
result = {"schemaVersion": "0.1.0", "kind": "surface-reuse-comparison", "backends": {}}
for api in ("webgpu", "webgl"):
    baseline = json.loads(Path(f"test-results/r6-local-performance/{api}/receipt.json").read_text())
    optimized = json.loads(Path(f"test-results/r6-surface-reuse/{api}/receipt.json").read_text())
    sources = []
    for index in range(3):
        a = Path(f"test-results/r6-local-performance/{api}/sample-{index}.json").read_bytes()
        b = Path(f"test-results/r6-surface-reuse/{api}/sample-{index}.json").read_bytes()
        sources.append({"identical": a == b, "sha256": sha256(b).hexdigest()})
    images = []
    for name in ("member-window", "family-after"):
        a = Image.open(f"docs/reviews/2026-10-29-r6-family-member-edit/{api}/{name}.png").convert("RGB")
        b = Image.open(ROOT / api / f"{name}.png").convert("RGB")
        images.append({"name": name, "dimensions": list(a.size), "identical": a.size == b.size and ImageChops.difference(a, b).getbbox() is None,
                       "pixelSha256": sha256(b.tobytes()).hexdigest()})
    median = lambda data: statistics.median(sample["returnMs"] for sample in data["samples"])
    result["backends"][api] = {"baselineReturnMedianMs": median(baseline), "optimizedReturnMedianMs": median(optimized),
                               "sourceComparisons": sources, "imageComparisons": images}

before_profile = json.loads(Path("docs/reviews/2026-10-29-r6-surface-profile/webgpu-keys.json").read_text())
after_profile = json.loads((ROOT / "webgpu-profile.json").read_text())
result["compositionChecks"] = {"baseline": [row["evaluatedRecipes"] for row in before_profile["surfacePhases"][-6:]],
                               "optimized": [row["evaluatedRecipes"] for row in after_profile["surfacePhases"][-6:]]}
assert result["compositionChecks"] == {"baseline": [3, 3, 3, 3, 3, 3], "optimized": [3, 1, 1, 1, 1, 1]}
assert result["schemaVersion"] == "0.1.0" and result["kind"] == "surface-reuse-comparison"
assert set(result["backends"]) == {"webgpu", "webgl"}
for data in result["backends"].values():
    assert set(data) == {"baselineReturnMedianMs", "optimizedReturnMedianMs", "sourceComparisons", "imageComparisons"}
    assert all(isinstance(data[key], (int, float)) and data[key] >= 0 for key in ("baselineReturnMedianMs", "optimizedReturnMedianMs"))
    assert len(data["sourceComparisons"]) == 3 and len(data["imageComparisons"]) == 2
    for entry in data["sourceComparisons"] + data["imageComparisons"]:
        digest = entry.get("sha256", entry.get("pixelSha256"))
        assert entry["identical"] is True and isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest)
ROOT.joinpath("comparison.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
