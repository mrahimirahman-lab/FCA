"""Synthetic geometry tests: do not publish original user plans or SVGs."""
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from datasets import load_dataset

spec=importlib.util.spec_from_file_location('elements',Path(__file__).with_name('prepare.py'))
elements=importlib.util.module_from_spec(spec);spec.loader.exec_module(elements)

SVG=b'''<svg xmlns="http://www.w3.org/2000/svg" width="999" height="999"><g transform="translate(5,5)"><g id="Wall" class="Wall External"><polygon points="0,0 80,0 80,10 0,10"/><g id="Window" class="Window Regular"><polygon points="20,0 40,0 40,10 20,10"/><g class="Glass"><polygon points="20,0 40,0 40,10 20,10"/></g></g><g id="Door" class="Door Swing"><polygon points="50,0 65,0 65,10 50,10"/><path d="M50,10 Q50,30 65,30"/></g></g><g id="Wall" class="Wall Internal"><polygon points="0,20 80,20 80,30 0,30"/></g></g></svg>'''

class ElementTests(unittest.TestCase):
    def test_raw_pixel_frame_repeated_ids_no_double_count_and_explicit_host_relation(self):
        found,excluded=elements.extract(SVG,100,100)
        self.assertEqual(len(found),4)
        walls=[e for e in found if e['label']=='DINDING'];self.assertEqual(len(walls),2)
        self.assertNotEqual(walls[0]['source_key'],walls[1]['source_key'])
        self.assertEqual(walls[0]['bbox_2d'],[50,50,850,150])
        door=next(e for e in found if e['label']=='PINTU')
        self.assertEqual(door['bbox_2d'],[550,50,700,150]) # excludes the swing path deliberately
        self.assertEqual(door['host_wall_source_key'],walls[0]['source_key'])
        self.assertEqual(sum(e['label']=='TINGKAP' for e in found),1)
        self.assertEqual(excluded,{})
        with self.assertRaises(ValueError):elements.extract(SVG,20,20)
        with self.assertRaises(ValueError):elements.extract(b'<!DOCTYPE svg []>'+SVG,100,100)
    def test_audit_reviewed_export_embeds_images_and_keeps_splits_independent(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);src=root/'source';src.mkdir()
            for i,name in enumerate(['A','B']):
                p=src/name;p.mkdir();(p/'model.svg').write_bytes(SVG if i==0 else SVG.replace(b'translate(5,5)',b'translate(6,5)'))
                Image.new('RGB',(100+i*10,100+i*10),'white').save(p/'F1_scaled.png')
            audit=root/'audit';m=elements.audit(src,audit)
            self.assertEqual(len(m['samples']),2)
            self.assertIn('"source_class": "Wall"',(audit/'manifest-elemen.json').read_text())
            review=root/'review.json';review.write_text(json.dumps({'schema_version':1,'manifest_sha256':elements.cubi.sha((audit/'manifest-elemen.json').read_bytes()),'approved_ids':['A','B']}))
            train=root/'train.txt';val=root/'val.txt';train.write_text('A');val.write_text('B')
            out=root/'export';info=elements.export(audit,review,train,val,out)
            self.assertEqual(info['splits']['train']['rows'],3)
            ds=load_dataset('parquet',data_files=str(out/'Elemen-train.parquet'),split='train')
            self.assertEqual(len(ds),3)
            for row in ds:
                self.assertEqual(row['image'].size,(100,100))
                answer=json.loads(row['conversations'][1]['value'])
                self.assertEqual(len(set(e['label'] for e in answer)),1)
                self.assertIn('PERANAN',row['conversations'][0]['value'])
            val.write_text('A')
            with self.assertRaisesRegex(ValueError,'bertindih'):elements.export(audit,review,train,val,root/'bad')
            val.write_text('B');(audit/m['samples'][0]['file']).write_bytes(b'bad')
            with self.assertRaises(OSError):elements.export(audit,review,train,val,root/'bad')
    def test_dense_task_not_silently_truncated_or_called_absent(self):
        e={'source_class':'Wall','label':'DINDING','bbox_2d':[0,0,100,100]}
        self.assertEqual(list(elements.tasks({'elements':[e]*33})),[])
    def test_bootstrap_hashes(self):
        root=Path(__file__).parent;text=(root/'start.ps1').read_text()
        for name in ['prepare.py','review.html','prompt-ms.txt']:
            self.assertIn(elements.cubi.sha((root/name).read_bytes()),text)
        self.assertIn(elements.cubi.sha(elements.helper.read_bytes()),text)

if __name__=='__main__':unittest.main()
