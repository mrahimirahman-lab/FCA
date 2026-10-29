"""Synthetic contracts only. User sequence/geometry stays outside the repository."""
import base64
import gzip
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image

spec=importlib.util.spec_from_file_location('sequence',Path(__file__).with_name('prepare.py'))
sequence=importlib.util.module_from_spec(spec);spec.loader.exec_module(sequence)


def reference():
    return {'schema_version':1,'task':'room_sequence_draft_v1','template_image_size':[100,100],
            'template_frame':[10,10,90,90],'units':['U','V'],'excluded_units':['W'],
            'rooms':[{'sequence':1,'unit':'U','name':'ALPHA','zone':'dalam','polygon':[[15,15],[40,15],[40,40],[15,40]]},
                     {'sequence':2,'unit':'U','name':'Luar','zone':'luar','polygon':[[15,60],[40,60],[40,85],[15,85]]},
                     {'sequence':3,'unit':'V','name':'BETA','zone':'dalam','polygon':[[60,15],[85,15],[85,40],[60,40]]},
                     {'sequence':4,'unit':'V','name':'Luar','zone':'luar','polygon':[[60,60],[85,60],[85,85],[60,85]]}],
            'entrances':[{'unit':'U','point':[30,45]},{'unit':'V','point':[70,45]}],
            'outdoor_starts':{'U':2,'V':4}}


def encode(ref):return base64.b64encode(gzip.compress(sequence.canonical(ref),mtime=0)).decode()

class SequenceTests(unittest.TestCase):
    def test_reference_roundtrip_and_rejects_duplicate_order_or_invalid_outdoor_start(self):
        r=reference();self.assertEqual(sequence.decode_reference(encode(r)),r)
        r['rooms'][2]['sequence']=2
        with self.assertRaises(ValueError):sequence.validate_reference(r)
        r=reference();r['outdoor_starts']['U']=1
        with self.assertRaises(ValueError):sequence.validate_reference(r)
        with self.assertRaises(ValueError):sequence.decode_reference(encode({'schema_version':999}))
        with self.assertRaises(ValueError):sequence.decode_reference('A'*(2*sequence.MAX_REFERENCE_BYTES+1))
    def test_polygon_geometry_and_rejects_crossing_zero_area_outside_and_collapsed_box(self):
        self.assertEqual(sequence.geometry([[10,10],[30,10],[30,30],[10,30]],100,100)['bbox_2d'],[100,100,300,300])
        for p in [[[10,10],[20,20],[10,20],[20,10]],[[10,10],[20,10],[30,10]],[[0,0],[110,0],[110,20]],[[10,10],[10,10],[20,20]],[[10,10],[10.001,10],[10.001,20],[10,20]]]:
            with self.assertRaises(ValueError):sequence.geometry(p,100,100)
    def test_builder_keeps_clean_pixels_and_starts_unreviewed(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);p=root/'input.png';Image.new('RGB',(100,100),'white').save(p)
            payload=sequence.build(p,encode(reference()),root/'out')
            self.assertEqual(sequence.pixel_hash(Image.open(root/'out'/'pelan-bersih.png')),payload['image']['image_sha256'])
            html=(root/'out'/'BUKA-SEMAKAN-URUTAN.html').read_text()
            self.assertNotIn('__PAYLOAD__',html);self.assertIn('reviewed:false',html)
            self.assertFalse(list((root/'out').glob('*.parquet')))
            with self.assertRaises(ValueError):sequence.build(p,encode(reference()),root/'out')
    def test_complete_review_rechecks_geometry_order_clean_image_and_entrances(self):
        ref=reference();image=Image.new('RGB',(100,100),'white')
        r={'schema_version':1,'task':'room_sequence_review_v1','reference_sha256':sequence.sha(sequence.canonical(ref)),
           'image_sha256':sequence.pixel_hash(image),'width':100,'height':100,'clean_image_confirmed':True,'frame_confirmed':True,
           'frame_pixels':[10,10,90,90],'scope_units':ref['units'],'outdoor_starts':ref['outdoor_starts'],'indoor_rooms':2,'outdoor_rooms':2,'total_rooms':4,'rooms':[{**x,'polygon_pixels':x['polygon'],**sequence.geometry(x['polygon'],100,100),'reviewed':True} for x in ref['rooms']],
           'entrances':[{'unit':e['unit'],'point_pixels':e['point'],'reviewed':True} for e in ref['entrances']]}
        self.assertEqual(sequence.validate_review(r,ref,image),r)
        r['rooms'][0]['reviewed']=False
        with self.assertRaises(ValueError):sequence.validate_review(r,ref,image)
        r['rooms'][0]['reviewed']=True;r['entrances'][0]['point_pixels']=[200,10]
        with self.assertRaises(ValueError):sequence.validate_review(r,ref,image)
    def test_bootstrap_hashes(self):
        root=Path(__file__).parent;s=(root/'start.ps1').read_text()
        for name in ['prepare.py','review.html']:self.assertIn(sequence.sha((root/name).read_bytes()),s)

if __name__=='__main__':unittest.main()
