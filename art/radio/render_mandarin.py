"""Render the three Mandarin radio characters offline from the AISHELL-3 Icefall model."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory

import numpy as np
import onnx
from onnx import numpy_helper
import sherpa_onnx
import soundfile

# Each character blends four adult group-C female speaker embeddings. See the
# corpus metadata and model revision in docs/VOICE.md. No reference recording
# or individual speaker embedding is used to represent a character.
GROUPS = (
    ('SSB0534', 'SSB0666', 'SSB0599', 'SSB1828'),
    ('SSB0341', 'SSB1055', 'SSB0614', 'SSB1891'),
    ('SSB1625', 'SSB1366', 'SSB1437', 'SSB0011'),
)
MODEL_SHA = '5511d651b7840c0a93a6bbfd4afd070a2c7f39ca1ec3ff2ecd73191519bbb852'


def render(model_dir, output, encoder):
    model_path = model_dir / 'model.onnx'
    if hashlib.sha256(model_path.read_bytes()).hexdigest() != MODEL_SHA:
        raise ValueError('Unexpected AISHELL-3 ONNX weights')
    ids = (model_dir / 'speakers.txt').read_text().splitlines()
    model = onnx.load(model_path)
    embedding, = (t for t in model.graph.initializer if t.name == 'model.generator.global_emb.weight')
    originals = numpy_helper.to_array(embedding)
    if originals.shape != (len(ids), 256):
        raise ValueError('Speaker map does not match model')
    characters = originals.copy()
    for index, group in enumerate(GROUPS):
        characters[index] = originals[[ids.index(name) for name in group]].mean(axis=0)
    embedding.CopyFrom(numpy_helper.from_array(characters, embedding.name))
    for i, node in enumerate(model.graph.node):
        if node.op_type == 'RandomNormalLike':
            node.attribute.append(onnx.helper.make_attribute('seed', float(100 + i)))
    lines = json.loads(Path(__file__).with_name('lines.json').read_text(encoding='utf-8'))
    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as tmp:
        character_model = Path(tmp) / 'characters.onnx'
        onnx.save(model, character_model)
        vits = sherpa_onnx.OfflineTtsVitsModelConfig(model=str(character_model),
            lexicon=str(model_dir / 'lexicon.txt'), tokens=str(model_dir / 'tokens.txt'))
        config = sherpa_onnx.OfflineTtsModelConfig(vits=vits, num_threads=1, provider='cpu')
        tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=config))
        for line in lines:
            role = line['agent'] - 1
            speech = tts.generate(line['text']['zh-CN'], sid=role, speed=(1.00, .93, 1.06)[role])
            samples = np.asarray(speech.samples)
            if len(samples) < speech.sample_rate // 3 or not np.isfinite(samples).all() or np.max(np.abs(samples)) < .01:
                raise ValueError(f"Empty or invalid render for {line['event']}")
            wav = Path(tmp) / 'speech.wav'
            soundfile.write(wav, samples, speech.sample_rate, subtype='PCM_16')
            target = output / f"{role+1}-{line['event']}.opus"
            subprocess.run([encoder, '-nostdin', '-v', 'error', '-y', '-i', str(wav),
                            '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1',
                            '-c:a', 'libopus', '-application', 'voip', '-b:a', '24k', str(target)], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model_dir', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'public/radio/zh-CN')
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg') or 'ffmpeg')
    args = parser.parse_args()
    render(args.model_dir, args.output, args.ffmpeg)
