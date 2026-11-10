#!/usr/bin/env python3
"""Build a signed development APK. API keys never enter this build."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--server-url', default=os.environ.get('DAFEIYU_SERVER_URL', ''))
parser.add_argument('--trusted-certificate', default=os.environ.get('DAFEIYU_TRUSTED_CERTIFICATE', ''))
parser.add_argument('--publish-download', action='store_true', help='Also copy APK and checksum to the local web download directory.')
args = parser.parse_args()
environment = os.environ.copy()
if not environment.get('JAVA_HOME'):
    for candidate in sorted((root / '.android-tools').glob('*corretto*')):
        if (candidate / 'bin/javac').is_file():
            environment['JAVA_HOME'] = str(candidate)
            break
compiler = Path(environment['JAVA_HOME']) / 'bin' / ('javac.exe' if os.name == 'nt' else 'javac') if environment.get('JAVA_HOME') else None
if not (compiler.is_file() if compiler else shutil.which('javac')):
    raise SystemExit('A full JDK 17/21 is required. Set JAVA_HOME to a JDK containing bin/javac; a Java runtime alone is insufficient.')
sdk = Path(environment.get('ANDROID_SDK_ROOT') or environment.get('ANDROID_HOME') or root / '.android-tools/sdk')
if not sdk.is_dir():
    raise SystemExit('Set ANDROID_HOME to an installed Android SDK (platform android-36 and build-tools 35.0.0).')
environment['ANDROID_HOME'] = str(sdk.resolve())
environment['DAFEIYU_SERVER_URL'] = args.server_url
environment['DAFEIYU_TRUSTED_CERTIFICATE'] = str(Path(args.trusted_certificate).resolve()) if args.trusted_certificate else ''
wrapper = root / 'android' / ('gradlew.bat' if os.name == 'nt' else 'gradlew')
subprocess.run([str(wrapper), '--no-daemon', 'testDebugUnitTest', 'lintDebug', 'assembleDebug'], cwd=root / 'android', env=environment, check=True)
source = root / 'android/app/build/outputs/apk/debug/app-debug.apk'
output = root / 'releases/dafeiyu-android-v0.1.0-preview.apk'
output.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, output)
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.apk.sha256').write_text(f'{checksum}  {output.name}\n')
if args.publish_download:
    downloads = root / 'web/public/downloads'
    downloads.mkdir(parents=True, exist_ok=True)
    shutil.copy2(output, downloads / output.name)
    shutil.copy2(output.with_suffix('.apk.sha256'), downloads / (output.name + '.sha256'))
print(f'APK: {output}')
print(f'SHA-256: {checksum}')
