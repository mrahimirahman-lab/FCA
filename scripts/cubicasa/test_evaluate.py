"""Independent synthetic test-only pack: no user drawings or annotations in Git."""
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import prepare
import evaluate
import importlib.util
repair_spec=importlib.util.spec_from_file_location("repair_eval",Path(__file__).with_name("repair-evaluator.py"))
repair_eval=importlib.util.module_from_spec(repair_spec)
repair_spec.loader.exec_module(repair_eval)

class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.batch=self.root/'batch'
        self.source=self.root/'source'
        self.source.mkdir()
        for i,name in enumerate(['train','validation','test']):
            p=self.source/name;p.mkdir()
            Image.new('RGB',(100+i*10,80+i*10),'white').save(p/'F1_scaled.png')
            (p/'model.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"><g id="room" class="Space Bedroom"><polygon points="10,10 40,10 40,40 10,40"/></g></svg>')
        self.batch.mkdir()
        self.audit=prepare.audit(self.source,self.batch/'audit')
        (self.batch/'dataset').mkdir()
        self.export={'schema_version':1,'dataset':'CubiCasa5K','source_manifest_sha256':prepare.sha((self.batch/'audit'/'manifest-cubicasa.json').read_bytes()),'split_provenance':'synthetic_custom_test','review_method':'automated_test','splits':{n:{'images':1,'rows':2,'sample_ids':[n]} for n in ['train','validation','test']}}
        self.write_export()
    def tearDown(self):self.temp.cleanup()
    def write_export(self):
        (self.batch/'dataset'/'manifest-eksport.json').write_text(json.dumps(self.export))
    def test_only_test_split_exact_prompt_images_embedded_and_no_mutation(self):
        before=(self.batch/'audit'/'manifest-cubicasa.json').read_bytes()
        p=evaluate.build(self.batch,self.root/'out')
        self.assertEqual([c['id'] for c in p['cases']],['test'])
        s=next(s for s in self.audit['samples'] if s['id']=='test')
        self.assertEqual(p['cases'][0]['prompt'],list(prepare.tasks(s))[-1][0])
        html=(self.root/'out'/'BUKA-UJIAN-CUBICASA.html').read_text()
        self.assertNotIn('__PAYLOAD__',html);self.assertNotIn('__SCORING_ENGINE__',html)
        self.assertIn('data:image/png;base64,',html)
        self.assertEqual(len(list((self.root/'out'/'images').glob('*.png'))),1)
        self.assertEqual(before,(self.batch/'audit'/'manifest-cubicasa.json').read_bytes())
        with self.assertRaisesRegex(ValueError,'sudah wujud'):evaluate.build(self.batch,self.root/'out')
    def test_stale_manifest_split_overlap_and_changed_image_rejected(self):
        self.export['source_manifest_sha256']='stale';self.write_export()
        with self.assertRaisesRegex(ValueError,'tidak sepadan'):evaluate.build(self.batch,self.root/'bad')
        self.export['source_manifest_sha256']=prepare.sha((self.batch/'audit'/'manifest-cubicasa.json').read_bytes())
        self.export['splits']['train']['sample_ids']=['test'];self.write_export()
        with self.assertRaisesRegex(ValueError,'bertindih'):evaluate.build(self.batch,self.root/'bad')
        self.export['splits']['train']['sample_ids']=['train'];self.write_export()
        s=next(s for s in self.audit['samples'] if s['id']=='test')
        Image.new('RGB',(s['width'],s['height']),'red').save(self.batch/'audit'/s['file'])
        with self.assertRaisesRegex(ValueError,'Piksel'):evaluate.build(self.batch,self.root/'bad')
        self.assertFalse((self.root/'bad').exists())
    def test_repair_preserves_payload_and_creates_exact_backup(self):
        payload=evaluate.build(self.batch,self.root/'out')
        page=self.root/'out'/'BUKA-UJIAN-CUBICASA.html'
        before=page.read_bytes()
        backup=repair_eval.repair(page)
        self.assertEqual(backup.read_bytes(),before)
        text=page.read_text()
        decoded,_=json.JSONDecoder().raw_decode(text.split('const data=',1)[1])
        self.assertEqual(decoded,payload)
        self.assertIn('id="compare-status"',text)
        page.write_text('not an evaluation page')
        with self.assertRaisesRegex(ValueError,'bukan halaman'):repair_eval.repair(page)
        self.assertEqual(page.read_text(),'not an evaluation page')

    def test_repair_bootstrap_hashes(self):
        root=Path(__file__).parent;text=(root/'start-repair.ps1').read_text()
        for name in ['repair-evaluator.py','evaluator.html','score.js']:
            self.assertIn("'"+name+"' = '"+prepare.sha((root/name).read_bytes())+"'",text)

    def test_eval_bootstrap_hashes(self):
        root=Path(__file__).parent;text=(root/'start-evaluation.ps1').read_text()
        for name in ['evaluate.py','prepare.py','evaluator.html','score.js']:
            self.assertIn("'"+name+"' = '"+prepare.sha((root/name).read_bytes())+"'",text)

if __name__=='__main__':unittest.main()
