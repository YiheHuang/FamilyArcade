#!/usr/bin/env python3
"""Generate the Blokus app icon (branding/icon.png, 1024x1024).

Design: warm paper tile with a rounded X-pentomino (5 squares: plus shape).
Center square in ink, arms in the four muted player colors.
Run:  python branding/make_icon.py
Then: npx tauri icon branding/icon.png
"""

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
OUT = Path(__file__).parent / "icon.png"

PAPER = (250, 247, 242, 255)
INK = (31, 29, 26, 255)
C1 = (78, 110, 158, 255)   # dusty blue
C2 = (201, 162, 75, 255)   # ochre
C3 = (176, 96, 74, 255)    # terracotta
C4 = (111, 146, 115, 255)  # sage

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# paper tile
tile_margin = 72
d.rounded_rectangle(
    [tile_margin, tile_margin, SIZE - tile_margin, SIZE - tile_margin],
    radius=200,
    fill=PAPER,
    outline=(227, 220, 209, 255),
    width=6,
)

# X pentomino (plus shape): cells at (dx, dy) in [-1,0,1]
cell = 208
gap = 26
step = cell + gap
cx = cy = SIZE // 2

cells = {
    (0, -1): C1,  # top
    (1, 0): C2,   # right
    (0, 1): C3,   # bottom
    (-1, 0): C4,  # left
    (0, 0): INK,  # center
}

for (dx, dy), color in cells.items():
    x = cx + dx * step - cell // 2
    y = cy + dy * step - cell // 2
    d.rounded_rectangle([x, y, x + cell, y + cell], radius=44, fill=color)

img.save(OUT)
print(f"wrote {OUT} ({SIZE}x{SIZE})")
