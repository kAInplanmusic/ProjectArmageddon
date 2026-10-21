import os,json,time,base64,io,urllib.request
from PIL import Image
K=os.environ['KIE_API_KEY']
def _req(url,body=None):
    r=urllib.request.Request(url,json.dumps(body).encode() if body is not None else None,{'Authorization':'Bearer '+K,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'})
    return json.load(urllib.request.urlopen(r,timeout=90))
def upload(path,name):
    im=Image.open(path).convert('RGBA'); bg=Image.new('RGBA',im.size,(0,255,0,255)); bg.alpha_composite(im)
    b=io.BytesIO(); bg.convert('RGB').resize((768,768),Image.LANCZOS).save(b,'PNG')
    d=_req('https://kieai.redpandaai.co/api/file-base64-upload',{'base64Data':'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode(),'uploadPath':'pa-ref','fileName':name})
    return d['data']['downloadUrl']
def gen(prompt,url,out,aspect='16:9'):
    d=_req('https://api.kie.ai/api/v1/flux/kontext/generate',{'prompt':prompt,'inputImage':url,'aspectRatio':aspect,'model':'flux-kontext-pro','outputFormat':'png'})
    tid=d['data']['taskId']
    for i in range(60):
        time.sleep(5)
        s=_req('https://api.kie.ai/api/v1/flux/kontext/record-info?taskId='+tid)['data']
        if s.get('successFlag')==1:
            u=s['response']['resultImageUrl']
            open(out,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=120).read()); return out
        if s.get('successFlag') in (2,3): return 'FEHLER '+str(s)[:200]
    return 'Timeout'
