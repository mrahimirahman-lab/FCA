"""Element test set integrity using only synthetic source fixtures."""
import importlib.util
import json
import unittest
from pathlib import Path
from PIL import Image
import test_batch

ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('element_eval',ROOT/'evaluate.py')
eval_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(eval_module)

class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_batch.BatchTests();self.fixture.setUp();self.fixture.build()
        self.root=self.fixture.root;self.batch=self.root/'out'
    def tearDown(self):self.fixture.tearDown()
    def test_exactly_three_queries_one_test_drawing_and_same_training_prompts(self):
        p=eval_module.build(self.batch,self.root/'evaluation')
        self.assertEqual(p['source_drawings'],1);self.assertEqual(len(p['cases']),3)
        self.assertEqual({c['image_id'] for c in p['cases']},{'D'})
        self.assertEqual({c['target_class'] for c in p['cases']},{'DINDING','PINTU','TINGKAP'})
        self.assertEqual(len({c['id'] for c in p['cases']}),3)
        self.assertEqual(len({c['image_sha256'] for c in p['cases']}),1)
        manifest=json.loads((self.batch/'audit'/'manifest-elemen.json').read_bytes())
        sample=next(s for s in manifest['samples'] if s['id']=='D')
        self.assertEqual([c['prompt'] for c in p['cases']],[q for q,_ in eval_module.elements.tasks(sample)])
        self.assertEqual(len(list((self.root/'evaluation'/'images').glob('*.png'))),1)
        html=(self.root/'evaluation'/'BUKA-UJIAN-ELEMEN.html').read_text()
        self.assertNotIn('__PAYLOAD__',html);self.assertNotIn('__SCORING_ENGINE__',html)
        self.assertNotIn('FCA-CUBI-01',html);self.assertIn('FCA-ELEMEN-01',html)
    def test_stale_export_and_changed_png_are_rejected(self):
        export_path=self.batch/'dataset'/'manifest-eksport-elemen.json';original=export_path.read_bytes();m=json.loads(original)
        m['source_manifest_sha256']='bad';export_path.write_text(json.dumps(m))
        with self.assertRaises(ValueError):eval_module.build(self.batch,self.root/'evaluation')
        self.assertFalse((self.root/'evaluation').exists());export_path.write_bytes(original)
        audit=json.loads((self.batch/'audit'/'manifest-elemen.json').read_bytes());s=next(s for s in audit['samples'] if s['id']=='D')
        Image.new('RGB',(s['width'],s['height']),'red').save(self.batch/'audit'/s['file'])
        with self.assertRaisesRegex(ValueError,'Imej berubah'):eval_module.build(self.batch,self.root/'evaluation')
    def test_bootstrap_hashes(self):
        text=(ROOT/'start-evaluation.ps1').read_text()
        for name in ['evaluate.py','prepare.py','evaluator.html','prompt-ms.txt']:
            self.assertIn(eval_module.cubi.sha((ROOT/name).read_bytes()),text)
        self.assertIn(eval_module.cubi.sha(eval_module.elements.helper.read_bytes()),text)
        self.assertIn(eval_module.cubi.sha((ROOT.parent/'cubicasa'/'score.js').read_bytes()),text)

if __name__=='__main__':unittest.main()
