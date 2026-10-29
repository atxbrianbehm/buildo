from pathlib import Path
import json,numpy as np
from PIL import Image
root=Path('test-results/t9-shadow-filter-2026-10-29'); out={'schemaVersion':'0.1.0','backends':{}}
for api in ['webgl','webgpu']:
 dirs=[root/(api+'-'+variant+'-01') for variant in ['baseline','pcf']]; rec=[json.loads((p/'receipt.json').read_text()) for p in dirs]; rows={}
 for i,label in enumerate(['whole-default','close-default','close-lower','whole-lower','sill-default']):
  d=[x['draws'][i] for x in rec];checks={k:d[0][k]==d[1][k] for k in ['drawCamera','drawLights','compiler','bindings','channels']};row={'checks':checks}
  if all(checks.values()):
   images=[np.asarray(Image.open(p/('native-'+label+'.png')).convert('RGB'),dtype=np.int16) for p in dirs]; delta=np.abs(images[0]-images[1]);row.update(changedPixels=int(np.any(delta>0,axis=2).sum()),meanAbsoluteChannelDelta=round(float(delta.mean()),6),maxChannelDelta=int(delta.max()))
  else:row['excludedReason']='Independent close-view camera differs.'
  rows[label]=row
 out['backends'][api]={'activeBaselineFilter':rec[0]['actualFrustum']['filter'],'activeCandidateFilter':rec[1]['actualFrustum']['filter'],'views':rows}
(root/'comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
