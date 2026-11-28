"""Exercise the five original exported worlds with a single neutral standard-mapped LB sequence."""
import argparse
import functools
import hashlib
import json
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
for arg in ('producer','game','site','output'):
    parser.add_argument(arg,type=Path)
parser.add_argument('game_sha')
args=parser.parse_args()
for arg in ('producer','game','site','output'):
    setattr(args,arg,getattr(args,arg).resolve())
args.output.mkdir(exist_ok=False,parents=True)
def load(p):
    return json.loads(p.read_bytes())
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):
    p.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode())
def run(argv, cwd=None):
    return subprocess.run([str(i) for i in argv],capture_output=True,cwd=cwd,check=True,encoding='utf-8',errors='replace').stdout
assert run(['git','rev-parse','HEAD'],args.producer).strip()=='241bd0eec72439d77a43e8d289cc29c714bf0e4e'
site=load(args.site/'build-info.json')
assert site['sourceCommit']==args.game_sha and site['dirty'] is False
import re
entry=re.search(r'<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/(assets\/[\w.-]+\.js)"',(args.site/'index.html').read_text('utf-8')).group(1)
entry_hash=digest(args.site/entry)
legacy={r['id']:r for r in load(args.producer/'evidence/topogenesis/compiler-measurements.json')['legacy']}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(args.site)))
threading.Thread(target=server.serve_forever,daemon=True).start()
plan={'producerCommit':'241bd0eec72439d77a43e8d289cc29c714bf0e4e','sourceCommit':args.game_sha,'entrySha256':entry_hash,'names':['canopy','caldera','lattice','contact','district'],'method':'All original unmodified entry poses. Standard gamepad capture pulse on interval 4, release request on 48 where held, no yaw, three companions. The disposition is descriptive for stock geometry. Each trace retains actual outcome and game states.'}
save(args.output/'plan.json',plan)
rows=[]
try:
    for name in plan['names']:
        glb=args.output/(name+'.glb')
        spec=args.producer/'examples'/(name+'.json')
        run(['node','tools/export-exchange.js',spec,glb],args.producer)
        assert digest(glb)==legacy[name]['sha256']
        row={'module':name,'seed':load(spec)['seed'],'profile':'cruise','ruleRevision':0,'inputId':'lb4-release48-cruise','disposition':'may-reject','approach':'entry','wingmates':3}
        trace=args.output/(name+'.json')
        run([sys.executable,'-B',args.game/'scripts/measure-import-flight.py',glb,trace,'--url',f'http://127.0.0.1:{server.server_port}','--release-tick','48','--case',json.dumps(row)])
        data=load(trace)
        assert data['build']['sourceCommit']==args.game_sha and data['binary']['sha256']==entry_hash
        assert data['imported']==data['replayed'] and data['returnedToBuiltin'] and data['metrics']['completed'] and not data['errors']
        reader=json.loads(run(['node','tools/read-flight-diagnostic.js',glb,trace],args.producer))
        assert reader['sha256']==digest(glb)
        rows.append({'name':name,'worldSha256':digest(glb),'traceSha256':digest(trace),'bytes':glb.stat().st_size,'seed':row['seed'],'outcome':data['outcome'],'capture':data['metrics']['captured'],'activeRelease':data['metrics']['activeRelease'],'shieldImpacts':data['metrics']['shieldImpacts'],'glideMetres':data['metrics']['longestSampledGlideM'],'geometryRestored':data['imported']==data['replayed']})
        print(name,rows[-1]['outcome'],flush=True)
finally:
    server.shutdown();server.server_close()
    save(args.output/'readback.json',{**plan,'worlds':rows,'complete':len(rows)==5})
