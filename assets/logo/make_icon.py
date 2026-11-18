"""Gera o ícone do Pitwall (pitwall.ico, favicon.ico e PNGs) desenhando em alta resolução e reduzindo.

Conceito: o mostrador (arco de telemetria, azul do Lumen → violeta) + a faixa quadriculada da bandeira de chegada,
num tile arredondado escuro. Tamanhos <= 24 px omitem o quadriculado para continuar legível.
Uso: python assets/logo/make_icon.py   (requer Pillow)
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "logo")
S = 1024  # canvas de trabalho

BG_TOP = (22, 28, 44)
BG_BOTTOM = (8, 10, 16)
BLUE = (76, 141, 255)
VIOLET = (139, 92, 246)
WHITE = (244, 246, 250)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tile(detail: bool) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Tile arredondado com gradiente vertical sutil
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(BG_TOP, BG_BOTTOM, y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
    img.paste(grad, (0, 0), mask)

    cx, cy = S / 2, S * 0.53
    r = S * 0.33
    w = S * (0.115 if detail else 0.15)
    start, end = 135, 405  # graus (PIL: 0 = 3h, sentido horário) → arco de 270° aberto embaixo

    # Arco com gradiente: segmentos curtos de cor interpolada
    arc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arc)
    steps = 270
    box = [cx - r, cy - r, cx + r, cy + r]
    for i in range(steps):
        a0 = start + (end - start) * i / steps
        a1 = start + (end - start) * (i + 1.6) / steps
        ad.arc(box, a0, a1, fill=lerp(BLUE, VIOLET, i / steps) + (255,), width=int(w))
    # Pontas arredondadas
    for ang, col in ((start, BLUE), (end, VIOLET)):
        px = cx + (r - w / 2) * math.cos(math.radians(ang))
        py = cy + (r - w / 2) * math.sin(math.radians(ang))
        ad.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=col + (255,))

    # Brilho suave atrás do arco
    glow = arc.filter(ImageFilter.GaussianBlur(S * 0.035))
    glow.putalpha(glow.getchannel("A").point(lambda v: v * 0.45))
    img.alpha_composite(glow)
    img.alpha_composite(arc)

    # Ponteiro (2 h) com cubo central
    d = ImageDraw.Draw(img)
    ang = math.radians(-45)
    length = r * 0.72
    nw = S * (0.06 if detail else 0.085)
    tip = (cx + length * math.cos(ang), cy + length * math.sin(ang))
    d.line([(cx, cy), tip], fill=WHITE + (255,), width=int(nw))
    for p in ((cx, cy), tip):
        d.ellipse([p[0] - nw / 2, p[1] - nw / 2, p[0] + nw / 2, p[1] + nw / 2], fill=WHITE + (255,))
    hub = S * (0.055 if detail else 0.07)
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=WHITE + (255,))

    # Quadriculado (bandeira) na abertura inferior do arco
    if detail:
        cols, rows = 6, 2
        q = S * 0.052
        x0 = cx - cols * q / 2
        y0 = cy + r * 0.62
        for row in range(rows):
            for col in range(cols):
                if (row + col) % 2 == 0:
                    d.rectangle([x0 + col * q, y0 + row * q, x0 + (col + 1) * q - 1, y0 + (row + 1) * q - 1],
                                fill=WHITE + (255,))
                else:
                    d.rectangle([x0 + col * q, y0 + row * q, x0 + (col + 1) * q - 1, y0 + (row + 1) * q - 1],
                                fill=(60, 66, 82, 255))

    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (S, S), 0), mask))
    return img


def main():
    big, small = tile(True), tile(False)
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [(small if s <= 24 else big).resize((s, s), Image.LANCZOS) for s in sizes]
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "pitwall-512.png"))
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "pitwall-256.png"))

    # Prévia lado a lado dos tamanhos pequenos (para conferir legibilidade)
    preview = Image.new("RGBA", (sum(sizes) + 10 * len(sizes), 256), (240, 240, 240, 255))
    x = 0
    for s, f in zip(sizes, frames):
        preview.alpha_composite(f, (x, 256 - s))
        x += s + 10
    preview.save(os.path.join(OUT, "preview-sizes.png"))

    for target in (os.path.join(ROOT, "src", "Pitwall", "pitwall.ico"), os.path.join(ROOT, "web", "public", "favicon.ico")):
        frames[-1].save(target, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    print("ok")


if __name__ == "__main__":
    main()
