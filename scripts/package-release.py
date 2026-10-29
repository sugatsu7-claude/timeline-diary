"""Produce a frontend-only ZIP, a separate Worker, and the reviewable source ZIP."""
import json
import re
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
root = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(root / 'scripts/check-release.py')], check=True)
files = json.loads(re.search(r'const FILES = (\[[^;]+\]);', (root / 'sw.js').read_text())[1].replace("'", '"')) + ['sw.js', 'version.json']
out = root / 'dist'
out.mkdir(exist_ok=True)
with ZipFile(out / 'frontend.zip', 'w', ZIP_DEFLATED) as z:
    for file in files:
        z.write(root / file, file)
(out / 'worker.mjs').write_bytes((root / 'worker/index.mjs').read_bytes())
with ZipFile(out / 'source.zip', 'w', ZIP_DEFLATED) as z:
    for file in sorted(root.rglob('*')):
        if not file.is_file() or any(part in {'.git', 'node_modules', 'dist', '.wrangler', 'test-results', '__pycache__'} for part in file.relative_to(root).parts):
            continue
        if file.name.startswith('.env') or file.name == '.dev.vars':
            continue
        z.write(file, 'timeline-diary/' + str(file.relative_to(root)))
print('Created dist/frontend.zip, dist/worker.mjs, dist/source.zip')
