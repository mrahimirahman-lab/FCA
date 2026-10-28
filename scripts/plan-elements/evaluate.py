"""Generate offline, per-element-class test comparisons from a verified element batch."""
import argparse
import base64
import json
from pathlib import Path
import prepare as elements
cubi=elements.cubi


def build(batch,output):
    batch=batch.resolve();audit=batch/'audit';raw=(audit/'manifest-elemen.json').read_bytes()
    manifest=json.loads(raw);export_raw=(batch/'dataset'/'manifest-eksport-elemen.json').read_bytes();exported=json.loads(export_raw)
    if (manifest.get('schema_version')!=1 or exported.get('schema_version')!=1 or
            manifest.get('task')!='plan_elements_bbox_v1' or exported.get('task')!='plan_elements_bbox_v1' or
            manifest.get('units')!='relative_0_1000' or exported.get('source_manifest_sha256')!=cubi.sha(raw) or
            exported.get('prompt_sha256')!=cubi.sha(elements.PROMPT.encode()) or manifest.get('prompt_sha256')!=exported['prompt_sha256']):
        raise ValueError('Manifest eksport/audit/prompt elemen tidak sepadan.')
    groups={};all_ids=set()
    for split in ['train','validation','test']:
        info=exported['splits'][split];ids=info['image_ids']
        if (not isinstance(ids,list) or any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids)
                or all_ids.intersection(ids) or info['rows']!=3*len(ids)):
            raise ValueError('ID/split/bilangan tugasan tidak sah.')
        groups[split]=ids;all_ids.update(ids)
    if not 1<=len(groups['test'])<=100:raise ValueError('Perlu 1–100 pelan ujian.')
    samples={s['id']:s for s in manifest['samples']}
    if len(samples)!=len(manifest['samples']):raise ValueError('ID audit berulang.')
    cases=[];images={};svg_seen=set();pixels_seen=set()
    for id in sorted(groups['test']):
        s=samples[id]
        if not s['eligible']:raise ValueError('Pelan ujian bertanda isu: '+id)
        path=(audit/s['file']).resolve()
        if not path.is_relative_to(audit.resolve()) or path.stat().st_size>32*1024*1024:raise ValueError('Laluan/saiz imej tidak sah.')
        image_raw=path.read_bytes();image=cubi.rgb_image(image_raw);digest=cubi.pixel_hash(image)
        if (digest!=s['image_sha256'] or image.size!=(s['width'],s['height']) or digest in pixels_seen or s['svg_sha256'] in svg_seen):
            raise ValueError('Imej berubah atau imej/SVG berulang: '+id)
        pixels_seen.add(digest);svg_seen.add(s['svg_sha256'])
        for e in s['elements']:
            g=cubi.geometry(e['polygon_pixels'],s['width'],s['height'])
            if g['warnings'] or g['bbox_2d']!=e['bbox_2d'] or elements.LABELS.get(e['source_class'])!=e['label']:
                raise ValueError('Rujukan elemen berubah: '+id)
        queries=list(elements.tasks(s))
        if len(queries)!=3:raise ValueError('Perlu ketiga-tiga kelas dengan 1–32 objek: '+id)
        file='images/'+cubi.sha(id.encode())[:20]+'.png';images[file]=image_raw
        for prompt,expected in queries:
            label=expected[0]['label']
            cases.append({'id':id+'__'+label,'image_id':id,'target_class':label,
                          'width':image.width,'height':image.height,'file':file,
                          'image_sha256':digest,'reference_sha256':cubi.sha(cubi.packed(expected).encode()),
                          'prompt':prompt,'expected':expected,'url':'data:image/png;base64,'+base64.b64encode(image_raw).decode()})
    identity=[{k:v for k,v in c.items() if k not in ('file','url')} for c in cases]
    payload={'schema_version':1,'dataset':'CubiCasa5K','task':'plan_elements_bbox_v1',
             'units':'relative_0_1000','benchmark_id':cubi.sha(cubi.packed(identity).encode()),
             'source_manifest_sha256':cubi.sha(raw),'export_manifest_sha256':cubi.sha(export_raw),
             'source_drawings':len(images),'case_unit':'single_element_class_query',
             'split_provenance':exported['split_provenance'],'reference_status':exported['review_method'],
             'models':{'base':'Qwen3-VL-2B-Instruct BASE','tuned':'FCA-ELEMEN-01'},'cases':cases}
    if output.exists():raise ValueError('Folder output sudah wujud.')
    root=Path(__file__).parent
    engine=root/'score.js'
    if not engine.exists():engine=root.parent/'cubicasa'/'score.js'
    template=(root/'evaluator.html').read_text(encoding='utf-8')
    html=template.replace('__SCORING_ENGINE__',engine.read_text(encoding='utf-8')).replace('__PAYLOAD__',json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'))
    output.mkdir(parents=True);(output/'images').mkdir()
    for file,b in images.items():(output/file).write_bytes(b)
    (output/'BUKA-UJIAN-ELEMEN.html').write_text(html,encoding='utf-8')
    (output/'manifest-ujian-elemen.json').write_text(json.dumps({**payload,'cases':identity},ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'LESEN.txt').write_text(cubi.LICENSE,encoding='utf-8')
    (output/'BACA-DAHULU.txt').write_text(f'''UJIAN ELEMEN: {len(images)} PELAN / {len(cases)} TUGASAN
Setiap pelan mempunyai tiga soalan: DINDING, PINTU dan TINGKAP. Mulakan dengan tiga soalan bagi satu pelan dahulu.
Buka BUKA-UJIAN-ELEMEN.html. Pilih soalan, Simpan PNG bersih dan Salin prompt. Dalam Unsloth buka Compare in Chat BAHARU: model asal Qwen3-VL-2B-Instruct vs adapter FCA-ELEMEN-01. Lampirkan imej yang sama dan hantar prompt yang sama. Menukar pemilih di halaman ujian TIDAK menukar imej Unsloth. Fail PNG satu pelan boleh digunakan semula untuk tiga soalan, tetapi mulakan chat baharu bagi setiap soalan.
Tetapan permulaan kedua-dua model: temperature 0, Max New Tokens 2048. Jika output terpotong, rekod jawapan asal sebagai kegagalan sebelum sebarang ujian semula; gunakan tetapan sama untuk ujian semula kedua-dua model dan simpan laporan berasingan.
Tampal kedua-dua jawapan, kemudian tandakan pengesahan dan Banding & simpan tugasan. Jika koordinat/JSON tidak sah, gunakan Rekod jawapan gagal; nombor asal tidak dipinda dan kegagalan tidak menjadi [] atau skor sifar. Eksport JSON selepas setiap sesi. Muat semula laporan untuk menyambung; cap jari set ujian dan rujukan mesti sama.
Ringkasan setiap kelas menggunakan subset sama dengan dua jawapan sah. Baca skor bersama kadar kegagalan, bilangan tugasan sah dan kemajuan pelan/tugasan. Skor kotak bukan metrik garisan CAD atau segmentasi. DINDING ialah kotak poligon sumber penuh; PINTU ialah kotak bukaan/ambang, bukan seluruh lengkok; TINGKAP ialah kotak bukaan.
Halaman ini tempatan dan tidak menjalankan inferens. Ujian menggunakan subset pembahagian terdahulu yang telah diperiksa; bukan benchmark rasmi atau set buta baharu. Rujukan tambahan disaring automatik, bukan semuanya disemak manusia. CC BY-NC 4.0.
''',encoding='utf-8')
    print(f'Ujian elemen siap: {len(images)} pelan / {len(cases)} tugasan. Tiada model dijalankan. {output}')
    return payload


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('batch',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();build(a.batch,a.output)
