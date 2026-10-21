from rep import *; from prompts import *
import glob,os,concurrent.futures as cf,time
SRC='/home/user/ProjectArmageddon/src/client/assets/characters-side/'
files=sorted(glob.glob(SRC+'*/*.png'))
os.makedirs('roh3',exist_ok=True)
stop=[False]
def run(f):
    if stop[0]: return 'STOP'
    fac=f.split('/')[-2]; name=os.path.basename(f)[:-4]; out=f'roh3/{fac}__{name}__zustand.png'
    if os.path.exists(out): return out+' (da)'
    for t in range(3):
        try:
            r=rep_gen(ZUSTAND,f,out)
            if r=='ok': return out
            if 'credit' in r.lower() or 'payment' in r.lower() or '402' in r: stop[0]=True; return 'KREDIT '+r
        except Exception as e:
            m=str(e)
            if '402' in m or '403' in m: stop[0]=True; return 'KREDIT '+m
            time.sleep(6)
    return out+' GESCHEITERT'
with cf.ThreadPoolExecutor(2) as ex:
    for r in ex.map(run,files): print(r,flush=True)
