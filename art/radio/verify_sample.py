"""Re-render a sample from each character and compare the actual packaged Opus bytes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def verify(locale, model_dir, ffmpeg):
    authoring = Path(__file__).resolve().parent
    manifest = json.loads((authoring / 'lines.json').read_text(encoding='utf-8'))
    samples = [line for line in manifest if line['event'] in ('launch', 'risk', 'crossing')]
    script = 'render.py' if locale == 'en-US' else 'render_mandarin.py'
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        inputs = root / 'art/radio'
        inputs.mkdir(parents=True)
        shutil.copyfile(authoring / script, inputs / script)
        # Mandarin's seeded generator advances across calls. Preserve authoring order.
        lines = manifest if locale == 'zh-CN' else samples
        (inputs / 'lines.json').write_text(json.dumps(lines, ensure_ascii=False), encoding='utf-8')
        output = root / 'public/radio' / locale
        command = [sys.executable, str(inputs / script)]
        if locale == 'zh-CN':
            command.extend([str(model_dir), '--output', str(output), '--ffmpeg', ffmpeg])
        subprocess.run(command, check=True)
        results = []
        for line in samples:
            name = f"{line['agent']}-{line['event']}.opus"
            generated = (output / name).read_bytes()
            packaged = (authoring.parents[1] / 'public/radio' / locale / name).read_bytes()
            if generated != packaged:
                raise ValueError(f'Render differs from packaged recording: {locale}/{name}')
            results.append(dict(clip=name, text=line['text'][locale], sha256=hashlib.sha256(generated).hexdigest()))
        return dict(locale=locale, method='Byte-identical re-render from catalog text', samples=results)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('locale', choices=['en-US', 'zh-CN'])
    parser.add_argument('--model-dir', type=Path)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--result', type=Path)
    args = parser.parse_args()
    if args.locale == 'zh-CN' and not args.model_dir:
        parser.error('Mandarin verification requires --model-dir')
    result = json.dumps(verify(args.locale, args.model_dir, args.ffmpeg), ensure_ascii=False, indent=2)
    if args.result:
        args.result.parent.mkdir(parents=True, exist_ok=True)
        args.result.write_text(result + '\n', encoding='utf-8')
    else:
        print(result)
