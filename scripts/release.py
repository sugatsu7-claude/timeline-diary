"""Bump all app shell version markers together. Usage: python scripts/release.py 2026.10.26.2"""
import json
import re
import sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
version = sys.argv[1] if len(sys.argv) == 2 else ''
if not re.fullmatch(r'\d{4}\.\d{1,2}\.\d{1,2}\.\d+', version):
    raise SystemExit('Usage: python scripts/release.py YYYY.MM.DD.RELEASE')
p = root / 'index.html'
s, count = re.subn(r'(name="diary-version" content=")[^"]+("\s*>)', lambda m: m[1]+version+m[2], p.read_text())
if count != 1:
    raise SystemExit('Expected exactly one HTML version marker')
p.write_text(s)
for name in sorted(p.name for p in root.glob('*.js') if p.name != 'sw.js'):
    p = root / name
    s, count = re.subn(r'^// diary-release: [^\n]+', '// diary-release: '+version, p.read_text(), count=1)
    if count != 1:
        raise SystemExit('Missing release marker: '+name)
    p.write_text(s)
p = root / 'sw.js'
s, count = re.subn(r"const RELEASE = '[^']+';", "const RELEASE = '"+version+"';", p.read_text())
if count != 1:
    raise SystemExit('Missing worker release marker')
p.write_text(s)
p = root / 'manifest.webmanifest'
manifest = json.loads(p.read_text())
manifest['version'] = version
p.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
(root/'version.json').write_text(json.dumps({'version': version})+'\n')
print('Release markers updated: '+version)
