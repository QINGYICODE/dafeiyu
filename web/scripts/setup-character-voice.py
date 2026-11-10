"""Prepare the local reference voice without touching the existing Whisper/Edge runtime."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import venv
import wave

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.character-voice-runtime'
REPOSITORY = RUNTIME / 'GPT-SoVITS'
REVISION = 'a7e38f93f1ad8d263093ca26ce0dea3fb7080ea2'
PYTHON = RUNTIME / 'venv/bin/python'

def run(*args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT, **kwargs)

def patch_inference():
    target = REPOSITORY / 'GPT_SoVITS/TTS_infer_pack/TTS.py'
    text = target.read_text()
    # Official pinned checkpoints only; load them on CPU before copying model parameters.
    text = text.replace('torch.load(weights_path, map_location=self.configs.device)', 'torch.load(weights_path, map_location="cpu", weights_only=False)')
    for name in ['bert_model', 'cnhuhbert_model']:
        before = f'        self.{name} = self.{name}.to(self.configs.device)\n        if self.configs.is_half and str(self.configs.device)!="cpu":\n            self.{name} = self.{name}.half()'
        after = f'        if self.configs.is_half and str(self.configs.device)!="cpu":\n            self.{name} = self.{name}.half()\n        self.{name} = self.{name}.to(self.configs.device)'
        if before not in text and after not in text:
            raise RuntimeError('Unexpected source revision')
        text = text.replace(before, after)
    target.write_text(text)
    attention = REPOSITORY / 'GPT_SoVITS/AR/modules/patched_mha_with_cache.py'
    source = attention.read_text()
    imports = 'from typing import Tuple, Optional\nfrom torch import Tensor\n'
    if not source.startswith(imports):
        attention.write_text(imports + source)

def prepare_reference(args):
    import av
    import numpy as np
    source = args.reference.resolve()
    with av.open(str(source)) as container:
        converter = av.AudioResampler(format='s16', layout='mono', rate=32000)
        frames = []
        for frame in container.decode(audio=0):
            frames.extend(item.to_ndarray().flatten() for item in converter.resample(frame))
        frames.extend(item.to_ndarray().flatten() for item in converter.resample(None))
    audio = np.concatenate(frames)
    start = int(args.start * 32000)
    selected = audio[start:start + int(args.seconds * 32000)]
    if not 3 <= len(selected) / 32000 <= 10:
        raise ValueError('Reference clip must be 3 to 10 seconds')
    destination = RUNTIME / 'reference'
    destination.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination / 'klee-reference.wav'), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(32000)
        output.writeframes(selected.astype(np.int16).tobytes())
    metadata = {'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceSeconds': len(audio) / 32000, 'referenceSeconds': len(selected) / 32000, 'promptText': args.reference_text, 'sampleRate': 32000}
    (destination / 'reference.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    return destination / 'klee-reference.wav'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', type=Path, default=ROOT.parent / '中文语音可莉.wav')
    parser.add_argument('--reference-text', default='这个小小的玻璃球，就代表了巴巴托斯大人对可莉的肯定吗？')
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--seconds', type=float, default=6.45)
    parser.add_argument('--prepare-only', action='store_true', help='Use already installed dependencies and weights')
    args = parser.parse_args()
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if not args.prepare_only:
        if not PYTHON.exists():
            venv.EnvBuilder(with_pip=False).create(RUNTIME / 'venv')
        if not REPOSITORY.exists():
            run('git', '-c', 'http.version=HTTP/1.1', 'clone', '--depth', '1', '--filter=blob:none', 'https://github.com/RVC-Boss/GPT-SoVITS.git', REPOSITORY)
        current = subprocess.check_output(['git', '-C', str(REPOSITORY), 'rev-parse', 'HEAD'], text=True).strip()
        if current != REVISION:
            run('git', '-c', 'http.version=HTTP/1.1', '-C', REPOSITORY, 'fetch', '--depth', '1', 'origin', REVISION)
            run('git', '-C', REPOSITORY, 'checkout', '--detach', REVISION)
        run(sys.executable, '-m', 'pip', '--python', PYTHON, 'install', '--disable-pip-version-check', 'torch==2.7.1', 'torchaudio==2.7.1', '--index-url', 'https://download.pytorch.org/whl/cu118')
        run(sys.executable, '-m', 'pip', '--python', PYTHON, 'install', '--disable-pip-version-check', '-r', ROOT / 'scripts/character-voice-requirements.txt')
        os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
        os.environ.setdefault('HF_HUB_DOWNLOAD_TIMEOUT', '120')
        from huggingface_hub import hf_hub_download
        models = REPOSITORY / 'GPT_SoVITS/pretrained_models'
        tasks = []
        for repo, files, destination in [
            ('lj1995/GPT-SoVITS', ['gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt', 'gsv-v2final-pretrained/s2G2333k.pth'], models),
            ('hfl/chinese-roberta-wwm-ext-large', ['config.json', 'pytorch_model.bin', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt', 'special_tokens_map.json', 'added_tokens.json'], models / 'chinese-roberta-wwm-ext-large'),
            ('TencentGameMate/chinese-hubert-base', ['config.json', 'pytorch_model.bin', 'preprocessor_config.json'], models / 'chinese-hubert-base')]:
            tasks.extend((repo, item, destination) for item in files)
        def download(task):
            repo, filename, destination = task
            hf_hub_download(repo, filename, local_dir=str(destination))
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(download, tasks))
    patch_inference()
    reference = prepare_reference(args)
    models = REPOSITORY / 'GPT_SoVITS/pretrained_models'
    config = {'engine': 'gpt-sovits-v2', 'sourceRevision': REVISION, 'python': str(PYTHON), 'repository': str(REPOSITORY), 'referenceAudio': str(reference), 'referenceText': args.reference_text, 'device': 'cuda', 'isHalf': True, 'weights': {'bert_base_path': str(models / 'chinese-roberta-wwm-ext-large'), 'cnhuhbert_base_path': str(models / 'chinese-hubert-base'), 't2s_weights_path': str(models / 'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'), 'vits_weights_path': str(models / 'gsv-v2final-pretrained/s2G2333k.pth')}}
    (RUNTIME / 'config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2))
    print('Prepared config.json. Publish ready.json only after actual synthesis succeeds.')

if __name__ == '__main__':
    main()
