from pathlib import Path

source_path = Path('scripts/apply-mail-upgrades.py')
source = source_path.read_text(encoding='utf-8')
lines = source.splitlines()

fixed_bulk = False
for i, line in enumerate(lines):
    if 'r"function renderBulk' in line and 'function renderList' in line:
        lines[i] = '    r"function renderBulk\\(\\)\\{.*?\\nasync function bulkAction\\(action\\)\\{.*?\\n\\nfunction renderList",'
        fixed_bulk = True
        break

if not fixed_bulk:
    raise SystemExit('Could not locate the bulk-action patch pattern to harden.')

source = '\n'.join(lines) + '\n'
exec(compile(source, str(source_path), 'exec'), {'__name__': '__main__'})
