import unittest, tempfile, json, hashlib, importlib.util
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('packer',Path(__file__).parents[1]/'pack.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class PackingTests(unittest.TestCase):
    def setup_case(self, root):
        im=Image.new('RGBA',(1024,1024),(0,0,0,0));im.paste((255,20,30,255),(300,200,700,960));im.save(root/'frame.png')
        digest=hashlib.sha256((root/'frame.png').read_bytes()).hexdigest();receipt={'sha256':digest,'reviewer':'offline-fixture',**{k:True for k in ['identity','anatomy','palette','pose','anchors','alpha','temporal','approved']}}
        (root/'review.json').write_text(json.dumps({'fixture':receipt}));(root/'pack.json').write_text(json.dumps({'review':'review.json','frames':[{'jobId':'fixture','file':'frame.png'}]*8}))
    def test_packs_exact_dimensions_and_keeps_alpha(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp);self.setup_case(r);mod.pack(r/'pack.json',r/'sheet.webp');im=Image.open(r/'sheet.webp');self.assertEqual(im.size,(1024,512));self.assertEqual(im.getchannel('A').getextrema(),(0,255))
    def test_changed_bytes_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp);self.setup_case(r);Image.new('RGBA',(1024,1024),'white').save(r/'frame.png')
            with self.assertRaises(ValueError):mod.pack(r/'pack.json',r/'sheet.webp')
    def test_unapproved_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp);self.setup_case(r);d=json.loads((r/'review.json').read_text());d['fixture']['approved']=False;(r/'review.json').write_text(json.dumps(d))
            with self.assertRaises(ValueError):mod.pack(r/'pack.json',r/'sheet.webp')
if __name__=='__main__':unittest.main()
