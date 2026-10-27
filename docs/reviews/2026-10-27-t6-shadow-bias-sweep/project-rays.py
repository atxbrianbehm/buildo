from pathlib import Path
import json,numpy as np
from PIL import Image
root=Path('test-results/t6-shadow-edge-sweep-2026-10-27');p5=Path('test-results/t5-cornice-shadow-parts-2026-10-27');mesh=json.loads((p5/'compiled-cornice.json').read_text())['mesh'];plan=json.loads(Path('docs/reviews/2026-10-27-c9-p0-cornice-planning/plans/bracket-course-plan.json').read_text());v=np.asarray(mesh['positions']).reshape(-1,3);idx=np.asarray(mesh['indices']).reshape(-1,3);a=v[idx[:,0]];e1=v[idx[:,1]]-a;e2=v[idx[:,2]]-a
centers=np.array([u['centerAlongM'] for u in plan['units'] if u['face']=='front']);half=plan['recipe']['widthM']/2;sun=np.array([.55,.85,-.65]);sun/=np.linalg.norm(sun)
def first_hit(origin,direction,max_distance=float('inf')):
 h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h);valid=np.abs(det)>1e-10;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-a;u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);vv=inv*np.einsum('ij,j->i',q,direction);t=inv*np.einsum('ij,ij->i',e2,q);matches=np.flatnonzero(valid&(u>=-1e-9)&(vv>=-1e-9)&(u+vv<=1+1e-9)&(t>1e-5)&(t<max_distance));return None if not len(matches) else int(matches[np.argmin(t[matches])])
out={'schemaVersion':'0.1.0','kind':'shadow-bias-ray-projection-samples','method':'Project front backing ray samples outside bracket widths, rejecting samples occluded from the camera by a cornice triangle. A light ray must intersect geometry. Sample nearest native pixel; pixel ownership is not independently GPU-proven. Mean RGB deltas are sRGB values, not radiometry.','backends':{}}
for api in ['webgl','webgpu']:
 p=root/(api+'-01');r=json.loads((p/'receipt.json').read_text());c=next(x for x in r['captures'] if x['name']=='bracket-baseline');pos=np.array(c['camera']['position']);V=np.array(c['camera']['inverse']).reshape((4,4),order='F');P=np.array(c['camera']['projection']).reshape((4,4),order='F');base=np.asarray(Image.open(p/'native-bracket-baseline.png').convert('RGB'),dtype=np.int16);H,W=base.shape[:2];images={name:np.asarray(Image.open(p/('native-bracket-'+name+'.png')).convert('RGB'),dtype=np.int16) for name in ['bias-0.00015','bias-0.0005','bias-0.001','normal-0.003','normal-0.01']};samples=[]
 for y in np.linspace(10.512,10.636,17):
  for x in np.linspace(-4.5,4.5,41):
   if np.any(np.abs(centers-x)<=half+1e-6):continue
   point=np.array([x,y,-6.52161]);toCamera=pos-point;distance=np.linalg.norm(toCamera);hit=first_hit(point,toCamera/distance,distance-.001)
   if hit is not None:continue
   hit=first_hit(point,sun)
   if hit is None:continue
   clip=P@V@np.r_[point,1];ndc=clip[:3]/clip[3];px=int(round((ndc[0]+1)*W/2));py=int(round((1-ndc[1])*H/2))
   if not (0<=px<W and 0<=py<H):continue
   deltas={name:round(float((im[py,px]-base[py,px]).mean()),3) for name,im in images.items()};samples.append({'point':[round(x,5),round(y,5),round(float(point[2]),5)],'screenPixel':[px,py],'firstLightHit':'backing' if hit<64 else 'coping' if hit<112 else 'unit','meanRgbDelta':deltas})
 counts={name:{'brighterBy10':sum(v['meanRgbDelta'][name]>10 for v in samples),'meanRgbDelta':round(float(np.mean([v['meanRgbDelta'][name] for v in samples])),4) if samples else None} for name in images};out['backends'][api]={'cameraVisibleProjectedSamples':len(samples),'byCandidate':counts,'samples':samples}
(root/'projected-ray-samples.json').write_text(json.dumps(out,indent=2),encoding='utf-8');print(json.dumps({k:{'samples':v['cameraVisibleProjectedSamples'],'candidates':v['byCandidate']} for k,v in out['backends'].items()},indent=2))
