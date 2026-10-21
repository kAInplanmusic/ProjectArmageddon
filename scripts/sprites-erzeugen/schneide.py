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
def frei(cell,mehr=False):
    a=np.asarray(cell).astype(float); r,g,b=a[...,0],a[...,1],a[...,2]
    gruen=(g>r*1.3)&(g>b*1.3)&(g>80)
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
    return out
if __name__=='__main__':
    import sys
    for n in ['t_walk','t_aktion']:
        o=blatt(n+'.png'); bg=Image.new('RGBA',o.size,(80,80,120,255)); bg.alpha_composite(o); bg.convert('RGB').resize((o.width//2,o.height//2)).save(f'/tmp/{n}_k.jpg',quality=85)
