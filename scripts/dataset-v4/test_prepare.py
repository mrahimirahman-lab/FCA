"""CPU-only tests using synthetic images, never private floor-plan fixtures."""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image as PILImage
from datasets import Dataset, Features, Image, Value, load_dataset


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='fca-v4-test-')
        self.root = Path(self.temp.name)
        self.script = Path(__file__).with_name('prepare.py')
        self.features = Features({'image': Image(), 'conversations': [
            {'from': Value('string'), 'value': Value('string')}
        ]})
        self.rows = []
        specs = [('MANTIN',1230,1185,8,'gray'),('D',374,632,4,'green'),
                 ('C',304,632,3,'blue'),('B',304,632,3,'red')]
        fractional = [(.55,.30,.95,.80),(.10,.60,.40,.90),(.10,.30,.40,.50),
                      (.10,.05,.40,.25),(.55,.05,.70,.20),(.75,.05,.95,.20)]
        for unit,width,height,outsides,color in specs:
            stream = io.BytesIO()
            PILImage.new('RGB',(width,height),color).save(stream,format='PNG')
            labels = ['RUANG TAMU','BILIK 1','BILIK 2','DAPUR',
                      'DAPUR' if unit=='MANTIN' else 'TANDAS',
                      'TANDAS' if unit=='MANTIN' else 'BILIK 3']
            rooms = []
            for label,box in zip(labels,fractional):
                rooms.append({'name':label,'bbox':[round(box[0]*width),round(box[1]*height),
                    round(box[2]*width),round(box[3]*height)],'parentIndex':None})
            for i in range(outsides):
                rooms.append({'name':'RUANG LUAR','bbox':[round(width*(.03+i*.06)),
                    round(height*.93),round(width*(.07+i*.06)),round(height*.98)],'parentIndex':None})
            prompt='Pelan Mantin' if unit=='MANTIN' else 'Pelan unit JKR 70 ('+unit+')'
            self.rows.append({'image':{'bytes':stream.getvalue(),'path':None},'conversations':[
                {'from':'human','value':'<image>\n'+prompt},
                {'from':'gpt','value':json.dumps({'rooms':rooms,'notes':'Synthetic fixture.'})}]})

    def tearDown(self):
        self.temp.cleanup()

    def run_builder(self, rows=None, additional_rows=None):
        source=self.root/'source.parquet'
        Dataset.from_list(self.rows if rows is None else rows,features=self.features).to_parquet(str(source))
        env=os.environ.copy()
        env.update(HF_HOME=str(self.root/'hf'),HF_HUB_OFFLINE='1',HF_DATASETS_OFFLINE='1')
        command=[sys.executable,str(self.script),str(source),str(self.root/'out')]
        if additional_rows is not None:
            additional=self.root/'additional.parquet'
            Dataset.from_list(additional_rows,features=self.features).to_parquet(str(additional))
            command.append(str(additional))
        return subprocess.run(command,
                              text=True,capture_output=True,env=env)

    def test_grouped_split_normalized_targets_negatives_and_profile(self):
        result=self.run_builder()
        self.assertEqual(result.returncode,0,result.stderr)
        out=self.root/'out'
        manifest=json.loads((out/'manifest-V4.json').read_text())
        self.assertEqual(manifest['train']['rows'],24)
        self.assertEqual(manifest['evaluation']['rows'],8)
        self.assertEqual(manifest['train']['source_groups'],1)
        self.assertEqual(manifest['evaluation']['source_groups'],1)
        self.assertFalse(manifest['training_executed'])
        train_hashes={m['sha256'] for m in manifest['images'].values() if m['split']=='train'}
        eval_hashes={m['sha256'] for m in manifest['images'].values() if m['split']=='evaluation'}
        self.assertFalse(train_hashes & eval_hashes)
        for split,file,absent_count in [('train','V4-latihan-24.parquet',3),
                                        ('evaluation','V4-penilaian-8.parquet',1)]:
            dataset=load_dataset('parquet',data_files=str(out/file),split='train',
                                 cache_dir=str(self.root/'read-cache'))
            empty=0
            for row in dataset:
                target=json.loads(row['conversations'][1]['value'])
                self.assertIsInstance(target,list)
                if not target: empty+=1
                for r in target:
                    self.assertEqual(set(r),{'label','bbox_2d'})
                    l,t,rr,b=r['bbox_2d']
                    self.assertTrue(0<=l<rr<=1000 and 0<=t<b<=1000)
            self.assertEqual(empty,absent_count)
            self.assertTrue(all(row['image']['bytes'] and row['image']['path'] is None
                                for row in dataset.cast_column('image',Image(decode=False))))
        duplicate_queries=[c['prompt'] for c in manifest['cases']
                           if c['image_id']=='MANTIN' and c['kind']=='single'
                           and c['expected'][0]['label']=='DAPUR']
        self.assertEqual(len(duplicate_queries),2)
        self.assertNotEqual(*duplicate_queries)
        eval_negative=next(c for c in manifest['cases']
                           if c['split']=='evaluation' and c['kind']=='absent')
        self.assertIn('BILIK 3',eval_negative['prompt'])
        self.assertEqual(eval_negative['expected'],[])
        import yaml
        profile=yaml.safe_load((out/'FCA-V4-config.yaml').read_text())
        self.assertTrue(profile['training']['train_on_completions'])
        self.assertEqual(profile['training']['max_steps'],48)
        self.assertEqual(profile['training']['eval_steps'],0.5)
        self.assertEqual(profile['training']['max_steps'] * profile['training']['eval_steps'],24)
        self.assertFalse(profile['lora']['finetune_vision_layers'])

    def test_rejects_three_row_source_instead_of_leaking_same_drawing_into_eval(self):
        result=self.run_builder(self.rows[1:])
        self.assertNotEqual(result.returncode,0)
        self.assertIn('4 baris',result.stderr)

    def test_accepts_three_unit_source_with_separate_mantin_v2(self):
        result=self.run_builder(self.rows[1:],[self.rows[0]])
        self.assertEqual(result.returncode,0,result.stderr)
        manifest=json.loads((self.root/'out'/'manifest-V4.json').read_text())
        self.assertEqual(manifest['train']['rows'],24)
        self.assertEqual(manifest['evaluation']['rows'],8)
        self.assertIsNotNone(manifest['additional_mantin_dataset_sha256'])
        self.assertEqual(manifest['images']['MANTIN']['split'],'evaluation')

    def test_rejects_wrong_additional_v2_file(self):
        result=self.run_builder(self.rows[1:],self.rows[1:])
        self.assertNotEqual(result.returncode,0)
        self.assertIn('satu baris',result.stderr)

    def test_rejects_invalid_pixel_bounds_without_clamping(self):
        answer=json.loads(self.rows[1]['conversations'][1]['value'])
        answer['rooms'][0]['bbox'][2]=375
        self.rows[1]['conversations'][1]['value']=json.dumps(answer)
        result=self.run_builder()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('di luar imej',result.stderr)

    def test_detects_identical_training_pixels_with_different_png_encoding(self):
        rgb=PILImage.open(io.BytesIO(self.rows[2]['image']['bytes']))
        stream=io.BytesIO();rgb.save(stream,format='PNG',compress_level=1)
        self.assertNotEqual(stream.getvalue(),self.rows[2]['image']['bytes'])
        self.rows[3]['image']['bytes']=stream.getvalue()
        result=self.run_builder()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Pemisahan sumber',result.stderr)


if __name__=='__main__':
    unittest.main()
