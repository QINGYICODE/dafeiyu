#!/usr/bin/env python3
"""Build the Flutter Android preview; vendor API keys remain on the server."""
import argparse
import hashlib
import os
import re
from pathlib import Path
import shutil
import ssl
import subprocess
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--server-url', default=os.environ.get('DAFEIYU_SERVER_URL', ''))
parser.add_argument('--trusted-certificate', default=os.environ.get('DAFEIYU_TRUSTED_CERTIFICATE', ''), help='Optional public PEM certificate, trusted only for the server hostname.')
parser.add_argument('--publish-download', action='store_true', help='Publish a small download page; the API streams the APK from releases/.')
parser.add_argument('--skip-checks', action='store_true', help='Only when analyze and tests have already passed for this source revision.')
args = parser.parse_args()
address = urlsplit(args.server_url)
if args.server_url:
    try:
        valid_port = address.port is None or 1 <= address.port <= 65535
    except ValueError:
        valid_port = False
    if address.scheme != 'https' or not address.hostname or address.username or address.password or address.path not in ('', '/') or address.query or address.fragment or not valid_port:
        parser.error('--server-url must be an HTTPS origin without credentials, query or path.')
if args.trusted_certificate and not address.hostname:
    parser.error('--trusted-certificate requires --server-url.')
environment = os.environ.copy()
local_tools = root / '.android-tools'
flutter = shutil.which('flutter')
if not flutter:
    for candidate in (local_tools / 'flutter-linux/bin/flutter', local_tools / 'flutter/bin/flutter.bat'):
        if candidate.is_file():
            flutter = str(candidate)
            break
if not flutter:
    raise SystemExit('Install Flutter 3.41.9 and add flutter/bin to PATH.')
if not environment.get('JAVA_HOME'):
    for candidate in sorted(local_tools.glob('*corretto*')):
        if (candidate / 'bin/javac').is_file():
            environment['JAVA_HOME'] = str(candidate)
            break
sdk = Path(environment.get('ANDROID_HOME') or environment.get('ANDROID_SDK_ROOT') or local_tools / 'sdk')
if not sdk.is_dir():
    raise SystemExit('Set ANDROID_HOME to an installed Android SDK.')
environment['ANDROID_HOME'] = str(sdk.resolve())
environment['PATH'] = os.pathsep.join([str(Path(flutter).parent), str(local_tools / 'linux-tools/usr/bin'), environment.get('PATH', '')])
# Native Flutter tests use a loopback VM service even when a proxy is configured.
for key in ('NO_PROXY', 'no_proxy'):
    environment[key] = ','.join(filter(None, [environment.get(key, ''), 'localhost,127.0.0.1,::1']))
mobile = root / 'mobile'
certificate = mobile / 'assets/trust/companion.pem'
previous = certificate.read_bytes() if certificate.exists() else None
try:
    if args.trusted_certificate:
        pem = Path(args.trusted_certificate).read_text(encoding='ascii')
        ssl.PEM_cert_to_DER_cert(pem)
        certificate.write_text(pem, encoding='ascii')
    else:
        certificate.unlink(missing_ok=True)
    def run(*arguments):
        subprocess.run([flutter, *arguments], cwd=mobile, env=environment, check=True)
    run('pub', 'get')
    if not args.skip_checks:
        run('analyze')
        run('test')
    options = ['build', 'apk', '--release']
    if args.server_url:
        options.append('--dart-define=DAFEIYU_SERVER_URL=' + args.server_url.rstrip('/'))
    if args.trusted_certificate:
        options.append('--dart-define=DAFEIYU_TRUSTED_HOST=' + address.hostname)
    run(*options)
finally:
    if previous is None:
        certificate.unlink(missing_ok=True)
    else:
        certificate.write_bytes(previous)
version_match = re.search(r'^version:\s*(\d+\.\d+\.\d+)(?:\+\d+)?\s*$', (mobile / 'pubspec.yaml').read_text(), re.MULTILINE)
if not version_match:
    raise SystemExit('pubspec.yaml must declare a semantic application version.')
version = version_match.group(1)
source = mobile / 'build/app/outputs/flutter-apk/app-release.apk'
output = root / f'releases/dafeiyu-flutter-v{version}-preview.apk'
output.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, output)
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
checksum_file = output.with_suffix('.apk.sha256')
checksum_file.write_text(f'{checksum}  {output.name}\n')
if args.publish_download:
    downloads = root / 'web/public/downloads'
    downloads.mkdir(parents=True, exist_ok=True)
    # Flutter APKs exceed the static asset host's 25 MiB limit.
    (downloads / output.name).unlink(missing_ok=True)
    shutil.copy2(checksum_file, downloads / checksum_file.name)
    (downloads / 'index.html').write_text(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>大肥鱼 Android</title><h1>大肥鱼 · Flutter Android</h1>'
        f'<p><a href="/api/downloads/{output.name}">下载 Android APK · {version}</a></p>'
        f'<p><a href="/api/downloads/{checksum_file.name}">SHA-256 校验文件</a></p></html>')
print(f'APK: {output}')
print(f'SHA-256: {checksum}')
print(f'Download path: /api/downloads/{output.name}')
