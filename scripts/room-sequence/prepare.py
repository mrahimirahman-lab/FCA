"""Bind a private, draft room-sequence reference to a clean image for human review."""
import argparse
import base64
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from PIL import Image

MAX_REFERENCE_BYTES=512*1024

def sha(raw):return hashlib.sha256(raw).hexdigest()
def pixel_hash(image):return sha(f'{image.width}x{image.height}:'.encode()+image.tobytes())
def rgb_image(raw):
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        if image.mode in ('RGBA','LA') or 'transparency' in image.info:
            rgba=image.convert('RGBA');image=Image.alpha_composite(Image.new('RGBA',rgba.size,'white'),rgba)
        return image.convert('RGB')
def finite(v):return not isinstance(v,bool) and isinstance(v,(int,float)) and math.isfinite(v)
def point(p):return isinstance(p,list) and len(p)==2 and all(finite(v) for v in p)
def canonical(data):return json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()

def decode_reference(encoded):
    if len(encoded)>2*MAX_REFERENCE_BYTES:raise ValueError('Rujukan terlalu besar.')
    compressed=base64.b64decode(encoded,validate=True)
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:raw=stream.read(MAX_REFERENCE_BYTES+1)
    if len(raw)>MAX_REFERENCE_BYTES:raise ValueError('Rujukan terlalu besar.')
    reference=json.loads(raw)
    validate_reference(reference)
    return reference

def validate_reference(r):
    if r.get('schema_version')!=1 or r.get('task')!='room_sequence_draft_v1':raise ValueError('Format rujukan draf tidak sah.')
    size=r.get('template_image_size');frame=r.get('template_frame')
    if not point(size) or min(size)<=0 or not isinstance(frame,list) or len(frame)!=4 or not all(finite(x) for x in frame) or not (0<=frame[0]<frame[2]<=size[0] and 0<=frame[1]<frame[3]<=size[1]):raise ValueError('Bingkai template tidak sah.')
    units=r.get('units');rooms=r.get('rooms')
    if not isinstance(units,list) or not 1<=len(units)<=20 or not isinstance(rooms,list) or not 1<=len(rooms)<=100:raise ValueError('Perlu unit dan rujukan ruang.')
    if any(not isinstance(u,str) or not u.strip() or len(u)>120 for u in units) or len(set(units))!=len(units):raise ValueError('Unit rujukan tidak sah.')
    if [x.get('sequence') for x in rooms]!=list(range(1,len(rooms)+1)):raise ValueError('Urutan mesti 1..N tanpa jurang atau pendua.')
    for room in rooms:
        if (room.get('unit') not in units or room.get('zone') not in ('dalam','luar') or
                not isinstance(room.get('name'),str) or not 1<=len(room['name'].strip())<=120 or
                not isinstance(room.get('polygon'),list) or not 3<=len(room['polygon'])<=40 or
                any(not point(p) for p in room['polygon'])):raise ValueError('Rujukan ruang tidak sah.')
    if {x['unit'] for x in rooms}!=set(units):raise ValueError('Unit tanpa ruang.')
    for room in rooms:geometry(room['polygon'],*size)
    entries=r.get('entrances')
    if not isinstance(entries,list) or len(entries)!=len(units) or {e.get('unit') for e in entries}!=set(units) or any(not point(e.get('point')) or not (0<=e['point'][0]<=size[0] and 0<=e['point'][1]<=size[1]) for e in entries):raise ValueError('Perlu satu pintu utama setiap unit.')
    starts=r.get('outdoor_starts')
    if not isinstance(starts,dict) or set(starts)!=set(units):raise ValueError('Perlu dasar mula kawasan luar setiap unit.')
    for unit,seq in starts.items():
        if not isinstance(seq,int) or isinstance(seq,bool) or not any(x['sequence']==seq and x['unit']==unit and x['zone']=='luar' for x in rooms):raise ValueError('Ruang mula luar tidak sah.')
    return r

def geometry(poly,width,height):
    if not isinstance(poly,list) or not 3<=len(poly)<=40 or any(not point(p) for p in poly):raise ValueError('Poligon mesti mempunyai 3–40 titik berangka.')
    if any(not (0<=x<=width and 0<=y<=height) for x,y in poly):raise ValueError('Poligon di luar imej; tiada clamp automatik.')
    if len({tuple(p) for p in poly})!=len(poly):raise ValueError('Titik poligon berulang.')
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def on(a,b,p):return abs(cross(a,b,p))<1e-8 and min(a[0],b[0])-1e-8<=p[0]<=max(a[0],b[0])+1e-8 and min(a[1],b[1])-1e-8<=p[1]<=max(a[1],b[1])+1e-8
    def intersects(a,b,c,d):
        p,q,r,s=cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)
        return p*q<0 and r*s<0 or on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b)
    n=len(poly)
    for i in range(n):
        for j in range(i+1,n):
            if j==i+1 or (i==0 and j==n-1):continue
            if intersects(poly[i],poly[(i+1)%n],poly[j],poly[(j+1)%n]):raise ValueError('Sisi poligon bersilang/bersentuh sendiri.')
    area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1])))/2
    if area<=0:raise ValueError('Luas poligon sifar.')
    x,y=zip(*poly);box=[min(x),min(y),max(x),max(y)]
    b=[int(math.floor(box[0]/width*1000+.5)),int(math.floor(box[1]/height*1000+.5)),int(math.floor(box[2]/width*1000+.5)),int(math.floor(box[3]/height*1000+.5))]
    if not (0<=b[0]<b[2]<=1000 and 0<=b[1]<b[3]<=1000):raise ValueError('Kotak runtuh pada resolusi 0–1000.')
    return {'bbox_pixels':box,'bbox_2d':b,'area_pixels':area}

def build(image_path,encoded_reference,output):
    ref=decode_reference(encoded_reference)
    if output.exists():raise ValueError('Folder output sudah wujud.')
    if image_path.stat().st_size>32*1024*1024:raise ValueError('Imej melebihi 32 MB.')
    image=rgb_image(image_path.read_bytes());buffer=io.BytesIO();image.save(buffer,format='PNG');png=buffer.getvalue()
    payload={'schema_version':1,'task':'room_sequence_geometry_review_v1','reference':ref,
             'reference_sha256':sha(canonical(ref)),
             'image':{'file':'pelan-bersih.png','width':image.width,'height':image.height,'image_sha256':pixel_hash(image),
                      'png_sha256':sha(png),'url':'data:image/png;base64,'+base64.b64encode(png).decode()},
             'training_executed':False}
    template=Path(__file__).with_name('review.html').read_text(encoding='utf-8')
    html=template.replace('__PAYLOAD__',json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'))
    output.mkdir(parents=True)
    (output/'pelan-bersih.png').write_bytes(png)
    (output/'rujukan-draf.json').write_text(json.dumps({k:v for k,v in payload.items() if k!='image'}|{'image':{k:v for k,v in payload['image'].items() if k!='url'}},ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'BUKA-SEMAKAN-URUTAN.html').write_text(html,encoding='utf-8')
    (output/'BACA-DAHULU.txt').write_text('''SEMAKAN RUANG DAN URUTAN
Imej input mestilah pelan bersih tanpa warna, nombor jawapan atau anak panah rujukan. Semakan ini bukan latihan model.
Draf poligon ialah anggaran daripada rujukan perbualan. Semak bingkai, semua pintu utama, serta setiap sempadan dalaman dan kawasan luar. Nama/urutan asal dikekalkan. Jangan sahkan ruang luar hanya kerana kertas kosong; gunakan kawasan yang telah ditentukan pemeriksa.
Dalam HTML: semak dua bucu bingkai, tandakan bingkai dan imej bersih. Pilih setiap ruang, seret titik bucu/ubah koordinat poligon jika perlu dan Sahkan ruang ini. Semak/tandakan setiap pintu utama. Simpan draf untuk sambung kemudian. Simpan semakan lengkap hanya apabila semua ruang dan pintu utama disahkan.
Fail semakan lengkap terikat pada cap jari imej dan rujukan. Ia mengandungi poligon, kotak, nombor urutan dan lokasi pintu utama untuk penyediaan dataset seterusnya. Kod aset pendaftaran akhir berbeza daripada nombor urutan latihan.
Semua unit daripada satu drawing masih satu sumber; jangan pecahkan unit/varian imej yang sama merentas train/validation/test. Lebih banyak pelan bebas diperlukan untuk menilai generalisasi. Tiada Parquet, model, latihan GPU atau ketepatan automatik dihasilkan oleh halaman ini.
''',encoding='utf-8')
    print('Semakan urutan disediakan: '+str(output)+'; tiada latihan dimulakan.')
    return payload


def validate_review(review,reference,image):
    validate_reference(reference)
    if (review.get('schema_version')!=1 or review.get('task')!='room_sequence_review_v1' or
            review.get('reference_sha256')!=sha(canonical(reference)) or
            review.get('image_sha256')!=pixel_hash(image) or
            [review.get('width'),review.get('height')]!=list(image.size) or
            review.get('clean_image_confirmed') is not True or review.get('frame_confirmed') is not True):
        raise ValueError('Imej/rujukan/pengesahan tidak sepadan.')
    frame=review.get('frame_pixels')
    if (not isinstance(frame,list) or len(frame)!=4 or not all(finite(v) for v in frame) or
            not (0<=frame[0]<frame[2]<=image.width and 0<=frame[1]<frame[3]<=image.height) or
            review.get('scope_units')!=reference['units'] or review.get('outdoor_starts')!=reference['outdoor_starts']):
        raise ValueError('Bingkai/skop/dasar mula luar tidak sepadan.')
    rooms=review.get('rooms')
    if not isinstance(rooms,list) or len(rooms)!=len(reference['rooms']):raise ValueError('Bilangan ruang tidak sepadan.')
    for actual,expected in zip(rooms,reference['rooms']):
        if any(actual.get(k)!=expected[k] for k in ['sequence','unit','name','zone']) or actual.get('reviewed') is not True:raise ValueError('Urutan/nama/pengesahan ruang tidak sepadan.')
        g=geometry(actual.get('polygon_pixels'),*image.size)
        if actual.get('bbox_2d')!=g['bbox_2d']:raise ValueError('Kotak tidak sepadan dengan poligon.')
    entrances=review.get('entrances')
    if not isinstance(entrances,list) or len(entrances)!=len(reference['units']) or {e.get('unit') for e in entrances}!=set(reference['units']):raise ValueError('Pintu utama tidak lengkap.')
    for e in entrances:
        if e.get('reviewed') is not True or not point(e.get('point_pixels')) or not(0<=e['point_pixels'][0]<=image.width and 0<=e['point_pixels'][1]<=image.height):raise ValueError('Pintu utama belum disahkan/tidak sah.')
    if review.get('indoor_rooms')!=sum(r['zone']=='dalam' for r in rooms) or review.get('outdoor_rooms')!=sum(r['zone']=='luar' for r in rooms):raise ValueError('Kiraan zon ruang salah.')
    if review.get('total_rooms')!=len(rooms):raise ValueError('Jumlah ruang salah.')
    return review


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('image',type=Path);p.add_argument('output',type=Path);p.add_argument('--reference-b64',required=True)
    a=p.parse_args();build(a.image,a.reference_b64,a.output)
