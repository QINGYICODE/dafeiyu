// Install offline speech recognition and online reply synthesis; no API credentials.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.speech-runtime');
const python = path.join(runtime, 'bin/python');
const run = (executable, args, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Speech setup exited with ${code}`)));
});
const temporary = await mkdtemp(path.join(os.tmpdir(), 'qing-speech-setup-'));
try {
  await mkdir(runtime, { recursive: true });
  if (!existsSync(python)) await run('python3', ['-m', 'venv', '--without-pip', runtime]);
  if (!existsSync(path.join(runtime, 'bin/pip'))) {
    const response = await fetch('https://bootstrap.pypa.io/get-pip.py');
    if (!response.ok) throw new Error('Unable to download the pip installer');
    const installer = path.join(temporary, 'get-pip.py');
    await writeFile(installer, await response.text()); await run(python, [installer, '--disable-pip-version-check']);
  }
  await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', 'faster-whisper==1.2.1']);
  await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', 'edge-tts==7.3.1']);
  await writeFile(path.join(runtime, 'tts-ready.json'), JSON.stringify({ engine: 'edge-tts', version: '7.3.1' }));
  await run(python, ['-c', 'from faster_whisper.utils import download_model; import sys; download_model("base", output_dir=sys.argv[1]); print("Local speech model ready.")', path.join(runtime, 'models/base')], { HF_HUB_DISABLE_XET: '1' });
} finally { await rm(temporary, { force: true, recursive: true }); }
