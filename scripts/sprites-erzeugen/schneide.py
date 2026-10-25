import numpy as np
from PIL import Image
from scipy import ndimage as ndi
def zellen(path):
    im=Image.open(path).convert('RGB'); W,H=im.size; cw,ch=W/4,H/2
    out=[]
    for r in range(2):
        for c in range(4):
            x0,y0=round(c*cw)+8,round(r*ch)+8; x1,y1=round((c+1)*cw)-8,round((r+1)*ch)-8
            out.append(im.crop((x0,y0,x1,y1)))
    return out
STRENG=False
def frei(cell,mehr=False):
    a=np.asarray(cell).astype(float); r,g,b=a[...,0],a[...,1],a[...,2]
    gruen=(g>r*1.3)&(g>b*1.3)&(g>80)
    if STRENG: gruen=(g>215)&(r<90)&(b<90)
    fg=~gruen
    # dünne dunkle Linien (Gitter, Bodenlinie) entfernen: Öffnung
    fg=ndi.binary_opening(fg,structure=np.ones((6,3)),iterations=1)
    lab,k=ndi.label(fg)
    if k==0: return None
    sz=ndi.sum(fg,lab,range(1,k+1)); m=lab==(1+int(np.argmax(sz)))
    if mehr:
        gross=[]
        for i,v in enumerate(sz):
            if v<0.03*sz.max(): continue
            sl=ndi.find_objects((lab==(i+1)).astype(int))[0]
            h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
            if w<=7 or h<=7: continue
            gross.append(i+1)
        if not gross: gross=[1+int(np.argmax(sz))]
        m=np.isin(lab,gross)
    m=ndi.binary_fill_holes(m); m=ndi.binary_dilation(m,iterations=1)&~gruen | m
    al=ndi.gaussian_filter(m.astype(float),0.6)
    gg=np.minimum(g,np.maximum(r,b)+5)
    rgba=np.dstack([r,gg,b,np.clip(al*255,0,255)]).astype(np.uint8)
    return Image.fromarray(rgba,'RGBA')
def blatt(path,hoehe_ref=None,zelle=256,boden=240,mehr=False):
    teile=[frei(c,mehr) for c in zellen(path)]
    bb=[t.getbbox() if t else None for t in teile]
    hs=[b[3]-b[1] for b in bb if b]
    # gemeinsame Skala: Median der Höhen der stehenden Frames (Frames 0..5), ohne liegende
    ref=hoehe_ref or sorted(hs)[len(hs)//2]
    s=min(220/ref,1.6)
    out=Image.new('RGBA',(zelle*4,zelle*2),(0,0,0,0))
    for i,(t,b) in enumerate(zip(teile,bb)):
        if not t: continue
        t=t.crop(b)
        sc=s
        # nie größer als Zelle: liegende Frames sind breit
        sc=min(sc,(zelle-16)/t.width,(boden-8)/t.height*1.0)
        t=t.resize((max(1,round(t.width*sc)),max(1,round(t.height*sc))),Image.LANCZOS)
        cell=Image.new('RGBA',(zelle,zelle),(0,0,0,0))
        cell.paste(t,((zelle-t.width)//2,boden-t.height),t)
        out.paste(cell,((i%4)*zelle,(i//4)*zelle))
    return _ohne_streifen(out)

def _ohne_streifen(blatt):
    """Nachputzen: Gitterstriche, die die Öffnung oben nicht erwischt hat.

    Die Öffnung mit np.ones((6,3)) entfernt einen freistehenden Strich, aber
    nicht den Teil, der durch die Figur läuft — dort ist die Maske breiter als
    das Strukturelement. Ergebnis waren senkrechte schwarze Linien über die
    ganze Zelle (SPR-5: shinobi/11_rauch-meister-genzi__aktion in allen acht
    Zellen, undead/10_archer-mortis__aktion Zelle 3, xeno/12_plasma-maw-zorg__walk
    Zellen 5 und 7). `streifen-entfernen.py` erkennt genau diese Signatur und
    räumt sie auf. Fehlt das Werkzeug, bleibt das Blatt unverändert.
    """
    import importlib.util, os
    pfad = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'streifen-entfernen.py')
    if not os.path.exists(pfad):
        return blatt
    spec = importlib.util.spec_from_file_location('streifen_entfernen', pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    neu, anzahl = modul.entferne(blatt)
    if anzahl:
        print(f'  {anzahl} Gitterstrich(e) nachgeputzt')
    return neu
if __name__=='__main__':
    import sys
    for n in ['t_walk','t_aktion']:
        o=blatt(n+'.png'); bg=Image.new('RGBA',o.size,(80,80,120,255)); bg.alpha_composite(o); bg.convert('RGB').resize((o.width//2,o.height//2)).save(f'/tmp/{n}_k.jpg',quality=85)

def frei_flut(cell, tol=70):
    """Freistellen per Flutfüllung vom Rand: nur Hintergrund, der mit dem Rand zusammenhängt und der Eckfarbe ähnelt (für grüne Figuren)."""
    cell = cell.convert('RGB').crop((12, 12, cell.width - 12, cell.height - 12))
    a = np.asarray(cell).astype(float)
    h, w, _ = a.shape
    ecken = np.array([a[2, 2], a[2, w - 3], a[h - 3, 2], a[h - 3, w - 3]])
    bg = np.median(ecken, axis=0)
    nah = np.sqrt(((a - bg) ** 2).sum(-1)) < tol
    lab, k = ndi.label(nah)
    rand = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    hg = np.isin(lab, list(rand))
    # Schatten unter der Figur: dunkelgrün, mit Hintergrund verbunden -> mitnehmen
    fg = ~hg
    fg = ndi.binary_opening(fg, structure=np.ones((3, 3)))
    lab2, k2 = ndi.label(fg)
    if k2 == 0: return None
    sz = ndi.sum(fg, lab2, range(1, k2 + 1)); keep = [i + 1 for i, v in enumerate(sz) if v >= 0.02 * sz.max()]
    m = np.isin(lab2, keep); m = ndi.binary_fill_holes(m)
    al = ndi.gaussian_filter(m.astype(float), 0.6)
    return Image.fromarray(np.dstack([a, np.clip(al * 255, 0, 255)]).astype(np.uint8), 'RGBA')

def frei_sauber(cell, mehr=False):
    t = frei_flut(cell, 75)
    if t is None: return None
    a = np.asarray(t).copy(); rgb = a[..., :3].astype(float)
    bg = np.array([0, 255, 0], float); rest = np.sqrt(((rgb - bg) ** 2).sum(-1)) < 60
    a[rest, 3] = 0
    return Image.fromarray(a, 'RGBA')

def frei_magenta(cell, mehr=False):
    t = frei_flut(cell, 75)
    if t is None: return None
    a = np.asarray(t).copy()
    rest = np.sqrt(((a[..., :3].astype(float) - np.array([255, 0, 255.])) ** 2).sum(-1)) < 110
    a[rest, 3] = 0
    m = a[..., 3] > 40
    lab, k = ndi.label(ndi.binary_dilation(m, iterations=3))
    if k > 1:
        h, w = m.shape
        sz = ndi.sum(m, lab, range(1, k + 1)); gross = sz.max()
        for i, sl in enumerate(ndi.find_objects(lab)):
            rand = sl[1].start <= 1 or sl[1].stop >= w - 1
            if rand and sz[i] < 0.5 * gross:
                a[(lab == i + 1) & m, 3] = 0
    return Image.fromarray(a, 'RGBA')
