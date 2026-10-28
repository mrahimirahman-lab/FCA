"""Replace only the UI of an existing local evaluation HTML, with backup."""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path


def repair(path):
    path = path.resolve()
    if not path.is_file() or path.stat().st_size > 256*1024*1024:
        raise ValueError('Pilih fail HTML ujian CubiCasa yang sah (maksimum 256 MB).')
    original = path.read_text(encoding='utf-8-sig')
    marker = 'const data='
    if original.count(marker) != 1:
        raise ValueError('Fail ini bukan halaman ujian CubiCasa yang dijangka.')
    payload, _ = json.JSONDecoder().raw_decode(original.split(marker,1)[1])
    if (payload.get('schema_version') != 1 or payload.get('dataset') != 'CubiCasa5K' or
            payload.get('units') != 'relative_0_1000' or not isinstance(payload.get('cases'),list) or
            not 1 <= len(payload['cases']) <= 200):
        raise ValueError('Data halaman ujian tidak sah. Fail asal tidak diubah.')
    identity = [{k:v for k,v in c.items() if k not in ('url','file')} for c in payload['cases']]
    fingerprint = hashlib.sha256(json.dumps(identity,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if fingerprint != payload.get('benchmark_id'):
        raise ValueError('Cap jari rujukan halaman berubah. Fail asal tidak diubah.')
    if any(not c.get('url','').startswith('data:image/png;base64,') for c in payload['cases']):
        raise ValueError('Halaman tidak mengandungi PNG tempatan yang dijangka.')
    root = Path(__file__).parent
    html = (root/'evaluator.html').read_text(encoding='utf-8').replace('__SCORING_ENGINE__',
           (root/'score.js').read_text(encoding='utf-8')).replace('__PAYLOAD__',
           json.dumps(payload,ensure_ascii=False).replace('<','\\u003c'))
    backup = path.with_name(path.stem+'-sebelum-baiki-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.html')
    shutil.copy2(path,backup)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,suffix='.tmp',delete=False) as f:
            temporary=Path(f.name)
            f.write(html)
        os.replace(temporary,path)
    finally:
        if temporary and temporary.exists(): temporary.unlink()
    print('SIAP: '+str(path))
    print('Sandaran fail asal: '+str(backup))
    print('Imej, prompt, rujukan, benchmark ID dan lokasi fail dikekalkan. Refresh halaman asal dalam browser.')
    return backup


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html',type=Path)
    repair(parser.parse_args().html)
