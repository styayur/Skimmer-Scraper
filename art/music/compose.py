"""Render eight original ambient cues. Requires NumPy and opus-tools."""
from pathlib import Path
import subprocess, tempfile, wave
import numpy as np

rate = 24000
out = Path(__file__).resolve().parents[2] / 'public/music'
out.mkdir(parents=True, exist_ok=True)
themes = {
    'city': (45, [0, 5, 3, 7], 0.54),
    'dragonspine': (38, [0, 8, 3, 5], 0.86),
    'forge': (42, [0, 2, 7, 5], 0.71),
    'local': (48, [0, 3, 5, 0], 0.78),
}
with tempfile.TemporaryDirectory() as temp:
    for theme_index,(theme,(root,changes,beat)) in enumerate(themes.items()):
        for variation in range(2):
            rng = np.random.default_rng(435 + 2 * theme_index + variation)
            mix = np.zeros((int(rate*beat*64)+rate*3, 2))
            def note(start, length, midi, gain, pan, attack):
                t = np.arange(int(rate*length))/rate
                phase = 2*np.pi*440*2**((midi-69)/12)*t
                tone = np.sin(phase) + 0.20*np.sin(2*phase) + 0.08*np.sin(3*phase)
                env = np.minimum(1,t/attack)*np.minimum(1,(length-t)/min(1.3,length/2))
                signal = gain * tone * env
                i = int(start*rate)
                mix[i:i+len(t)] += signal[:,None]*np.array([np.sqrt(1-pan),np.sqrt(pan)])
            for bar in range(8):
                bass = root + changes[(bar+variation)%4]
                ch = [bass,bass+7,bass+15,bass+22]
                for j,midi in enumerate(ch):
                    note(bar*8*beat,8*beat+1.2,midi,.085,0.18+0.2*j,0.9)
                for step in range(0,8,1 if theme=='city' else 2):
                    note((bar*8+step)*beat,beat*1.9,rng.choice(ch)+12,.06,rng.uniform(.25,.75),.07)
            mix[-rate*2:] *= np.linspace(1,0,rate*2)[:,None]
            wav=Path(temp)/'cue.wav'
            with wave.open(str(wav),'wb') as f:
                f.setparams((2,2,rate,0,'NONE','')); f.writeframes((mix*32767).astype('<i2').tobytes())
            subprocess.run(['opusenc','--quiet','--music','--bitrate','48','--serial',str(100+2*theme_index+variation),wav,out/f'{theme}-{variation}.opus'],check=True)
