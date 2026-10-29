"""Check every offline-shell file and release marker before publishing."""
import json
import re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'version.json').read_text())['version']
sw = (root / 'sw.js').read_text()
assert re.search(r"const RELEASE = '([^']+)';", sw)[1] == version
files = re.search(r'const FILES = (\[[^;]+\]);', sw)[1]
files = json.loads(files.replace("'", '"'))
assert len(files) == len(set(files))
for name in files:
    p = root / name
    assert p.is_file(), f'Missing app shell file: {name}'
    if name.endswith('.js'):
        assert p.read_text().startswith('// diary-release: ' + version + '\n'), name
assert 'name="diary-version" content="' + version + '"' in (root / 'index.html').read_text()
assert json.loads((root / 'manifest.webmanifest').read_text())['version'] == version
for name in ['storage.js', 'network.js', 'boot.js']:
    assert f'src="{name}"' in (root / 'index.html').read_text(), name
for name in root.glob('*.js'):
    assert name.name == 'sw.js' or name.name in files, f'Uncached runtime file: {name.name}'
print(f'PASS: release {version}, {len(files)} app shell files are complete and consistent.')
