"""Build an offline, manual BASE/tuned comparison for the exported test split only."""
import argparse
import base64
import json
from pathlib import Path

from prepare import LABELS, LICENSE, geometry, packed, pixel_hash, rgb_image, sha, tasks


def build(batch, output):
    batch = batch.resolve()
    export_path = batch / 'dataset' / 'manifest-eksport.json'
    audit_path = batch / 'audit' / 'manifest-cubicasa.json'
    raw = audit_path.read_bytes()
    audit = json.loads(raw)
    exported = json.loads(export_path.read_bytes())
    if (exported.get('schema_version') != 1 or audit.get('schema_version') != 1 or
            exported.get('dataset') != 'CubiCasa5K' or audit.get('dataset') != 'CubiCasa5K' or
            audit.get('units') != 'relative_0_1000' or exported.get('source_manifest_sha256') != sha(raw)):
        raise ValueError('Audit/export manifest tidak sepadan. Pilih folder batch yang sama.')
    sets = {}
    for split in ('train', 'validation', 'test'):
        info = exported['splits'][split]
        ids = info['sample_ids']
        if (not isinstance(ids, list) or any(not isinstance(i, str) for i in ids) or
                len(ids) != info['images'] or len(set(ids)) != len(ids)):
            raise ValueError('Senarai ID atau bilangan pelan tidak sah.')
        sets[split] = set(ids)
    if not sets['test'] or len(sets['test']) > 200:
        raise ValueError('Perlu 1–200 pelan ujian.')
    if any(sets[a] & sets[b] for a,b in [('train','validation'),('train','test'),('validation','test')]):
        raise ValueError('Split bertindih; pelan ujian tidak boleh digunakan untuk latihan/validasi.')
    samples = {s['id']:s for s in audit['samples']}
    if len(samples) != len(audit['samples']):
        raise ValueError('ID audit berulang.')
    cases, seen = [], set()
    audit_root = (batch / 'audit').resolve()
    for identifier in sorted(sets['test']):
        sample = samples[identifier]
        if not sample['eligible'] or not 1 <= len(sample['rooms']) <= 24:
            raise ValueError('Sampel ujian bertanda isu: ' + identifier)
        path = (audit_root / sample['file']).resolve()
        if not path.is_relative_to(audit_root) or path.stat().st_size > 32*1024*1024:
            raise ValueError('Fail imej tidak sah: ' + identifier)
        image_raw = path.read_bytes()
        image = rgb_image(image_raw)
        digest = pixel_hash(image)
        if (image.size != (sample['width'],sample['height']) or digest != sample['image_sha256'] or digest in seen):
            raise ValueError('Piksel imej berubah atau berulang: ' + identifier)
        seen.add(digest)
        for room in sample['rooms']:
            checked = geometry(room['polygon_pixels'], sample['width'], sample['height'])
            if (checked['bbox_2d'] != room['bbox_2d'] or checked['warnings'] or
                    room['label'] != LABELS.get(room['source_class'].split()[0])):
                raise ValueError('Rujukan geometri/label tidak sah: ' + identifier)
        prompt, expected = list(tasks(sample))[-1]
        cases.append({'id':identifier, 'width':image.width, 'height':image.height,
                      'image_sha256':digest, 'reference_sha256':sha(packed(expected).encode()),
                      'file':'images/'+sha(identifier.encode())[:20]+'.png',
                      'prompt':prompt, 'expected':expected,
                      'url':'data:image/png;base64,'+base64.b64encode(image_raw).decode()})
    identity = [{k:v for k,v in c.items() if k not in ('url','file')} for c in cases]
    payload = {'schema_version':1, 'dataset':'CubiCasa5K', 'units':'relative_0_1000',
               'benchmark_id':sha(packed(identity).encode()), 'source_manifest_sha256':sha(raw),
               'export_manifest_sha256':sha(export_path.read_bytes()),
               'split_provenance':exported['split_provenance'],
               'reference_status':exported.get('review_method','unspecified'),
               'models':{'base':'Qwen3-VL-2B-Instruct BASE','tuned':'FCA-CUBI-01'}, 'cases':cases}
    if output.exists():
        raise ValueError('Folder output sudah wujud; pilih folder baharu.')
    folder = Path(__file__).parent
    template = (folder/'evaluator.html').read_text(encoding='utf-8')
    engine = (folder/'score.js').read_text(encoding='utf-8')
    html = template.replace('__SCORING_ENGINE__', engine).replace('__PAYLOAD__',
            json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'))
    output.mkdir(parents=True)
    (output/'images').mkdir()
    for case in cases:
        (output/case['file']).write_bytes(base64.b64decode(case['url'].split(',',1)[1]))
    (output/'BUKA-UJIAN-CUBICASA.html').write_text(html,encoding='utf-8')
    (output/'manifest-ujian.json').write_text(json.dumps({**payload,'cases':identity},ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'LESEN.txt').write_text(LICENSE,encoding='utf-8')
    (output/'BACA-DAHULU.txt').write_text('''UJIAN CUBICASA — BASE / FCA-CUBI-01
Buka BUKA-UJIAN-CUBICASA.html. Hanya pelan dalam split test dimasukkan.
Bagi setiap pelan: Simpan PNG bersih; buka chat perbandingan BAHARU dalam Unsloth; lampirkan PNG itu kepada kedua-dua model; Salin prompt yang sama; tampal kedua-dua jawapan ke halaman ujian. Sahkan imej/model sama dan tekan Banding & simpan.
Menukar pemilih di halaman ini TIDAK menukar imej Unsloth. Jangan lampirkan screenshot dengan kotak rujukan. Gunakan tetapan generasi sama; Temperature 0, Max New Tokens 2048 sebagai permulaan. Output terpotong/tidak sah perlu direkod melalui Rekod jawapan gagal bersama kedua-dua jawapan asal, bukan dianggap jawapan kosong. Jika had token dinaikkan, jalankan semula kedua-dua model dan rekod tetapan sama.
Eksport keputusan JSON selepas setiap sesi; muat semula fail itu untuk menyambung. Browser cuba menyimpan draf secara tempatan; eksport JSON ialah sandaran. Tiada imej/jawapan dihantar ke internet oleh halaman ini. Ia tidak menjalankan model atau mengawal Unsloth.
Purata IoU menggunakan padanan satu-ke-satu berlabel sama yang memaksimumkan jumlah IoU; rujukan tidak dipadankan = 0. TP IoU>=0.5 menggunakan padanan berlabel sama berasingan yang memaksimumkan bilangan padanan pada ambang. Kotak tambahan menurunkan precision. Skor ini ialah kotak, bukan segmentasi poligon.
Ringkasan IoU hanya mengira pelan dengan dua jawapan sah. Kegagalan output dilaporkan berasingan bersama kadar kegagalan setiap model dan bilangan pelan sudah diuji; skor subset sah bukan ketepatan keseluruhan apabila ada kegagalan. Jangan anggap ujian selesai jika ada pelan tertinggal. Rujukan daripada anotasi sumber, bukan semua telah disemak manusia. Jangan pilih semula latihan berdasarkan setiap imej ujian; simpan set ini untuk penilaian.
''',encoding='utf-8')
    print(f'Ujian disediakan: {len(cases)} pelan. Tiada inferens atau latihan dijalankan. {output}')
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batch',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    build(args.batch,args.output)
