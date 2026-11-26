"""Build the English companion clips with Debian flite and opus-tools."""
from pathlib import Path
import json
import subprocess
import tempfile

here = Path(__file__).resolve().parent
output = here.parents[1] / 'public/radio/en-US'
output.mkdir(exist_ok=True, parents=True)
with tempfile.TemporaryDirectory() as tmp:
    for line in json.loads((here/'lines.json').read_text(encoding='utf8')):
        agent = line['agent']
        wave = Path(tmp)/'line.wav'
        duration = {1:'0.98', 2:'1.10', 3:'0.92'}[agent]
        subprocess.run(['flite','-voice','slt','--setf','duration_stretch='+duration,
                        '-t',line['text']['en-US'],'-o',wave],check=True)
        subprocess.run(['opusenc','--quiet','--speech','--bitrate','28','--serial',str(agent),
                        wave,output/f"{agent}-{line['event']}.opus"],check=True)
