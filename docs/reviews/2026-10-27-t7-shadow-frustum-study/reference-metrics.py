from pathlib import Path
from PIL import Image
import numpy as np,json
p=Path('test-results/t7-shadow-frustum-2026-10-27');dirs={x:p/('fresh-webgl-'+x+'-01') for x in ['baseline','tight','reference8192']};receipts={x:json.loads((d/'receipt.json').read_text()) for x,d in dirs.items()};out={'schemaVersion':'0.1.0','kind':'fresh-shadow-reference-comparison','reference':'8192 map, original frustum; finite-resolution diagnostic, not ground truth','method':'Per-pixel sRGB absolute error against same-camera, same-light reference; only views with exact camera, lights, geometry and material bindings across all three runs are scored.','views':{}}
for index,label in enumerate(['whole-default','close-default','close-lower','whole-lower','sill-default']):
 draws=[receipts[k]['draws'][index] for k in ['baseline','tight','reference8192']];assert all(x['label']==label for x in draws);cams=[x['drawCamera'] for x in draws];lights=[x['drawLights'] for x in draws];same=all(c==cams[0] for c in cams) and all(l==lights[0] for l in lights) and all(x['compiler']==draws[0]['compiler'] and x['bindings']==draws[0]['bindings'] for x in draws);row={'exactCameraLightsGeometryAndBindings':same}
 if same:
  images=[np.asarray(Image.open(dirs[k]/('native-'+label+'.png')).convert('RGB'),dtype=np.int16) for k in ['baseline','tight','reference8192']];e0=np.abs(images[0]-images[2]).mean(axis=2);e1=np.abs(images[1]-images[2]).mean(axis=2);mask=(e0>1)|(e1>1);row.update(consideredPixels=int(mask.sum()),baselineMeanAbsoluteChannelError=round(float(e0[mask].mean()),4),tightMeanAbsoluteChannelError=round(float(e1[mask].mean()),4),tightCloserPixels=int(np.count_nonzero((e1<e0)&mask)),baselineCloserPixels=int(np.count_nonzero((e0<e1)&mask)),equalErrorPixels=int(np.count_nonzero((e0==e1)&mask)))
 else:row['excludedReason']='Camera differs between independently interacted views; no pixel score.'
 out['views'][label]=row
(p/'reference-comparison.json').write_text(json.dumps(out,indent=2),encoding='utf-8');print(json.dumps(out,indent=2))
