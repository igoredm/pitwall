"""Gera as imagens do site a partir de docs/screenshots e assets/logo (rodar uma vez quando as capturas mudarem).

    python site/tools/images.py

Precisa do Pillow com WebP. As saídas ficam em site/assets/img e vão para o git.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "site" / "assets" / "img"
FONTS = ROOT / "web" / "node_modules" / "@fontsource"
OUT.mkdir(parents=True, exist_ok=True)


def webp(src: str, dst: str, width: int | None = None, q: int = 82):
    im = Image.open(SHOTS / src).convert("RGB")
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(OUT / dst, "WEBP", quality=q, method=6)


# Pôsteres (aparecem antes do widget ao vivo carregar) e capturas
webp("widget-full-lumen-dark.png", "widget-full.webp")
webp("widget-strip-lumen-dark.png", "widget-strip.webp", 1440)
webp("widget-mini-lumen-dark.png", "widget-mini.webp")
webp("share-card.png", "share-card.webp")
webp("phone-lumen-dark.png", "phone.webp", 600)
webp("settings-monitor.png", "settings-monitor.webp", 1600)

# Logo e ícones
logo = Image.open(ROOT / "assets" / "logo" / "pitwall-512.png").convert("RGBA")
for size, name in [(64, "logo-64.png"), (128, "logo-128.png")]:
    logo.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
site = ROOT / "site"
logo.resize((32, 32), Image.LANCZOS).save(site / "favicon-32.png", optimize=True)
logo.resize((180, 180), Image.LANCZOS).save(site / "apple-touch-icon.png", optimize=True)
logo.resize((512, 512), Image.LANCZOS).save(site / "icon-512.png", optimize=True)
logo.save(site / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# Imagem de compartilhamento 1200×630 (Open Graph / Twitter)
W, H = 1200, 630
og = Image.new("RGB", (W, H), "#080B11")
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((260, 300, 940, 760), fill=(46, 92, 200, 90))
og.paste(glow.filter(ImageFilter.GaussianBlur(110)), (0, 0), glow.filter(ImageFilter.GaussianBlur(110)))
d = ImageDraw.Draw(og)
manrope = lambda w, s: ImageFont.truetype(str(FONTS / "manrope" / "files" / f"manrope-latin-{w}-normal.woff2"), s)
mono = ImageFont.truetype(str(FONTS / "jetbrains-mono" / "files" / "jetbrains-mono-latin-400-normal.woff2"), 20)
og.paste(logo.resize((56, 56), Image.LANCZOS), (64, 56), logo.resize((56, 56), Image.LANCZOS))
d.text((136, 64), "Pitwall", font=manrope(800, 34), fill="#EDF0F5")
d.text((64, 146), "FPS e temperaturas no segundo monitor.", font=manrope(800, 50), fill="#EDF0F5")
d.text((64, 214), "Sem overlay · nada injetado no jogo · grátis e código aberto", font=manrope(500, 24), fill="#A6AEBD")
d.text((W - 64, 74), "github.com/igoredm/pitwall", font=mono, fill="#7D8699", anchor="ra")
wid = Image.open(SHOTS / "widget-full-lumen-dark.png").convert("RGB")
ww = W - 128
wid = wid.resize((ww, round(wid.height * ww / wid.width)), Image.LANCZOS)
frame = Image.new("RGB", (ww + 20, wid.height + 20), "#1A2030")
mask = Image.new("L", frame.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, *frame.size), 18, fill=255)
og.paste(frame, (54, 286), mask)
m2 = Image.new("L", wid.size, 0)
ImageDraw.Draw(m2).rounded_rectangle((0, 0, *wid.size), 10, fill=255)
og.paste(wid, (64, 296), m2)
og.save(OUT / "og.png", optimize=True)
print("ok")
