import os,json,base64,io,urllib.request,time
from PIL import Image
K=os.environ['REPLICATE_API_TOKEN']
def _r(url,body=None):
    r=urllib.request.Request(url,json.dumps(body).encode() if body else None,{'Authorization':'Bearer '+K,'Content-Type':'application/json','Prefer':'wait'})
    return json.load(urllib.request.urlopen(r,timeout=300))
def rep_gen(prompt,src,out,aspect='16:9',model='black-forest-labs/flux-kontext-pro',seed=5):
    im=Image.open(src).convert('RGBA'); bg=Image.new('RGBA',im.size,(0,255,0,255)); bg.alpha_composite(im)
    b=io.BytesIO(); bg.convert('RGB').resize((768,768)).save(b,'PNG')
    d=_r(f'https://api.replicate.com/v1/models/{model}/predictions',{'input':{'prompt':prompt,'input_image':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode(),'aspect_ratio':aspect,'output_format':'png','seed':seed}})
    for i in range(60):
        if d.get('status') in ('succeeded','failed','canceled'): break
        time.sleep(4); d=_r(d['urls']['get'])
    if d.get('status')!='succeeded': return 'ERR '+str(d.get('error') or d.get('status'))[:200]
    o=d['output']; u=o if isinstance(o,str) else o[0]
    open(out,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=120).read()); return 'ok'
