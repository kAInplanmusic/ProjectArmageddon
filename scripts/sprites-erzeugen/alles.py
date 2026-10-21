import os,re,time,sys,urllib.request,glob
from rep import *; from rep import _r
from prompts import BASE
def warte(f,*a):
    for t in range(10):
        try: return f(*a)
        except Exception as e:
            if '429' in str(e): time.sleep(20); continue
            return 'ERR '+str(e)[:80]
    return 'ERR 429'
def txt2img(prompt,out,seed=5,aspect='1:1'):
    d=warte(_r,'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions',{'input':{'prompt':prompt,'aspect_ratio':aspect,'output_format':'png','seed':seed}})
    if not isinstance(d,dict): return str(d)
    for k in range(60):
        if d.get('status') in ('succeeded','failed','canceled'): break
        time.sleep(4); d=warte(_r,d['urls']['get'])
        if not isinstance(d,dict): return str(d)
    if d.get('status')!='succeeded': return 'ERR '+str(d.get('error'))[:100]
    o=d['output']; u=o if isinstance(o,str) else o[0]
    open(out,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=120).read()); return 'ok'
def lauf(job,out,prompt,**k):
    if os.path.exists(out): return
    for sd in (5,17,29):
        r=txt2img(prompt,out,seed=sd,**k)
        if r=='ok': print(out,r,flush=True); time.sleep(12); return
        if '402' in r or 'credit' in r.lower(): print('KREDIT',r,flush=True); sys.exit(1)
        time.sleep(12)
    print(out,'FEHLER',r,flush=True)
# 1) Texturen
TEX={'schlacke':'porous dark volcanic slag with air bubbles','schwefelkruste':'yellow sulfur crust with cracks','salzkruste':'white cracked salt crust','kalkstein':'pale porous limestone','moos':'thick green moss','alienharz':'sticky amber alien resin with veins','firn':'compacted granular firn snow','wolkenstein':'light grey floating cloud stone with soft holes','magnetgestein':'dark magnetite rock with metallic sheen','keramik':'glazed white ceramic tiles with fine cracks','lavaglas':'glossy black volcanic glass with orange glow in cracks','bimsstein':'light pumice stone full of pores','tempelstein':'carved ancient temple stone with weathering','mauerwerk':'medieval castle brick masonry','rostmetall':'heavily rusted corroded iron plate','tiefseeschlamm':'dark deep sea mud with fine sediment','hydrothermal':'mineral deposits red and ochre hydrothermal vent crust','versteinertes_holz':'petrified wood with crystal inclusions','kolossholz':'giant petrified tree bark with deep grooves','instabiler_boden':'cracked glowing unstable ground with purple energy seams','teer':'thick black tar with glossy sheen','treibsand':'fine wet rippled quicksand','myzel':'white fungal mycelium network on dark soil','leuchtalgen':'bioluminescent teal algae mat'}
os.makedirs('tex',exist_ok=True)
for k,v in TEX.items():
    lauf('tex',f'tex/{k}.png',f"Seamless tileable top-down texture of {v}, flat orthographic game texture, even lighting, no perspective, no objects, no text, high detail, fills the whole frame")
# 2) Objekt-Sheets je Biom
ssot=open('/home/user/PA-design/docs/biome-ssot.md').read()
os.makedirs('obj',exist_ok=True)
for m in re.finditer(r'### (\d+) ([^\n]+)\n(.*?)(?=\n### |\Z)',ssot,re.S):
    nr,name,txt=m.group(1),m.group(2),m.group(3)
    o=re.search(r'\*\*Objekte/Trigger:\*\* ([^\n]+)',txt)
    if not o: continue
    items=[x.strip().rstrip('.') for x in o.group(1).split(',') if 'Trigger' not in x][:8]
    if len(items)<8: items+=['rock cover']*(8-len(items))
    p=("A 2D game sprite sheet of eight different environment objects for the biome '"+name+"', side view, arranged in a strict grid of 4 columns and 2 rows of equal cells on a solid pure bright green (#00FF00) background, "
       "no shadows, no text, no numbers, no grid lines, each object fully inside its own cell, comic painted game style with bold outlines. Objects in reading order: "+'; '.join(f'{i+1} {x}' for i,x in enumerate(items))+'.')
    lauf('obj',f'obj/{int(nr):02d}.png',p,aspect='16:9')
# 3) Emotions-Sheets je Figur
SRC='/home/user/ProjectArmageddon/src/client/assets/characters-side/'
EM=BASE+("This is an EMOTION sheet, 8 different poses in reading order: 1 scared cowering with both hands in front of the face, 2 neutral standing with eyes closed (blink), 3 shrugging shoulders with palms up, "
 "4 cheering fist pump with a happy face, 5 trembling hunched and exhausted with sweat drops, 6 standing with the head tilted up looking upward, 7 standing with the head tilted down looking downward, 8 bending forward reaching to the side with one hand (switching weapon).")
os.makedirs('emo',exist_ok=True)
for f in sorted(glob.glob(SRC+'*/*.png')):
    fac=f.split('/')[-2]; n=os.path.basename(f)[:-4]; out=f'emo/{fac}__{n}__emotion.png'
    if os.path.exists(out): continue
    for sd in (5,17,29):
        r=warte(lambda: rep_gen(EM,f,out,seed=sd))
        if r=='ok': break
        if '402' in str(r): print('KREDIT',r,flush=True); sys.exit(1)
        time.sleep(12)
    print(out,r,flush=True); time.sleep(12)
print('ENDE',flush=True)
