from pathlib import Path
from PIL import Image
import numpy as np, json
root = Path('test-results/t8-shadow-fit-2026-10-27')
old = Path('docs/reviews/2026-10-27-t7-shadow-frustum-study')
dirs = [old/'fresh-webgl-baseline-01', root/'webgl-01', old/'fresh-webgl-reference8192-01']
receipts = [json.loads((directory/'receipt.json').read_text()) for directory in dirs]
out = {'schemaVersion':'0.1.0', 'reference':'8192 map with original frustum; finite-resolution, not ground truth', 'views':{}}
for index,label in enumerate(['whole-default','close-default','close-lower','whole-lower','sill-default']):
    draws = [receipt['draws'][index] for receipt in receipts]
    same = all(draw['label']==label and all(draw[key]==draws[0][key] for key in ['drawCamera','drawLights','compiler','bindings']) for draw in draws)
    row = {'cameraLightGeometryBindingsExact':same}
    if same:
        images = [np.asarray(Image.open(directory/('native-'+label+'.png')).convert('RGB'),dtype=np.int16) for directory in dirs]
        baseline = np.abs(images[0]-images[2]).mean(2)
        candidate = np.abs(images[1]-images[2]).mean(2)
        mask = (baseline>1)|(candidate>1)
        row.update(consideredPixels=int(mask.sum()), baselineMeanError=round(float(baseline[mask].mean()),4), candidateMeanError=round(float(candidate[mask].mean()),4), candidateCloser=int(((candidate<baseline)&mask).sum()), baselineCloser=int(((baseline<candidate)&mask).sum()))
    else:
        row['excludedReason'] = 'Camera, light, geometry or bindings differ across runs.'
    out['views'][label] = row
(root/'actual-reference-comparison.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
