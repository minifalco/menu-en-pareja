"""Generate iHambre artwork from the supplied image, preserving the illustration.
Usage: python assets/generate-brand.py /path/to/original.jpg
Requires Pillow. The black exterior is flood-filled, never cropped into the art.
"""
from collections import deque
from pathlib import Path
import sys
from typing import cast
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
source = Image.open(sys.argv[1]).convert('RGB')
cream = (251, 248, 240)
pixels = source.load()
assert pixels is not None
w, h = source.size
# Remove dark exterior/antialias pixels connected to the edge; brown basket stays.
queue = deque([(x, y) for x in range(w) for y in (0, h - 1)] +
              [(x, y) for y in range(h) for x in (0, w - 1)])
seen = set()
while queue:
    x, y = queue.popleft()
    if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
        continue
    seen.add((x, y))
    if max(cast(tuple[int, int, int], pixels[x, y])) >= 220:
        continue
    pixels[x, y] = cream
    queue.extend(((x-1, y), (x+1, y), (x, y-1), (x, y+1)))
# Remove the thin outer padding; retain the cream icon and all of the illustration.
icon = source.crop((48, 48, w-48, h-48)).resize((1024, 1024), Image.Resampling.LANCZOS)
icon.save(root / 'assets/icon.png')
icon.save(root / 'assets/splash-icon.png')
icon.resize((64, 64), Image.Resampling.LANCZOS).save(root / 'assets/favicon.png')
# Entire illustration fits the Android adaptive-icon safe zone (central 66%).
foreground = Image.new('RGBA', (1024, 1024))
art = source.crop((255, 160, 1000, 1110)).convert('RGBA')
art = ImageOps.contain(art, (620, 620), Image.Resampling.LANCZOS)
foreground.alpha_composite(art, ((1024-art.width)//2, (1024-art.height)//2))
foreground.save(root / 'assets/android-icon-foreground.png')
Image.new('RGB', (1024, 1024), cream).save(root / 'assets/android-icon-background.png')
mono = Image.new('RGBA', foreground.size)
fp, mp = foreground.load(), mono.load()
assert fp is not None and mp is not None
for y in range(1024):
    for x in range(1024):
        r, g, b, a = cast(tuple[int, int, int, int], fp[x, y])
        if a and max(r, g, b) - min(r, g, b) > 50:
            mp[x, y] = (255, 255, 255, a)
mono.save(root / 'assets/android-icon-monochrome.png')
(root / 'public/icons').mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    icon.resize((size, size), Image.Resampling.LANCZOS).save(root / f'public/icons/icon-{size}.png')
print('Brand icons generated; exterior black removed without altering artwork')
