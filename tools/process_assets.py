"""Post-process codex-generated images in assets/raw into web-ready game assets.

Run from the project root:  python tools/process_assets.py   (needs Pillow + numpy)

- Textures -> 512px JPG "detail maps": per-channel mean normalised to 0.5 so the
  shader can multiply them (x2) onto vertex colours without shifting the palette.
- smoke/fire -> 256px RGBA PNG, alpha keyed from luminance of the black background.
- icons/icons2 -> 2x2 grids on magenta split into transparent PNG icons.
- gauge/ring -> magenta-keyed HUD instrument faces; hud_panel/sign -> HUD frame and plate backgrounds.
- keyart -> 1600px JPG start-screen background.
"""
import os
import numpy as np
from PIL import Image

RAW, OUT = 'assets/raw', 'assets'
TEXTURES = {  # name: (desaturation, contrast)
    'metal': (0.75, 0.9), 'wood': (0.6, 0.9), 'concrete': (0.7, 0.9), 'ground': (0.6, 0.7),
    'gravel': (0.8, 0.9), 'rock': (0.7, 0.9), 'snow': (0.5, 0.8),
    'sand': (0.6, 0.8), 'asphalt': (0.7, 0.9), 'paint': (0.55, 1.0), 'steel': (0.8, 1.0),
}


def load(name):
    return Image.open(os.path.join(RAW, name + '.png')).convert('RGB')


def texture(name, desat, contrast):
    a = np.asarray(load(name).resize((512, 512), Image.LANCZOS), dtype=np.float32) / 255
    lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    a = a * (1 - desat) + lum[..., None] * desat
    a = a * (0.5 / a.reshape(-1, 3).mean(0))           # per-channel mean -> 0.5
    a = 0.5 + (a - 0.5) * contrast
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f'tex_{name}.jpg'), quality=88)


def sprite(name, white):
    img = load(name)
    # Crop to the bright content (square, small margin) so the sprite fills the point.
    lum0 = np.asarray(img, dtype=np.float32).max(-1)
    ys, xs = np.nonzero(lum0 > 20)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 * 1.08
    img = img.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    a = np.asarray(img.resize((256, 256), Image.LANCZOS), dtype=np.float32) / 255
    lum = a.max(-1)
    # Fade the border to zero so point sprites never show a square edge.
    yy, xx = np.mgrid[0:256, 0:256] / 255.0
    r = np.sqrt((xx - 0.5) ** 2 + (yy - 0.5) ** 2)
    alpha = np.clip((lum - 0.04) / 0.6, 0, 1) * np.clip((0.5 - r) / 0.12, 0, 1)
    rgb = np.ones_like(a) if white else np.clip(a / np.maximum(lum[..., None], 1e-3), 0, 1)
    rgba = np.dstack([rgb, alpha])
    Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'sprite_{name}.png'))


def key_magenta(img):
    a = np.asarray(img, dtype=np.float32)
    d = np.sqrt((a[..., 0] - 255) ** 2 + a[..., 1] ** 2 + (a[..., 2] - 255) ** 2)  # distance from magenta
    alpha = np.clip((d - 60) / 60, 0, 1) * 255
    return Image.fromarray(np.dstack([a, alpha]).astype(np.uint8), 'RGBA')


def keyed(name, width, halo=False):
    q = key_magenta(load(name))
    if halo:  # drop the generator's soft glow around the artwork, keep solid pixels
        a = np.asarray(q, dtype=np.float32)
        rgb, al = a[..., :3], a[..., 3]
        lum = rgb.max(-1)
        al = np.where((al < 250) | (lum < 40), 0, al)
        q = Image.fromarray(np.dstack([rgb, al]).astype(np.uint8), 'RGBA')
    q = q.crop(q.getbbox())
    q.resize((width, round(width * q.height / q.width)), Image.LANCZOS).save(os.path.join(OUT, f'hud_{name}.png'))


def keyed_square(name, size):
    q = key_magenta(load(name))
    q = q.crop(q.getbbox())
    s = max(q.size)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(q, ((s - q.width) // 2, (s - q.height) // 2))
    sq.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'hud_{name}.png'))


def icons(raw='icons', names=('fuel', 'parts', 'supplies', 'ammo')):
    img = load(raw)
    w, h = img.size
    rgba = key_magenta(img)
    for i, name in enumerate(names):
        x, y = (i % 2) * w // 2, (i // 2) * h // 2
        q = rgba.crop((x, y, x + w // 2, y + h // 2))
        q = q.crop(q.getbbox() or (0, 0, q.width, q.height))
        s = max(q.size)
        sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        sq.paste(q, ((s - q.width) // 2, (s - q.height) // 2))
        sq.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, f'icon_{name}.png'))


def keyart():
    img = load('keyart')
    img.resize((1600, round(1600 * img.height / img.width)), Image.LANCZOS).save(os.path.join(OUT, 'keyart.jpg'), quality=82)


if __name__ == '__main__':
    for n, (ds, c) in TEXTURES.items():
        if os.path.exists(os.path.join(RAW, n + '.png')):
            texture(n, ds, c); print('texture', n)
    for n, white in (('smoke', True), ('fire', False)):
        if os.path.exists(os.path.join(RAW, n + '.png')):
            sprite(n, white); print('sprite', n)
    if os.path.exists(os.path.join(RAW, 'icons.png')):
        icons(); print('icons')
    if os.path.exists(os.path.join(RAW, 'icons2.png')):
        icons('icons2', ('hull', 'warning', 'target', 'train')); print('icons2')
    for n in ('gauge', 'ring'):
        if os.path.exists(os.path.join(RAW, n + '.png')):
            keyed_square(n, 512); print(n)
    if os.path.exists(os.path.join(RAW, 'hud_panel.png')):
        load('hud_panel').resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'hud_panel.jpg'), quality=90); print('hud_panel')
    if os.path.exists(os.path.join(RAW, 'sign.png')):
        im = load('sign'); im.resize((600, round(600 * im.height / im.width)), Image.LANCZOS).save(os.path.join(OUT, 'hud_sign.jpg'), quality=88); print('sign')
    for n, w in (('marker', 160), ('hpframe', 400), ('logo', 1200)):
        if os.path.exists(os.path.join(RAW, n + '.png')):
            keyed(n, w, halo=(n == 'logo')); print(n)
    if os.path.exists(os.path.join(RAW, 'btn.png')):
        im = load('btn'); im.resize((640, round(640 * im.height / im.width)), Image.LANCZOS).save(os.path.join(OUT, 'hud_btn.jpg'), quality=90); print('btn')
    for n in ('card_steam', 'card_diesel'):
        if os.path.exists(os.path.join(RAW, n + '.png')):
            im = load(n); im.thumbnail((640, 640)); im.save(os.path.join(OUT, n + '.jpg'), quality=85); print(n)
    if os.path.exists(os.path.join(RAW, 'keyart.png')):
        keyart(); print('keyart')
