"""Audit source Wall/Door/Window geometry for Qwen; export only reviewed split data."""
import argparse
import base64
import hashlib
import io
import json
import random
from collections import Counter
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET
import importlib.util

# The pinned Windows launcher downloads the existing, reviewed geometry helper here.
helper = Path(__file__).with_name('cubi_geometry.py')
if not helper.exists():
    helper = Path(__file__).parents[1]/'cubicasa'/'prepare.py'
spec=importlib.util.spec_from_file_location('cubi_geometry',helper)
cubi=importlib.util.module_from_spec(spec);spec.loader.exec_module(cubi)
LABELS={'Wall':'DINDING','Door':'PINTU','Window':'TINGKAP'}
PROMPT=Path(__file__).with_name('prompt-ms.txt').read_text(encoding='utf-8').strip()


def extract(payload,width,height):
    if b'<!DOCTYPE' in payload.upper() or b'<!ENTITY' in payload.upper():
        raise ValueError('DTD/entity tidak disokong.')
    root=ET.fromstring(payload)
    if root.tag.rsplit('}',1)[-1]!='svg':raise ValueError('Bukan SVG.')
    elements=[];excluded=Counter()
    def walk(node,parent,path,host=None):
        if 'transform' in node.get('style','').lower() or node.get('clip-path'):
            raise ValueError('CSS transform/clipping memerlukan semakan berasingan.')
        matrix=cubi.multiply(parent,cubi.transform(node.get('transform','')))
        tokens=node.get('class','').split()
        kind=next((k for k in LABELS if k in tokens),None)
        if kind:
            polys=[c for c in node if c.tag.rsplit('}',1)[-1]=='polygon']
            if len(polys)!=1:raise ValueError('Elemen sasaran mesti mempunyai satu poligon langsung: '+path)
            polygon=polys[0]
            geo=cubi.geometry(cubi.points(polygon.get('points',''),cubi.multiply(matrix,cubi.transform(polygon.get('transform','')))),width,height)
            # SVG IDs such as Wall/Door repeat; the XML path identifies the actual instance.
            key='xml:'+path
            elements.append({'source_key':key,'svg_id':node.get('id'), 'source_class':kind,
                             'source_subclass':node.get('class'), 'label':LABELS[kind],
                             'host_wall_source_key':host if kind in ('Door','Window') else None,**geo})
            if kind=='Wall':host=key
        elif node.tag.rsplit('}',1)[-1]=='g' and tokens and tokens[0] in ('Column','Beam','Railing','Space'):
            excluded[tokens[0]]+=1
        for i,child in enumerate(node):
            if child.tag.rsplit('}',1)[-1]=='svg':raise ValueError('SVG bersarang tidak disokong.')
            walk(child,matrix,path+'/'+str(i),host)
    walk(root,cubi.IDENTITY,'0')
    if not elements:raise ValueError('Tiada Wall/Door/Window berpoligon.')
    return elements,dict(excluded)


def audit(source_path,output,limit=6):
    if output.exists():raise ValueError('Folder output sudah wujud.')
    source=cubi.Source(source_path)
    try:
        pairs=sorted(n for n in source.names if PurePosixPath(n).name=='model.svg'
                     and str(PurePosixPath(n).parent/'F1_scaled.png') in source.names)
        if not pairs or not 1<=limit<=200:raise ValueError('Perlu pasangan F1_scaled.png/model.svg; limit 1–200.')
        output.mkdir(parents=True);(output/'images').mkdir();samples=[];errors=[]
        for path in pairs[:limit]:
            identifier=str(PurePosixPath(path).parent)
            try:
                svg=source.read(path,4*1024*1024);png=source.read(str(PurePosixPath(path).parent/'F1_scaled.png'),32*1024*1024)
                image=cubi.rgb_image(png)
                elements,excluded=extract(svg,*image.size)
                file='images/'+cubi.sha(identifier.encode())[:20]+'.png'
                image.save(output/file)
                samples.append({'id':identifier,'file':file,'width':image.width,'height':image.height,
                                'image_sha256':cubi.pixel_hash(image),'svg_sha256':cubi.sha(svg),
                                'elements':elements,'excluded_class_counts':excluded,
                                'eligible':not any(e['warnings'] for e in elements),
                                'counts':dict(Counter(e['label'] for e in elements))})
            except (ValueError,ET.ParseError,OSError) as e:errors.append({'id':identifier,'error':str(e)})
        manifest={'schema_version':1,'task':'plan_elements_bbox_v1','units':'relative_0_1000',
                  'license':cubi.LICENSE,'source':'CubiCasa5K F1_scaled.png + model.svg',
                  'geometry_contract':'Wall full source polygon; Door threshold/opening, not entire swing; Window opening',
                  'not_annotated':['raster stroke centre lines','line weights','load-bearing function','beam targets','wall junction types'],
                  'prompt_sha256':cubi.sha(PROMPT.encode()),'samples':samples,'errors':errors,
                  'training_executed':False,'status':'audit_only_pending_visual_review'}
        raw=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
        (output/'manifest-elemen.json').write_bytes(raw)
        data={'manifest_sha256':cubi.sha(raw),'prompt':PROMPT,'samples':[{**s,'url':'data:image/png;base64,'+base64.b64encode((output/s['file']).read_bytes()).decode()} for s in samples]}
        html=Path(__file__).with_name('review.html').read_text(encoding='utf-8').replace('__PAYLOAD__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
        (output/'BUKA-SEMAKAN-ELEMEN.html').write_text(html,encoding='utf-8')
        (output/'ROLE-PROMPT.txt').write_text(PROMPT,encoding='utf-8')
        (output/'LESEN.txt').write_text(cubi.LICENSE,encoding='utf-8')
        print(f'Audit elemen siap: {len(samples)} pelan; ralat {len(errors)}. Tiada model dilatih.')
        return manifest
    finally:source.close()


def tasks(sample):
    # A single annotated target category per row avoids requesting every class on every plan.
    for source,label in LABELS.items():
        targets=[{'label':e['label'],'bbox_2d':e['bbox_2d']} for e in sample['elements'] if e['source_class']==source]
        if not targets or len(targets)>32:continue
        question='Cari semua elemen '+label+' yang benar-benar kelihatan pada pelan ini sahaja. Jangan keluarkan kategori lain.\n\n'+PROMPT
        yield question,targets


def export(audit_dir,review_path,train_list,val_list,output,test_list=None):
    from datasets import Dataset,Features,Image,Value
    raw=(audit_dir/'manifest-elemen.json').read_bytes();manifest=json.loads(raw);review=json.loads(review_path.read_bytes())
    if (manifest.get('schema_version')!=1 or review.get('schema_version')!=1 or manifest.get('task')!='plan_elements_bbox_v1' or manifest.get('units')!='relative_0_1000'
            or manifest.get('prompt_sha256')!=cubi.sha(PROMPT.encode()) or review.get('manifest_sha256')!=cubi.sha(raw)):
        raise ValueError('Semakan, prompt atau manifest tidak sepadan.')
    ids=review.get('approved_ids')
    if not isinstance(ids,list) or not ids or any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids):raise ValueError('Perlu ID semakan unik.')
    splits={'train':cubi.split_ids(train_list),'validation':cubi.split_ids(val_list),'test':cubi.split_ids(test_list) if test_list else set()}
    if any(splits[a]&splits[b] for a,b in [('train','validation'),('train','test'),('validation','test')]):raise ValueError('Split bertindih.')
    if any(i not in set.union(*splits.values()) for i in ids):raise ValueError('ID semakan tiada dalam senarai split; jangan teka padanan ID.')
    if output.exists():raise ValueError('Folder output sudah wujud.')
    samples={s['id']:s for s in manifest['samples']};rows={k:[] for k in splits};seen=set();seen_svg=set();counts={};skipped=[]
    for split,selected in splits.items():
        group=[samples[i] for i in sorted(ids) if i in selected];counts[split]=[s['id'] for s in group]
        for s in group:
            if not s['eligible']:raise ValueError('Sampel bertanda isu geometri.')
            file=(audit_dir/s['file']).resolve()
            if not file.is_relative_to(audit_dir.resolve()) or file.stat().st_size>32*1024*1024:raise ValueError('Laluan imej tidak sah.')
            image=cubi.rgb_image(file.read_bytes());digest=cubi.pixel_hash(image)
            if digest!=s['image_sha256'] or image.size!=(s['width'],s['height']) or digest in seen or s['svg_sha256'] in seen_svg:raise ValueError('Piksel berubah atau imej/SVG berulang.')
            seen.add(digest);seen_svg.add(s['svg_sha256'])
            for element in s['elements']:
                geo=cubi.geometry(element['polygon_pixels'],s['width'],s['height'])
                if geo['warnings'] or geo['bbox_2d']!=element['bbox_2d'] or LABELS.get(element['source_class'])!=element['label']:
                    raise ValueError('Geometri/kelas elemen berubah.')
            for label,count in s['counts'].items():
                if count>32:skipped.append({'image_id':s['id'],'label':label,'count':count,'reason':'whole-image task exceeds initial 32-instance context budget; not truncated'})
            for question,answer in tasks(s):
                rows[split].append({'image':{'bytes':file.read_bytes(),'path':None},'conversations':[
                    {'from':'human','value':'<image>\n'+question},{'from':'gpt','value':json.dumps(answer,ensure_ascii=False,separators=(',',':'))}]})
    if not rows['train'] or not rows['validation']:raise ValueError('Perlu sekurang-kurangnya satu pelan bebas bagi latihan dan validasi.')
    features=Features({'image':Image(),'conversations':[{'from':Value('string'),'value':Value('string')}]})
    output.mkdir(parents=True)
    for split,values in rows.items():
        if values:
            random.Random(3407).shuffle(values)
            Dataset.from_list(values,features=features).to_parquet(str(output/('Elemen-'+split+'.parquet')))
    info={'schema_version':1,'task':'plan_elements_bbox_v1','source_manifest_sha256':cubi.sha(raw),
          'prompt_sha256':cubi.sha(PROMPT.encode()),'splits':{k:{'image_ids':counts[k],'rows':len(rows[k])} for k in splits},
          'skipped_dense_tasks':skipped,'license':cubi.LICENSE,'training_executed':False,
          'scope':'source polygon bbox detection; no line-centre, load-bearing or chain-of-thought target supervision'}
    (output/'manifest-eksport-elemen.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'LESEN.txt').write_text(cubi.LICENSE,encoding='utf-8')
    print('Parquet elemen disediakan. Tiada latihan dimulakan.')
    return info


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
    a=sub.add_parser('audit');a.add_argument('source',type=Path);a.add_argument('output',type=Path);a.add_argument('--limit',type=int,default=6)
    e=sub.add_parser('export')
    for n in ['audit_dir','review_path','train_list','val_list','output']:e.add_argument(n,type=Path)
    e.add_argument('--test-list',type=Path)
    x=vars(p.parse_args());command=x.pop('command')
    if command=='audit':audit(x.pop('source'),**x)
    else:export(**x)
