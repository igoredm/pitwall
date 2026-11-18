"""Imagens do instalador (Inno Setup 6.7+), geradas a partir da logo (assets/logo/pitwall-512.png).
- wizard-*.png: painel lateral das telas de boas-vindas e de conclusão (pôster com logo e nome)
- wizard-small-*.png: ícone do cabeçalho das demais telas
- back.png: fundo da janela inteira (traço de telemetria bem discreto no rodapé)
Uso: python installer/art/make_art.py   (requer Pillow)"""
import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LOGO = Image.open(os.path.join(ROOT, "assets", "logo", "pitwall-512.png")).convert("RGBA")
FONT = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "segoeuib.ttf")
BG = (10, 13, 19)
BLUE = (76, 141, 255)
VIOLET = (139, 92, 246)
CHECK = (46, 51, 66)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def trace(d, W, y0, amp, width, alpha_img=None):
    """Linha de frametime estilizada (picos pequenos e um grande), gradiente azul → violeta."""
    pts = []
    n = 220
    for i in range(n + 1):
        x = W * i / n
        t = i / n
        y = y0 + math.sin(t * 19) * amp * 0.18 + math.sin(t * 7.3 + 1) * amp * 0.25
        if 0.58 < t < 0.62:
            y -= amp * (1 - abs(t - 0.6) / 0.02)  # o pico
        pts.append((x, y))
    for i in range(n):
        d.line([pts[i], pts[i + 1]], fill=lerp(BLUE, VIOLET, i / n) + (255,), width=width)


def side(w, h):
    s = 4
    W, H = w * s, h * s
    im = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(im)
    size = int(W * 0.62)
    logo = LOGO.resize((size, size), Image.LANCZOS)
    top = int(H * 0.22)
    im.alpha_composite(logo, ((W - size) // 2, top))
    font = ImageFont.truetype(FONT, int(W * 0.17))
    text = "Pitwall"
    tw = d.textlength(text, font=font)
    d.text(((W - tw) / 2, top + size + H * 0.04), text, font=font, fill=(244, 246, 250, 255))
    # Traço de telemetria e quadriculado no rodapé
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    trace(ImageDraw.Draw(layer), W, H * 0.86, H * 0.05, max(2, s * 2))
    layer.putalpha(layer.getchannel("A").point(lambda v: v * 0.55))
    im.alpha_composite(layer)
    q = W // 14
    y0 = H - q * 2
    for row in range(2):
        for col in range(14):
            if (row + col) % 2 == 0:
                d.rectangle([col * q, y0 + row * q, (col + 1) * q - 1, y0 + (row + 1) * q - 1], fill=CHECK + (255,))
    return im.convert("RGB").resize((w, h), Image.LANCZOS)


def back(w, h):
    s = 2
    W, H = w * s, h * s
    im = Image.new("RGBA", (W, H), BG + (255,))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    trace(ImageDraw.Draw(layer), W, H * 0.80, H * 0.06, 3 * s)
    soft = layer.filter(ImageFilter.GaussianBlur(6 * s))
    soft.putalpha(soft.getchannel("A").point(lambda v: v * 0.25))
    layer.putalpha(layer.getchannel("A").point(lambda v: v * 0.22))
    im.alpha_composite(soft)
    im.alpha_composite(layer)
    return im.convert("RGB").resize((w, h), Image.LANCZOS)


for pct in (100, 125, 150, 200):
    k = pct / 100
    side(round(164 * k), round(314 * k)).save(os.path.join(HERE, f"wizard-{pct}.png"))
    LOGO.resize((round(55 * k), round(55 * k)), Image.LANCZOS).save(os.path.join(HERE, f"wizard-small-{pct}.png"))
back(1300, 1000).save(os.path.join(HERE, "back.png"))
print("ok")
