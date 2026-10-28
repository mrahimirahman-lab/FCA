"""Synthetic end-to-end checks for element batches; never redistribute user plans."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import yaml

ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('element_batch',ROOT/'batch.py')
batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)
elements=batch.elements;cubi=elements.cubi

class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.source=self.root/'source';self.source.mkdir()
        for i,name in enumerate(['A','B','C','D']):
            p=self.source/'category'/name;p.mkdir(parents=True)
            Image.new('RGB',(120+i*10,100+i*10),'white').save(p/'F1_scaled.png')
            (p/'model.svg').write_text(f'''<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate({i+5},5)"><g class="Wall External" id="Wall"><polygon points="0,0 80,0 80,10 0,10"/><g class="Door Swing" id="Door"><polygon points="10,0 20,0 20,10 10,10"/></g><g class="Window Regular" id="Window"><polygon points="30,0 40,0 40,10 30,10"/></g></g><g class="Space Bedroom" id="room"><polygon points="0,15 80,15 80,70 0,70"/></g></g></svg>''')
        self.old=self.root/'old';(self.old/'dataset').mkdir(parents=True)
        audit=cubi.audit(self.source,self.old/'audit')
        # Old manifests have IDs without the category root. Content hashes still identify sources.
        for s in audit['samples']:s['id']=s['id'].split('/')[-1]
        raw=json.dumps(audit).encode();(self.old/'audit'/'manifest-cubicasa.json').write_bytes(raw)
        exported={'schema_version':1,'dataset':'CubiCasa5K','source_manifest_sha256':cubi.sha(raw),
                  'split_provenance':'synthetic','splits':{k:{'images':len(v),'sample_ids':v} for k,v in {'train':['A','B'],'validation':['C'],'test':['D']}.items()}}
        (self.old/'dataset'/'manifest-eksport.json').write_text(json.dumps(exported))
        self.pilot=self.root/'pilot';elements.audit(self.source,self.pilot,4)
        self.review=self.root/'review.json';self.review.write_text(json.dumps({'schema_version':1,'manifest_sha256':cubi.sha((self.pilot/'manifest-elemen.json').read_bytes()),'approved_ids':['category/A']}))
    def tearDown(self):self.temp.cleanup()
    def build(self,name='out',minimums=None):
        return batch.build(self.source,self.old,self.pilot/'manifest-elemen.json',self.review,self.root/name,minimums or {'train':2,'validation':1,'test':1})
    def test_content_verified_root_mapping_preserved_split_three_tasks_and_provenance(self):
        out=self.build();self.assertEqual(out['splits']['train']['image_ids'],['A','B'])
        self.assertEqual(out['splits']['test']['image_ids'],['D'])
        self.assertEqual(out['splits']['train']['rows'],6)
        self.assertEqual(out['individually_reviewed_selected_images'],1)
        self.assertIn('automated',out['review_method']);self.assertFalse(out['training_executed'])
        profile=yaml.safe_load((self.root/'out'/'dataset'/'Elemen-config.yaml').read_text())
        self.assertEqual(profile['training']['max_steps'],2)
        self.assertEqual(profile['training']['eval_steps'],.5)
        self.assertEqual(out['previous_split']['source_paths']['D'],'category/D')
        html=(self.root/'out'/'audit'/'BUKA-SEMAKAN-ELEMEN.html').read_text()
        self.assertIn('"batch_mode": true',html)
    def test_modified_sources_and_stale_calibration_rejected(self):
        old=self.review.read_text();self.review.write_text(old.replace('"manifest_sha256": "','"manifest_sha256": "bad'))
        with self.assertRaises(ValueError):self.build()
        self.assertFalse((self.root/'out').exists());self.review.write_text(old)
        Image.new('RGB',(120,100),'red').save(self.source/'category'/'A'/'F1_scaled.png')
        with self.assertRaisesRegex(ValueError,'Piksel'):self.build()
        self.assertFalse((self.root/'out'/'dataset').exists())
    def test_insufficient_retained_images_preserves_audit_without_parquet(self):
        with self.assertRaisesRegex(ValueError,'minimum'):self.build(minimums={'train':3,'validation':1,'test':1})
        self.assertTrue((self.root/'out'/'audit'/'manifest-elemen.json').exists())
        self.assertFalse((self.root/'out'/'dataset').exists())
    def test_dense_drawings_not_partially_exported(self):
        original=elements.extract
        def dense(payload,w,h):
            found,excluded=original(payload,w,h)
            if w==120:
                wall=next(e for e in found if e['label']=='DINDING')
                found.extend([{**wall,'source_key':'extra'+str(i)} for i in range(32)])
            return found,excluded
        with patch.object(elements,'extract',dense):
            with self.assertRaisesRegex(ValueError,'minimum'):self.build()
        p=json.loads((self.root/'out'/'provenans-batch.json').read_text())
        self.assertEqual(p['retained_images']['train'],1)
        self.assertIn('requires_each_target_class_1_to_32_instances',p['skipped'][0]['reason'])
    def test_bootstrap_hashes(self):
        text=(ROOT/'start-batch.ps1').read_text()
        for name in ['batch.py','prepare.py','review.html','prompt-ms.txt']:
            self.assertIn(cubi.sha((ROOT/name).read_bytes()),text)
        self.assertIn(cubi.sha(elements.helper.read_bytes()),text)

if __name__=='__main__':unittest.main()
