"""Imagens do instalador (Inno Setup): painel lateral das telas de boas-vindas/fim e ícone do cabeçalho.
Geradas a partir da logo (assets/logo/pitwall-512.png). Uso: python installer/art/make_art.py (requer Pillow)."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LOGO = Image.open(os.path.join(ROOT, "assets", "logo", "pitwall-512.png")).convert("RGBA")
BG = (10, 13, 19)
BG2 = (17, 21, 30)
CHECK = (52, 57, 74)  # quadriculado discreto: textura, não destaque


def side(w, h):
    s = 4  # desenha em 4x e reduz (bordas limpas)
    W, H = w * s, h * s
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # Gradiente vertical bem discreto (sem brilho), só para dar profundidade
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(round(BG2[i] + (BG[i] - BG2[i]) * t) for i in range(3)))
    # Logo centralizada no terço de cima
    size = int(W * 0.56)
    logo = LOGO.resize((size, size), Image.LANCZOS)
    im.paste(logo, ((W - size) // 2, int(H * 0.2)), logo)
    # Faixa quadriculada (bandeira de chegada) no rodapé
    q = W // 14
    y0 = H - q * 2
    for row in range(2):
        for col in range(14):
            if (row + col) % 2 == 0:
                d.rectangle([col * q, y0 + row * q, (col + 1) * q - 1, y0 + (row + 1) * q - 1], fill=CHECK)
    # Linha fina separando o painel do conteúdo
    d.rectangle([W - s, 0, W, H], fill=(35, 39, 46))
    return im.resize((w, h), Image.LANCZOS)


def small(n):
    return LOGO.resize((n, n), Image.LANCZOS)


# Tamanhos base do estilo "modern" (164x314 e 55x55) em 100/125/150/200% de DPI
for pct in (100, 125, 150, 200):
    k = pct / 100
    side(round(164 * k), round(314 * k)).save(os.path.join(HERE, f"wizard-{pct}.png"))
    small(round(55 * k)).save(os.path.join(HERE, f"wizard-small-{pct}.png"))
print("ok")
