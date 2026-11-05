"""Photograph-referenced hero meshes. No AI-generated printing.
Run Blender -b -t 4 --python tools/blender/make_models.py -- --out candidate-dir.
Source front silhouettes are preserved; depth and unphotographed surfaces remain estimates.
Outputs GLB plus packed editable Blender files. Source images remain untouched.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
PRODUCTS = [
 {"handle":"vulcan-etna", "kind":"lathe", "rough":.57},
 {"handle":"fumigena-portocalie-cu-inel", "kind":"lathe", "rough":.34, "ring":True},
 {"handle":"candele-romane-30-foc", "kind":"sleeve", "n":6, "rows":2, "rough":.36, "back":{"img":3,"k":-1}},
 {"handle":"bengala-crackling-verde-f1-flacara-verde-intensa-set-6-buc", "kind":"sleeve", "n":6, "rows":1, "rough":.4, "back":{"img":2,"k":-1,"clean":True,"partial":[.08,.58]}},
 {"handle":"artificii-tort-30cm-set-4-bucati-ardere-120-secunde", "kind":"cake", "n":4, "rough":.48},
]

def photo(handle, number=1, back=None):
 if handle=='vulcan-etna' and not back:
  contour=json.loads((ROOT/'tools'/'blender'/'etna-contour.json').read_text(encoding='utf-8'))
  path=ROOT/contour['original']; img=bpy.data.images.load(str(path),check_existing=True); w,h=img.size
  x0,y0,x1,y1=contour['box']; alpha=np.zeros((h,w),dtype=np.float32)
  yy=np.arange(y1-y0); left=np.interp(yy,*np.array(contour['left']).T); right=np.interp(yy,*np.array(contour['right']).T)
  for y,l,r in zip(yy,left,right): alpha[y0+y,x0+math.ceil(l):x0+math.floor(r)+1]=1
  img.pack(); img['source_path']=contour['original']
  return img,alpha,(x0,y0,x1,y1)
 folder=ROOT/'assets'/'processed'/handle
 path=folder/(f'{number}_clean.jpg' if back and back.get('clean') else f'{number}.webp')
 src=bpy.data.images.load(str(path), check_existing=True); w,h=src.size
 px=np.array(src.pixels[:],dtype=np.float32).reshape(h,w,4)[::-1].copy()
 if back and back.get('k'): px=np.rot90(px,k=back['k']).copy()
 h,w=px.shape[:2]; alpha=px[:,:,3].copy()
 if back and back.get('clean'):
  # Outside crop only: preserve white label areas that the old cutout removed.
  fg=np.min(px[:,:,:3],axis=2)<.83
  ys=np.where(fg.mean(axis=1)>.15)[0]; xs=np.where(fg.mean(axis=0)>.15)[0]
 else: ys,xs=np.where(alpha>.55)
 box=(int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)
 if back and back.get('clean'):
  x0,y0,x1,y1=box; px=px[y0:y1,x0:x1].copy(); h,w=px.shape[:2]; box=(0,0,w,h); alpha=px[:,:,3]
 if back:
  img=bpy.data.images.new(handle+'-reference-back',w,h,alpha=True); img.pixels=px[::-1].ravel().tolist()
 else: img=src
 img.pack(); img['source_path']=str(path.relative_to(ROOT))
 return img,alpha,box

def material(name,img,rough):
 m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
 t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=img; t.extension='EXTEND'
 m.node_tree.links.new(t.outputs['Color'],b.inputs['Base Color']); m.node_tree.links.new(t.outputs['Alpha'],b.inputs['Alpha'])
 b.inputs['Roughness'].default_value=rough
 m.use_backface_culling=True
 return m

def plain(name,rgb,rough=.75,metal=0):
 m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
 b.inputs['Base Color'].default_value=(*rgb,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
 return m

def profile(alpha,box,count):
 x0,y0,x1,y1=box; hb=y1-y0; center=(x0+x1)/2; result=[]
 for j in range(count+1):
  y=min(y1-1,round(y0+hb*j/count)); xs=np.where(alpha[y,x0:x1]>.55)[0]
  left,right=(x0+xs[0],x0+xs[-1]+1) if len(xs) else (center-1,center+1)
  result.append(((left-center)/hb,(right-center)/hb))
 return result

def uv_at(x,z,img,box,z0=0,height=1):
 w,h=img.size; x0,y0,x1,y1=box; hb=y1-y0
 return ((x0+x1)/2/w+x*hb/w/height,1-(y1-(z-z0)/height*hb)/h)

def mesh_obj(name,bm,mats):
 bmesh.ops.recalc_face_normals(bm,faces=bm.faces); me=bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
 for p in me.polygons: p.use_smooth=True
 ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
 for m in mats: me.materials.append(m)
 return ob

def lathe(p,img,alpha,box):
 rows,segs=160,64; bounds=profile(alpha,box,rows); bm=bmesh.new(); uv=bm.loops.layers.uv.verify(); rings=[]
 for j,(left,right) in enumerate(bounds):
  cx,r=(left+right)/2,max(.0008,(right-left)/2)
  rings.append([bm.verts.new((cx+r*math.sin(2*math.pi*k/segs),-r*math.cos(2*math.pi*k/segs),1-j/rows)) for k in range(segs)])
 for j in range(rows):
  for k in range(segs):
   f=bm.faces.new((rings[j][k],rings[j][(k+1)%segs],rings[j+1][(k+1)%segs],rings[j+1][k]))
   for l in f.loops: l[uv].uv=uv_at(l.vert.co.x,l.vert.co.z,img,box)
 for ring in (rings[0],list(reversed(rings[-1]))): bm.faces.new(ring).material_index=1
 parts=[mesh_obj(p['handle'],bm,[material(p['handle']+'-skin',img,p['rough']),plain('folded-paper-end',(.12,.085,.12))])]
 if p.get('ring'):
  # Actual ring documented in the horizontal source photograph, tucked behind the cap.
  bpy.ops.mesh.primitive_torus_add(major_radius=.028,minor_radius=.0026,major_segments=48,minor_segments=10,location=(-.014,.018,.969),rotation=(math.pi/2,.98,-.3))
  ring=bpy.context.object; ring.name='pull-ring-reference-photo-2'; ring.data.materials.append(plain('brushed-steel',(.52,.54,.57),.27,1)); parts.append(ring)
 return parts

def sleeve(p,img,alpha,box):
 rows,cols=112,p['n']*6; bounds=profile(alpha,box,rows); width=(box[2]-box[0])/(box[3]-box[1]); radius=width/p['n']/2
 depth=radius*(1.65*p['rows']-.5); bm=bmesh.new(); uv=bm.loops.layers.uv.verify(); grids=[]
 mats=[material(p['handle']+'-skin',img,p['rough'])]; back_img=back_box=None
 if p.get('back'):
  spec=p['back']; back_img,_,back_box=photo(p['handle'],spec['img'],spec); mats.append(material(p['handle']+'-back',back_img,p['rough']))
  if spec.get('partial'): mats.append(plain('unphotographed-green-paper',(.22,.27,.085),.55))
 else: mats.append(plain('unphotographed-paper-side',(.10,.085,.09)))
 for side in (-1,1):
  grid=[]
  for j,(left,right) in enumerate(bounds):
   ring=[]
   for k in range(cols+1):
    t=k/cols; local=((t*p['n'])%1)*2-1; relief=math.sqrt(max(0,1-local*local))
    ring.append(bm.verts.new((left+(right-left)*t,side*(depth+radius*.45*relief),1-j/rows)))
   grid.append(ring)
  grids.append(grid)
 for side,grid in enumerate(grids):
  for j in range(rows):
   for k in range(cols):
    verts=(grid[j][k],grid[j][k+1],grid[j+1][k+1],grid[j+1][k]); f=bm.faces.new(verts if side==0 else tuple(reversed(verts))); f.material_index=side
    if side and p.get('back',{}).get('partial'):
     lo,hi=p['back']['partial']
     if not lo<=1-(j+.5)/rows<=hi: f.material_index=2
    for l in f.loops:
     x,_,z=l.vert.co
     if side==0: l[uv].uv=uv_at(x,z,img,box)
     elif back_img:
      lo,hi=p['back'].get('partial',[0,1]); bx0,by0,bx1,by1=back_box; bw,bh=back_img.size
      l[uv].uv=((bx0+(1-(x/width+.5))*(bx1-bx0))/bw,1-(by1-max(0,min(1,(z-lo)/(hi-lo)))*(by1-by0))/bh)
 front,back=grids
 for j in range(rows):
  for k in (0,cols):
   f=bm.faces.new((front[j][k],back[j][k],back[j+1][k],front[j+1][k]))
   for l in f.loops: l[uv].uv=uv_at(l.vert.co.x,l.vert.co.z,img,box)
 for j in (0,rows):
  for k in range(cols):
   f=bm.faces.new((front[j][k],front[j][k+1],back[j][k+1],back[j][k]))
   for l in f.loops: l[uv].uv=uv_at(l.vert.co.x,l.vert.co.z,img,box)
 ob=mesh_obj(p['handle']+'-continuous-sleeve',bm,mats); ob['reference_note']='Whole pack front, continuous label; estimated depth.'
 return [ob]

def cake(p,img,alpha,box):
 x0,y0,x1,y1=box; hb=y1-y0; body_h,base=.91,.09; width=(x1-x0)/hb*body_h; radius=width/p['n']/2
 mat=material(p['handle']+'-skin',img,p['rough']); white=plain('white-fixing-spikes',(.88,.88,.85),.67); parts=[]
 for k in range(p['n']):
  xc=(k+.5)/p['n']*width-width/2; bm=bmesh.new()
  bmesh.ops.create_cone(bm,cap_ends=True,segments=48,radius1=radius,radius2=radius,depth=body_h)
  bmesh.ops.translate(bm,verts=bm.verts,vec=(xc,0,base+body_h/2)); uv=bm.loops.layers.uv.verify()
  for f in bm.faces:
   for l in f.loops: l[uv].uv=uv_at(l.vert.co.x,l.vert.co.z,img,box,base,body_h)
  parts.append(mesh_obj(f'cake-fountain-{k+1}',bm,[mat]))
  # These white fixing spikes are present in original photo 1, absent from its old cutout.
  bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.0003,radius2=radius*.58,depth=base,location=(xc,0,base/2))
  pin=bpy.context.object; pin.name=f'white-fixing-spike-{k+1}'; pin.data.materials.append(white); parts.append(pin)
 return parts

def main():
 parser=argparse.ArgumentParser(); parser.add_argument('--out',type=Path,default=ROOT/'tools'/'shots'/'hero-models'); args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 args.out.mkdir(parents=True,exist_ok=True); report={}
 for p in PRODUCTS:
  bpy.ops.wm.read_factory_settings(use_empty=True); img,alpha,box=photo(p['handle']); parts={'lathe':lathe,'sleeve':sleeve,'cake':cake}[p['kind']](p,img,alpha,box)
  bpy.ops.object.select_all(action='DESELECT')
  for ob in parts: ob.select_set(True)
  bpy.context.view_layer.objects.active=parts[0]; out=args.out/(p['handle']+'.glb')
  bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_image_format='WEBP',export_apply=True,export_yup=True,export_materials='EXPORT')
  bpy.ops.wm.save_as_mainfile(filepath=str(args.out/(p['handle']+'.blend')))
  report[p['handle']]={'bytes':out.stat().st_size,'parts':len(parts),'front_box':box,'front_source':img['source_path'],'depth':'estimated','back':p.get('back')}
 (args.out/'reference-manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8'); print('MODELS '+json.dumps(report))
if __name__=='__main__': main()
