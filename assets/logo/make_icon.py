"""Gera o ícone do Pitwall (pitwall.ico, favicon.ico e PNGs) desenhando em alta resolução e reduzindo.

Baseado no conceito concept-nano-banana.png (Nano Banana): mostrador de telemetria (arco azul do Lumen → violeta, pontas cortadas
retas), ponteiro afinando até a ponta e a faixa quadriculada da bandeira de chegada na abertura do arco, num tile
escuro com brilho diagonal. Tamanhos <= 24 px usam uma versão simplificada (sem quadriculado e sem brilho, traços
mais grossos) para continuar legível na bandeja.
Uso: python assets/logo/make_icon.py   (requer Pillow)
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "logo")
S = 1024  # canvas de trabalho

BG = (10, 13, 19)
BG_LIGHT = (40, 46, 60)
BLUE = (76, 141, 255)
VIOLET = (139, 92, 246)
WHITE = (246, 247, 251)
CHECKER = (214, 218, 245)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ease(t):
    # Azul domina a maior parte do arco e o violeta entra no último terço, como no gen1, mas sem degrau
    return t * t * (3 - 2 * t)


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def tile(detail: bool) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.2), fill=255)

    base = Image.new("RGBA", (S, S), BG + (255,))
    if detail:
        # Brilho diagonal no canto superior esquerdo: gradiente radial suave cortado por uma diagonal
        gloss = Image.new("L", (S, S), 0)
        gd = ImageDraw.Draw(gloss)
        for i in range(60, 0, -1):
            t = i / 60
            rr = S * 0.95 * t
            gd.ellipse([-rr * 0.55, -rr * 0.55, rr, rr], fill=round(70 * (1 - t) ** 1.6))
        cut = Image.new("L", (S, S), 0)
        ImageDraw.Draw(cut).polygon([(0, 0), (S * 0.64, 0), (S * 0.46, S * 0.55), (0, S * 0.62)], fill=255)
        cut = cut.filter(ImageFilter.GaussianBlur(S * 0.006))
        gloss = Image.composite(gloss, Image.new("L", (S, S), 0), cut)
        base = Image.composite(Image.new("RGBA", (S, S), BG_LIGHT + (255,)), base, gloss)
    img.paste(base, (0, 0), mask)

    cx, cy = S / 2, S * 0.5
    r_out = S * (0.36 if detail else 0.40)
    w = S * (0.095 if detail else 0.14)
    r_in = r_out - w
    start, end = 135, 405  # graus (0 = 3h, sentido horário): 270° abertos embaixo, pontas cortadas no raio

    arc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arc)
    steps = 540
    for i in range(steps):
        a0 = start + (end - start) * i / steps
        a1 = start + (end - start) * min(i + 1.5, steps) / steps
        col = lerp(BLUE, VIOLET, ease(i / steps)) + (255,)
        ad.polygon([polar(cx, cy, r_out, a0), polar(cx, cy, r_out, a1),
                    polar(cx, cy, r_in, a1), polar(cx, cy, r_in, a0)], fill=col)
    if detail:
        glow = arc.filter(ImageFilter.GaussianBlur(S * 0.03))
        glow.putalpha(glow.getchannel("A").point(lambda v: round(v * 0.35)))
        img.alpha_composite(glow)
    img.alpha_composite(arc)

    d = ImageDraw.Draw(img)
    # Ponteiro afinando até a ponta (2 h), com cubo redondo no centro
    ang = -38
    length = r_in * (0.88 if detail else 0.92)
    base_w = S * (0.034 if detail else 0.06)
    tip = polar(cx, cy, length, ang)
    l = polar(cx, cy, base_w, ang - 90)
    rgt = polar(cx, cy, base_w, ang + 90)
    tip_l = polar(*tip, S * 0.006, ang - 90)
    tip_r = polar(*tip, S * 0.006, ang + 90)
    d.polygon([l, tip_l, tip_r, rgt], fill=WHITE + (255,))
    hub = S * (0.05 if detail else 0.075)
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=WHITE + (255,))

    # Quadriculado em degrau (2 linhas, só os quadrados claros) na abertura do arco
    if detail:
        q = S * 0.05
        cols = 5
        x0 = cx - cols * q / 2
        y0 = cy + r_out * 0.70
        for row in range(2):
            for col in range(cols):
                if (row + col) % 2 == 0:
                    d.rectangle([x0 + col * q, y0 + row * q, x0 + (col + 1) * q - 1, y0 + (row + 1) * q - 1],
                                fill=CHECKER + (255,))

    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (S, S), 0), mask))
    return img


def main():
    big, small = tile(True), tile(False)
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [(small if s <= 24 else big).resize((s, s), Image.LANCZOS) for s in sizes]
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "pitwall-512.png"))
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "pitwall-256.png"))

    # Prévia dos tamanhos sobre fundo claro e escuro (barra de tarefas nos dois temas)
    w = sum(sizes) + 10 * len(sizes)
    preview = Image.new("RGBA", (w, 520), (240, 240, 240, 255))
    ImageDraw.Draw(preview).rectangle([0, 260, w, 520], fill=(32, 32, 32, 255))
    x = 0
    for s, f in zip(sizes, frames):
        preview.alpha_composite(f, (x, 256 - s))
        preview.alpha_composite(f, (x, 264))
        x += s + 10
    preview.save(os.path.join(OUT, "preview-sizes.png"))

    for target in (os.path.join(ROOT, "src", "Pitwall", "pitwall.ico"), os.path.join(ROOT, "web", "public", "favicon.ico")):
        frames[-1].save(target, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    print("ok")


if __name__ == "__main__":
    main()
