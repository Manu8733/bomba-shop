"""Internal link + asset check over the static build (web/dist)."""
import re, pathlib, urllib.parse
dist = pathlib.Path('web/dist')
files = {p.relative_to(dist).as_posix() for p in dist.rglob('*') if p.is_file()}
def exists(path):
    path = urllib.parse.unquote(path.split('#')[0].split('?')[0]).lstrip('/')
    return path == '' or path in files or f'{path}.html' in files or f'{path}/index.html' in files
bad = {}
for f in dist.rglob('*.html'):
    s = f.read_text(encoding='utf-8')
    urls = re.findall(r'(?:href|src)="(/[^"]*)"', s)
    for m in re.findall(r'srcset="([^"]+)"', s):
        urls += [part.strip().split(' ')[0] for part in m.split(',')]
    for u in urls:
        if u.startswith('/') and not u.startswith('//') and not exists(u):
            bad.setdefault(u, set()).add(f.relative_to(dist).as_posix())
print(len(bad), 'broken internal targets')
for k, v in list(bad.items())[:25]:
    print(k, '<-', len(v), 'pages, e.g.', sorted(v)[0])
