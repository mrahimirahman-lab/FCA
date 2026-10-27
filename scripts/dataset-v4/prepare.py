import sys,json,re,hashlib,base64,io,zipfile
from collections import Counter
from pathlib import Path
from PIL import Image as PILImage
from datasets import Dataset,Features,Image,Value,load_dataset

source,out=Path(sys.argv[1]),Path(sys.argv[2])
out.mkdir(parents=True,exist_ok=True)
ds=load_dataset('parquet',data_files=str(source),split='train',cache_dir=str(out/'cache'))
if len(ds)!=4:
    raise SystemExit('Pilih gabungan-4-sampel-V3-DRAF.parquet yang mempunyai 4 baris, bukan fail model atau dataset 3 unit sahaja.')
raw=ds.cast_column('image',Image(decode=False))
features=Features({'image':Image(),'conversations':[{'from':Value('string'),'value':Value('string')}]})
train,evaluation,cases,images,exterior=[],[],[],{},[]
split_hashes={'train':set(),'evaluation':set()}
native_rule='Gunakan koordinat relatif 0–1000 bagi keseluruhan imej: x=0 kiri, x=1000 kanan, y=0 atas, y=1000 bawah. bbox_2d ialah [kiri,atas,kanan,bawah]. '
json_rule='Pulangkan senarai JSON sahaja. Setiap objek mempunyai label dan bbox_2d. Jika sasaran tiada, pulangkan []. Tamat selepas JSON.'

def normalized(box,width,height):
    if not isinstance(box,list) or len(box)!=4 or not all(isinstance(v,(int,float)) and not isinstance(v,bool) for v in box):
        raise ValueError('Koordinat sumber mesti empat nombor piksel.')
    l,t,r,b=box
    if not 0<=l<r<=width or not 0<=t<b<=height:
        raise ValueError('Kotak sumber di luar imej; data tidak diubah secara automatik.')
    result=[round(1000*l/width),round(1000*t/height),round(1000*r/width),round(1000*b/height)]
    if not 0<=result[0]<result[2]<=1000 or not 0<=result[1]<result[3]<=1000:
        raise ValueError('Kotak terlalu kecil selepas penukaran.')
    return result

def add(image_id,split,kind,title,prompt,expected):
    row={'image':{'bytes':images[image_id]['bytes'],'path':None},'conversations':[{'from':'human','value':'<image>\n'+prompt},{'from':'gpt','value':json.dumps(expected,ensure_ascii=False,separators=(',',':'))}]}
    (train if split=='train' else evaluation).append(row)
    cases.append({'id':image_id+'-'+str(sum(c['image_id']==image_id for c in cases)+1),'image_id':image_id,'split':split,'kind':kind,'title':title,'prompt':prompt,'expected':expected})

for index,row in enumerate(raw):
    payload=row['image'].get('bytes')
    if not payload:
        raise ValueError('Dataset perlu mempunyai imej terbenam.')
    width,height=PILImage.open(io.BytesIO(payload)).size
    conversation=row['conversations']
    user_text=' '.join(m.get('value',m.get('content','')) for m in conversation if m.get('from',m.get('role')) in ['human','user'])
    answers=[m.get('value',m.get('content','')) for m in conversation if m.get('from',m.get('role')) in ['gpt','assistant']]
    if len(answers)!=1:
        raise ValueError('Sampel sumber mesti mempunyai satu jawapan rujukan.')
    rooms=json.loads(answers[0])['rooms']
    if len(rooms)==14:
        if (width,height)!=(1230,1185):
            raise ValueError('Imej Mantin tidak sepadan dengan saiz rujukan.')
        image_id,split,group='MANTIN','evaluation','mantin_drawing'
    else:
        unit=re.search(r'JKR\s*70\s*\(([BCD])\)',user_text,re.I)
        if not unit or len(rooms)!=(10 if unit.group(1).upper()=='D' else 9):
            raise ValueError('Sampel JKR70 D/C/B tidak dapat dikenal pasti dengan pasti.')
        image_id,split,group='JKR70-'+unit.group(1).upper(),'train','jkr70_same_drawing'
    if image_id in images:
        raise ValueError('Imej/unit sumber berulang.')
    decoded=PILImage.open(io.BytesIO(payload)).convert('RGB')
    digest=hashlib.sha256((str(width)+'x'+str(height)+':').encode()+decoded.tobytes()).hexdigest();split_hashes[split].add(digest)
    filename=image_id+'.png'
    PILImage.open(io.BytesIO(payload)).save(out/filename)
    images[image_id]={'bytes':payload,'url':'data:image/png;base64,'+base64.b64encode((out/filename).read_bytes()).decode(),'file':filename,'width':width,'height':height,'source_group':group,'split':split,'sha256':digest}
    inside=[]
    for room in rooms:
        if room.get('parentIndex') is not None:
            raise ValueError('Rujukan V3 sepatutnya semua ruang utama.')
        label=room['name'].strip().upper()
        item={'label':label,'bbox_2d':normalized(room['bbox'],width,height)}
        if label=='RUANG LUAR':
            exterior.append({'image_id':image_id,'source_group':group,**item})
        else:
            inside.append(item)
    if len(inside)!=6:
        raise ValueError('Setiap imej sumber perlu mempunyai enam rujukan dalaman.')
    counts=Counter(r['label'] for r in inside)
    for item in inside:
        name=item['label'];qualifier=''
        if counts[name]>1:
            x=(item['bbox_2d'][0]+item['bbox_2d'][2])/2;y=(item['bbox_2d'][1]+item['bbox_2d'][3])/2
            qualifier=' yang terletak di bahagian '+('atas' if y<333 else 'bawah' if y>666 else 'tengah')+'-'+('kiri' if x<333 else 'kanan' if x>666 else 'tengah')+' imej'
        prompt='Cari kawasan lantai bagi bilik berlabel '+name+qualifier+'. Jejaki muka dalam dinding yang mengelilingi bilik; sambung arah dinding merentasi bukaan pintu. Kotak merangkumi lantai bilik, bukan tulisan label atau lengkok pintu. '+native_rule+json_rule
        add(image_id,split,'single',name+qualifier,prompt,[item])
    prompt='Kenal pasti semua ruang dalaman yang mempunyai nama pada pelan. Jejaki kawasan lantai di dalam dinding setiap ruang. Sempadan fungsi yang terbuka perlu mengikuti rujukan pelan. Abaikan kawasan luar, simbol pintu/tingkap, tajuk dan garisan ukuran. Kotak ruang berbentuk L ialah kotak pembatas keseluruhan kawasan. '+native_rule+json_rule
    add(image_id,split,'multi','Semua ruang dalaman',prompt,inside)
    candidates=(['BILIK 3'] if split=='evaluation' else {'JKR70-D':['BILIK 4'],'JKR70-C':['STOR'],'JKR70-B':['PEJABAT']}[image_id])+['BILIK 4','STOR','PEJABAT','MAKMAL']
    absent=next((n for n in candidates if n not in counts),None)
    if absent is None:
        raise ValueError('Tiada sasaran negatif yang sesuai.')
    add(image_id,split,'absent','Semak ketiadaan '+absent,'Cari ruang berlabel '+absent+' pada imej. '+native_rule+json_rule,[])

if set(images)!={'MANTIN','JKR70-D','JKR70-C','JKR70-B'} or len(split_hashes['train'])!=3 or len(split_hashes['evaluation'])!=1 or split_hashes['train']&split_hashes['evaluation']:
    raise ValueError('Pemisahan sumber latihan/penilaian tidak sah.')
assert len(train)==24 and len(evaluation)==8 and len(exterior)==18
for filename,rows in [('V4-latihan-24.parquet',train),('V4-penilaian-8.parquet',evaluation)]:
    Dataset.from_list(rows,features=features).to_parquet(str(out/filename))
    check=load_dataset('parquet',data_files=str(out/filename),split='train',cache_dir=str(out/'cache'))
    assert len(check)==len(rows)
    for row in check:
        answer=json.loads(row['conversations'][1]['value']);assert isinstance(answer,list)
        assert all(set(a)=={'label','bbox_2d'} for a in answer)
(out/'rekod-kawasan-luar-untuk-fasa-seterusnya.json').write_text(json.dumps(exterior,ensure_ascii=False,indent=2),encoding='utf-8')
public_images={k:{a:b for a,b in v.items() if a not in ['bytes','url']} for k,v in images.items()}
manifest={'version':4,'status':'prepared_not_trained','units':'relative_0_1000','output':'JSON list of label and bbox_2d; [] for absent target','scope':'interior grounding first; exterior reference retained separately','source_dataset_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'train':{'rows':24,'unique_images':3,'source_groups':1,'single':18,'multi':3,'absent':3},'evaluation':{'rows':8,'unique_images':1,'source_groups':1,'single':6,'multi':1,'absent':1},'images':public_images,'cases':cases,'reference_geometry':'user-reviewed draft transfer, not surveyed measurements','requires_fresh_base_model':True,'training_executed':False}
(out/'manifest-V4.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
template=(Path(__file__).with_name('evaluator.html').read_text(encoding='utf-8'))
display={'cases':cases,'images':{k:{a:b for a,b in v.items() if a!='bytes'} for k,v in images.items()}}
(out/'BUKA-UJIAN-V4.html').write_text(template.replace('__PAYLOAD__',json.dumps(display,ensure_ascii=False).replace('<','\\u003c')),encoding='utf-8')
profile='''training:
  max_seq_length: 4096
  vision_image_size: 768
  num_epochs: 2
  learning_rate: 0.00005
  batch_size: 1
  gradient_accumulation_steps: 1
  warmup_steps: 3
  max_steps: 48
  save_steps: 24
  eval_steps: 24
  early_stopping_patience: 1
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
(out/'FCA-V4-config.yaml').write_text(profile,encoding='utf-8')
readme='''FCA V4 — LATIHAN LOKASI RUANG DALAMAN
1. Pilih model asal unsloth/Qwen3-VL-2B-Instruct, kaedah QLoRA 4-bit. Mulakan run baharu; pelan Mantin mesti dikecualikan daripada latihan V4, termasuk adapter V2/V3 yang pernah dilatih dengannya.
2. Dataset latihan: V4-latihan-24.parquet. Ia mempunyai 18 tugasan satu bilik, 3 tugasan semua bilik dan 3 tugasan sasaran yang tiada. Ini 3 imej daripada satu drawing, bukan 24 bangunan.
3. Evaluation Dataset: V4-penilaian-8.parquet. Ia menggunakan satu pelan Mantin berasingan dengan 8 tugasan. Fail penilaian tidak dimasukkan ke slot latihan.
4. Selepas memilih model dan memuat naik kedua-dua dataset, gunakan Configuration > Load YAML > FCA-V4-config.yaml. Pastikan Max Steps 48, batch 1, gradient accumulation 1, LR 0.00005, Image Size 768, Eval Steps 24, LoRA rank 8/alpha 16 dan Assistant completions only aktif.
5. Semak Token Preview jika tersedia: jawapan JSON mesti lengkap dan token assistant tidak semuanya dimask. Profil ini cadangan percubaan pada GPU 8 GB; penggunaan VRAM sebenar perlu dipantau pada komputer anda.
6. Jalankan Start Training. Ujian ini tidak menjamin model lebih tepat. Catat eval loss dan semak hasil koordinat selepas latihan.
7. Buka BUKA-UJIAN-V4.html. Pilih kes, lampirkan PNG yang dinyatakan dan salin arahan yang disediakan kepada BASE MODEL dan V4 dalam perbandingan baharu. Guna imej, arahan dan tetapan penjanaan yang sama; had output 128 bagi satu sasaran dan 1024 bagi semua ruang.
8. Tampal kedua-dua JSON ke halaman ujian dan klik Bandingkan. Simpan keputusan untuk ujian JKR70-D (latihan) dan MANTIN (penilaian). Nilai peningkatan pada pelan penilaian, bukan hanya pelan latihan. Eval loss sahaja bukan ukuran ketepatan sempadan.
Koordinat 0–1000. Semua jawapan ialah senarai JSON ringkas dengan label dan bbox_2d; tiada nota berulang. Bbox ruang L ialah kotak pembatas, bukan kontur tepat. Rujukan koordinat masih draf pemindahan visual. 18 rujukan kawasan luar disimpan berasingan untuk fasa seterusnya, tidak dilatih dalam percubaan dalaman ini.
Tiada model dilatih oleh penjana ini. Model V4 belum serasi terus dengan kontrak FCA lama yang meminta koordinat piksel/name/confidence/parentIndex; integrasi memerlukan penukar yang jelas dan ujian berasingan. Jangan campur unit koordinat secara automatik.
'''
(out/'BACA-DAHULU.txt').write_text(readme,encoding='utf-8')
with zipfile.ZipFile(out/'FCA-dataset-V4.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for f in out.iterdir():
        if f.is_file() and f.suffix in ['.png','.json','.yaml','.html','.txt','.parquet']:
            archive.write(f,f.name)
print('SIAP: '+str(out))
print('Latihan: 24 contoh daripada 3 imej JKR70; penilaian: 8 contoh daripada 1 imej Mantin.')
