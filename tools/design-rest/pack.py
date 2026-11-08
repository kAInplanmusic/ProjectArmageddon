#!/usr/bin/env python3
"""Packt ausschließlich geprüfte normalisierte RGBA-Frames. Kein Modellaufruf, kein Schreiben nach src/."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

def pack(spec_path, output):
    spec_path=Path(spec_path).resolve(); spec=json.loads(spec_path.read_text()); root=spec_path.parent
    if len(spec['frames'])!=8: raise ValueError('Genau acht Frames erforderlich')
    review=json.loads((root/spec['review']).read_text()); sheet=Image.new('RGBA',(1024,512),(0,0,0,0))
    baseline=spec.get('sourceBaseline',960)
    if baseline!=960: raise ValueError('Dieses Format verlangt Quellgrundlinie y=960')
    for i,item in enumerate(spec['frames']):
        p=(root/item['file']).resolve(); receipt=review[item['jobId']]
        actual=hashlib.sha256(p.read_bytes()).hexdigest()
        flags=['identity','anatomy','palette','pose','anchors','alpha','temporal','approved']
        if receipt.get('sha256')!=actual or not receipt.get('reviewer') or not all(receipt.get(k) is True for k in flags):
            raise ValueError(f'Nicht vollständig / hashgebunden freigegeben: {item["jobId"]}')
        im=Image.open(p)
        if im.mode!='RGBA' or im.size!=(1024,1024): raise ValueError('Normalisierte Frames müssen 1024x1024 RGBA sein')
        alpha=im.getchannel('A');bbox=alpha.getbbox()
        if not bbox or bbox[0]<8 or bbox[1]<8 or bbox[2]>1016 or bbox[3]>1016: raise ValueError('Leer oder Randberührung')
        if alpha.getextrema()[0]!=0: raise ValueError('Kein transparenter Hintergrund')
        # Ein fester Maßstab für alle Frames, kein individuelles Bounding-Box-Autofit.
        im=im.resize((256,256),Image.Resampling.LANCZOS)
        sheet.paste(im,((i%4)*256,(i//4)*256))
    output=Path(output).resolve()
    repo=Path(__file__).resolve().parents[2]
    if output.is_relative_to(repo/'src'): raise ValueError('Erst Staging abnehmen; nicht direkt nach src schreiben')
    output.parent.mkdir(parents=True,exist_ok=True)
    if output.exists(): raise FileExistsError('Ausgabe existiert bereits')
    sheet.save(output,format='WEBP',lossless=True)
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('spec');parser.add_argument('output');a=parser.parse_args()
    print(pack(a.spec,a.output))
