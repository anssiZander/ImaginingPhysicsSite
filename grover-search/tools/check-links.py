"""Validate article navigation, media, internal fragments and demo dependencies."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import re

SITE = Path(__file__).resolve().parents[2]
ARTICLE = SITE / 'grover-search'
errors = []
checked = 0

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.links = []
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            if attrs['id'] in self.ids:
                errors.append(f'{self.path}: duplicate id {attrs["id"]}')
            self.ids.add(attrs['id'])
        for key in ('href', 'src'):
            if key in attrs:
                self.links.append(attrs[key])
        if tag == 'img' and not attrs.get('alt'):
            errors.append(f'{self.path}: image without alt')

def check(path, link):
    global checked
    url = urlsplit(link)
    if url.scheme or url.netloc:
        return
    target = (path.parent / unquote(url.path)).resolve() if url.path else path
    if target.is_dir():
        target = target / 'index.html'
    if not target.is_file():
        errors.append(f'{path.relative_to(SITE)}: missing {link}')
        return
    checked += 1
    if url.fragment and target.suffix == '.html':
        page = Page(target)
        page.feed(target.read_text(encoding='utf-8'))
        if url.fragment not in page.ids:
            errors.append(f'{path.relative_to(SITE)}: unknown fragment {link}')

for path in [ARTICLE / 'index.html', *ARTICLE.glob('demos/*/index.html')]:
    page = Page(path)
    page.feed(path.read_text(encoding='utf-8'))
    for link in page.links:
        check(path, link)
for path in ARTICLE.rglob('*.js'):
    for link in re.findall(r'''(?:from\s*|import\s*)['"](\.[^'"]+)['"]''', path.read_text(encoding='utf-8')):
        check(path, link)
for name in ('index.html', 'blog.html', 'interactive.html'):
    page = Page(SITE / name)
    page.feed((SITE / name).read_text(encoding='utf-8'))
    for link in page.links:
        if link.startswith('grover-search'):
            check(SITE / name, link)
if errors:
    raise SystemExit('\n'.join(errors))
print(f'{checked} local links, media, module imports and fragments checked.')
