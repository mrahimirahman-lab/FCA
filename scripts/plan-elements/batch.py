"""Prepare an element pilot using the existing drawing split and reviewed calibration."""
import argparse
import io
import json
import math
import random
from collections import Counter,defaultdict
from pathlib import Path,PurePosixPath

import prepare as elements
cubi=elements.cubi


def calibration(manifest_path,review_path):
    raw=manifest_path.read_bytes();m=json.loads(raw);r=json.loads(review_path.read_bytes())
    if (m.get('schema_version')!=1 or m.get('task')!='plan_elements_bbox_v1' or
            m.get('prompt_sha256')!=cubi.sha(elements.PROMPT.encode()) or r.get('schema_version')!=1 or
            r.get('manifest_sha256')!=cubi.sha(raw)):
        raise ValueError('Fail semakan tidak sepadan dengan manifest/prompt elemen.')
    ids=r.get('approved_ids');samples={s['id']:s for s in m['samples']}
    if not isinstance(ids,list) or not ids or any(not isinstance(i,str) for i in ids) or len(ids)!=len(set(ids)):
        raise ValueError('Perlu ID semakan individu yang unik.')
    for id in ids:
        s=samples[id]
        if not s['eligible']:raise ValueError('Kalibrasi mengandungi pelan bertanda isu.')
        for e in s['elements']:
            g=cubi.geometry(e['polygon_pixels'],s['width'],s['height'])
            if g['warnings'] or g['bbox_2d']!=e['bbox_2d'] or elements.LABELS.get(e['source_class'])!=e['label']:
                raise ValueError('Rujukan kalibrasi tidak sah.')
    return {'manifest_sha256':cubi.sha(raw),'review_sha256':cubi.sha(review_path.read_bytes()),
            'approved_ids':ids,'approved_image_sha256':[samples[i]['image_sha256'] for i in ids],
            'reviewed_elements':sum(len(samples[i]['elements']) for i in ids)}


def prior_split(batch):
    raw=(batch/'audit'/'manifest-cubicasa.json').read_bytes();m=json.loads(raw)
    p=(batch/'dataset'/'manifest-eksport.json').read_bytes();e=json.loads(p)
    if (m.get('schema_version')!=1 or m.get('dataset')!='CubiCasa5K' or e.get('schema_version')!=1
            or e.get('dataset')!='CubiCasa5K' or e.get('source_manifest_sha256')!=cubi.sha(raw)):
        raise ValueError('Manifest batch CubiCasa terdahulu tidak sepadan.')
    samples={s['id']:s for s in m['samples']};groups={};seen=set()
    if len(samples)!=len(m['samples']):raise ValueError('ID audit berulang.')
    for split in ['train','validation','test']:
        ids=e['splits'][split]['sample_ids']
        if (not isinstance(ids,list) or len(ids)!=e['splits'][split]['images'] or not ids or
                any(not isinstance(i,str) or i not in samples for i in ids) or len(ids)!=len(set(ids)) or seen.intersection(ids)):
            raise ValueError('Split lama tidak sah, kosong atau bertindih.')
        groups[split]=list(ids);seen.update(ids)
    chosen=[samples[i] for ids in groups.values() for i in ids]
    for key in ['image_sha256','svg_sha256']:
        if len({s[key] for s in chosen})!=len(chosen):raise ValueError('Imej/SVG split lama berulang.')
    return samples,groups,{'export_sha256':cubi.sha(p),'source_manifest_sha256':cubi.sha(raw),
                          'split_provenance':e['split_provenance']}


def source_index(source):
    exact={};by_basename=defaultdict(list)
    for path in source.names:
        if PurePosixPath(path).name!='model.svg':continue
        parent=str(PurePosixPath(path).parent)
        if str(PurePosixPath(parent)/'F1_scaled.png') not in source.names:continue
        exact[parent]=path;by_basename[PurePosixPath(parent).name].append(path)
    return exact,by_basename


def locate(source,old,exact,by_basename):
    # Directory suffixes only discover candidates. BOTH content hashes must match;
    # split membership is never guessed from a numeric basename alone.
    candidates=[]
    if old['id'] in exact:candidates.append(exact[old['id']])
    candidates+=by_basename.get(PurePosixPath(old['id']).name,[])
    candidates=list(dict.fromkeys(candidates));matched=[]
    for path in candidates:
        svg=source.read(path,4*1024*1024)
        if cubi.sha(svg)==old['svg_sha256']:matched.append((path,svg))
    if not matched:raise ValueError('SVG sumber asal tidak ditemui/sepadan untuk ID '+old['id'])
    verified=[]
    for path,svg in matched:
        png=source.read(str(PurePosixPath(path).parent/'F1_scaled.png'),32*1024*1024)
        image=cubi.rgb_image(png)
        if image.size==(old['width'],old['height']) and cubi.pixel_hash(image)==old['image_sha256']:
            verified.append((path,svg,image))
    if not verified:raise ValueError('Piksel F1_scaled.png tidak sepadan dengan pelan asal '+old['id'])
    return verified[0]


def write_audit(output,manifest,groups):
    raw=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
    (output/'manifest-elemen.json').write_bytes(raw)
    byid={i:split for split,ids in groups.items() for i in ids}
    payload={'manifest_sha256':cubi.sha(raw),'prompt':elements.PROMPT,'batch_mode':True,
             'samples':[{**s,'batch_split':byid[s['id']],
                         'url':'data:image/png;base64,'+__import__('base64').b64encode((output/s['file']).read_bytes()).decode()}
                        for s in manifest['samples']]}
    html=Path(__file__).with_name('review.html').read_text(encoding='utf-8').replace('__PAYLOAD__',json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'))
    (output/'BUKA-SEMAKAN-ELEMEN.html').write_text(html,encoding='utf-8')
    (output/'LESEN.txt').write_text(cubi.LICENSE,encoding='utf-8')


def build(source_path,previous_batch,pilot_manifest,pilot_review,output,minimums=None):
    if output.exists():raise ValueError('Folder output sudah wujud. Pilih folder baharu.')
    calibration_info=calibration(pilot_manifest,pilot_review)
    old,groups,provenance=prior_split(previous_batch)
    # Fewer than these counts is a failed preparation, not a silent six-image training set.
    minimums=minimums or {'train':30,'validation':5,'test':5}
    output.mkdir(parents=True);audit=output/'audit';audit.mkdir();(audit/'images').mkdir()
    source=cubi.Source(source_path);samples=[];skipped=[];source_paths={}
    kept={k:[] for k in groups};structural_errors=[]
    try:
        exact,by_basename=source_index(source)
        for split,ids in groups.items():
            for id in sorted(ids):
                # Missing/changed source must stop, not be treated as a low-quality drawing.
                path,svg,image=locate(source,old[id],exact,by_basename)
                source_paths[id]=str(PurePosixPath(path).parent)
                try:
                    found,excluded=elements.extract(svg,*image.size)
                except (ValueError,elements.ET.ParseError) as ex:
                    skipped.append({'id':id,'split':split,'reason':'unsupported_source_geometry','detail':str(ex)})
                    structural_errors.append({'id':id,'error':str(ex)});continue
                counts=Counter(e['label'] for e in found)
                notes=[]
                if any(e['warnings'] for e in found):notes.append('geometry_quality_flag')
                if any(not 1<=counts[label]<=32 for label in elements.LABELS.values()):notes.append('requires_each_target_class_1_to_32_instances')
                file='images/'+cubi.sha(id.encode())[:20]+'.png';image.save(audit/file)
                s={'id':id,'file':file,'width':image.width,'height':image.height,
                   'image_sha256':cubi.pixel_hash(image),'svg_sha256':cubi.sha(svg),
                   'elements':found,'excluded_class_counts':excluded,'eligible':not notes,
                   'counts':dict(counts),'selection_notes':notes}
                samples.append(s)
                if notes:skipped.append({'id':id,'split':split,'reason':notes,'counts':dict(counts)})
                else:kept[split].append(id)
                print(f'Elemen {id}: {split} · '+', '.join(k+'='+str(v) for k,v in counts.items()),flush=True)
    finally:source.close()
    manifest={'schema_version':1,'task':'plan_elements_bbox_v1','units':'relative_0_1000',
              'license':cubi.LICENSE,'source':'CubiCasa5K F1_scaled.png + model.svg',
              'geometry_contract':'Wall full source polygon; Door threshold/opening, not entire swing; Window opening',
              'not_annotated':['raster stroke centre lines','line weights','load-bearing function','beam targets','wall junction types'],
              'prompt_sha256':cubi.sha(elements.PROMPT.encode()),'samples':samples,'errors':structural_errors,
              'training_executed':False,'status':'automatically_screened_batch_after_visual_calibration'}
    write_audit(audit,manifest,groups)
    provenance.update(calibration=calibration_info,source_paths=source_paths,skipped=skipped,
                      requested_images={k:len(v) for k,v in groups.items()},retained_images={k:len(v) for k,v in kept.items()})
    (output/'provenans-batch.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
    for k,n in minimums.items():
        if len(kept[k])<n:raise ValueError(f'Hanya {len(kept[k])} pelan {k} layak; minimum {n}. Audit disimpan, tiada Parquet. Jangan longgarkan rujukan secara tekaan.')
    for k,ids in kept.items():(output/('split-'+k+'.txt')).write_text('\n'.join(ids)+'\n',encoding='utf-8')
    selection={'schema_version':1,'manifest_sha256':cubi.sha((audit/'manifest-elemen.json').read_bytes()),
               'approved_ids':[i for ids in kept.values() for i in ids],
               'review_method':'automated_source_annotation_quality_screening_after_individually_reviewed_calibration'}
    selection_path=output/'pilihan-batch-elemen.json';selection_path.write_text(json.dumps(selection,ensure_ascii=False,indent=2),encoding='utf-8')
    exported=elements.export(audit,selection_path,output/'split-train.txt',output/'split-validation.txt',output/'dataset',output/'split-test.txt')
    reviewed_hashes=set(calibration_info['approved_image_sha256'])
    exported.update(review_method=selection['review_method'],split_provenance='subset_of_previous_full_drawing_split_not_official_benchmark',
                    previous_split=provenance,individually_reviewed_selected_images=sum(s['image_sha256'] in reviewed_hashes for s in samples if s['id'] in selection['approved_ids']),
                    selection_policy='all three classes present with 1–32 instances; no annotated targets truncated',
                    class_task_balance='one DINDING, one PINTU, one TINGKAP row per retained drawing',
                    processor_length_check='not executed; check dataset preview/token budget on target Unsloth version',
                    profile_status='initial trial; no GPU training or VRAM-fit verification executed')
    (output/'dataset'/'manifest-eksport-elemen.json').write_text(json.dumps(exported,ensure_ascii=False,indent=2),encoding='utf-8')
    steps=math.ceil(exported['splits']['train']['rows']/4)
    profile=f'''training:
  max_seq_length: 4096
  vision_image_size: 768
  num_epochs: 1
  learning_rate: 0.00002
  batch_size: 1
  gradient_accumulation_steps: 4
  warmup_steps: {min(5,max(0,steps-1))}
  max_steps: {steps}
  save_steps: {max(1,math.ceil(steps/2))}
  eval_steps: 0.5
  early_stopping_patience: 0
  weight_decay: 0.01
  random_seed: 3407
  packing: false
  train_on_completions: true
  gradient_checkpointing: unsloth
  lr_scheduler_type: linear
lora:
  lora_r: 8
  lora_alpha: 16
  lora_dropout: 0.0
  target_modules: [q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj]
  finetune_vision_layers: false
  finetune_language_layers: true
  finetune_attention_modules: true
  finetune_mlp_modules: true
logging:
  enable_wandb: false
  enable_tensorboard: false
  log_frequency: 1
'''
    (output/'dataset'/'Elemen-config.yaml').write_text(profile,encoding='utf-8')
    (output/'BACA-DAHULU.txt').write_text(f'''ELEMEN PELAN — PERCUBAAN PERTAMA
Pelan layak: train {len(kept['train'])}, validation {len(kept['validation'])}, test {len(kept['test'])}.
Pembahagian asal dikekalkan; pelan ujian tidak dipindahkan ke latihan. Bilangan mungkin berkurang jika anotasi terlalu padat atau geometri tidak disokong. Lihat provenans-batch.json untuk pengecualian. Batch ini ialah subset pelan ringkas dengan ketiga-tiga kelas, bukan semua jenis pelan CubiCasa.
Hanya {len(calibration_info['approved_ids'])} pelan kalibrasi disemak secara individu; batch tambahan diperiksa automatik. Jangan nyatakan semua imej telah disahkan manusia. Semak beberapa contoh dalam audit/BUKA-SEMAKAN-ELEMEN.html sebelum training.
Run baharu FCA-ELEMEN-01; pilih model ASAL unsloth/Qwen3-VL-2B-Instruct, QLoRA 4-bit, Train As Language model. Jangan resume adapter ruang FCA-CUBI-01.
Training Dataset: dataset/Elemen-train.parquet. Eval Dataset: dataset/Elemen-validation.parquet. Simpan Elemen-test.parquet untuk ujian selepas latihan.
Selepas memilih model dan dataset, Load YAML dataset/Elemen-config.yaml. Max Steps {steps}, LR 0.00002, batch 1, accumulation 4, context 4096, image size 768, rank 8/alpha 16, vision layers OFF, completions-only ON. Ini profil awal; processor/token length dan VRAM belum diperiksa dalam pemasangan Unsloth anda. Semak preview imej dan jawapan penuh; jangan jalankan jika sasaran dipotong.
Tugas setiap baris hanya satu kelas: DINDING atau PINTU atau TINGKAP. Kotak pintu = bukaan/ambang, bukan seluruh lengkok. Tiada nama ruang, nombor aset, line weight, garisan CAD atau teks CoT rekaan dijadikan sasaran.
Tiada model dimuat turun atau dilatih oleh skrip ini. CC BY-NC 4.0; kekalkan atribusi dan syarat bukan komersial.
''',encoding='utf-8')
    print('BATCH ELEMEN SIAP: '+str({k:len(v) for k,v in kept.items()})+f'; Max Steps {steps}. Tiada training dijalankan.')
    return exported


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for n in ['source','previous_batch','pilot_manifest','pilot_review','output']:parser.add_argument(n,type=Path)
    args=parser.parse_args();build(args.source,args.previous_batch,args.pilot_manifest,args.pilot_review,args.output)
