# -*- coding: utf-8 -*-
"""演示素材生成：用 PIL 生成 CC0（自产）壁纸/表情包/商品图，避免版权风险

用法（在 server 目录下）:
    python scripts/gen_assets.py          # 壁纸 12 + 表情 12 + 商品图 6
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "static")

# 主题色板（莫兰迪系 + 撞色系）
PALETTES = [
    [(83, 74, 183), (238, 237, 254)],      # 紫
    [(15, 110, 86), (225, 245, 238)],      # 绿
    [(24, 95, 165), (230, 241, 251)],      # 蓝
    [(153, 60, 29), (250, 236, 231)],      # 珊瑚
    [(133, 79, 11), (250, 238, 218)],      # 琥珀
    [(76, 21, 40), (251, 234, 240)],       # 酒红
]

WALL_WORDS = ["山川", "湖海", "星辰", "月色", "清风", "竹影", "云野", "空山", "暮雪", "晨雾", "松涛", "溪谷"]
EMOJI_WORDS = ["开心", "加油", "稳住", "冲鸭", "躺平", "绝了", "社恐", "emo", "哈哈", "嗯嗯", "收到", "摸鱼"]


def font(size):
    # Windows 自带字体，中英文都能渲染
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_wallpaper(path, w, h, fg, bg, word):
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    # 几何山丘剪影（多层椭圆弧）
    random.seed(hash(word) % 10000)
    for layer in range(3):
        c = tuple(min(255, int(bg[i] + (fg[i] - bg[i]) * (0.25 + 0.3 * layer))) for i in range(3))
        cy = int(h * (0.78 - layer * 0.12)) + random.randint(-30, 30)
        for k in range(-1, 6):
            r = random.randint(w // 5, w // 3)
            cx = int(k * w / 4 + random.randint(-40, 40))
            d.ellipse([cx - r, cy - r // 2, cx + r, cy + r], fill=c)
    # 月亮/太阳
    d.ellipse([w - 220, 120, w - 100, 240], fill=fg)
    # 竖排词
    f = font(72)
    x = w // 2 - 36
    y = int(h * 0.18)
    for ch in word:
        d.text((x, y), ch, fill=bg if fg[0] + fg[1] + fg[2] > 380 else fg, font=f)
        y += 84
    img.save(path, "JPEG", quality=88)


def make_emoji(path, fg, bg, word):
    img = Image.new("RGB", (480, 480), bg)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([16, 16, 464, 464], radius=60, outline=fg, width=8)
    f = font(110)
    w = d.textlength(word, font=f)
    d.text(((480 - w) / 2, 180), word, fill=fg, font=f)
    img.save(path, "PNG")


def make_goods(path, fg, bg, label, sub):
    img = Image.new("RGB", (800, 800), bg)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 40, 760, 760], radius=48, fill=None, outline=fg, width=10)
    f1, f2 = font(120), font(44)
    w1 = d.textlength(label, font=f1)
    d.text(((800 - w1) / 2, 260), label, fill=fg, font=f1)
    w2 = d.textlength(sub, font=f2)
    d.text(((800 - w2) / 2, 440), sub, fill=fg, font=f2)
    img.save(path, "JPEG", quality=90)


def main():
    random.seed(42)
    wp_dir = os.path.join(BASE, "wallpapers")
    em_dir = os.path.join(BASE, "emoji")
    gd_dir = os.path.join(BASE, "goods")
    for d in (wp_dir, em_dir, gd_dir):
        os.makedirs(d, exist_ok=True)

    for i, word in enumerate(WALL_WORDS):
        fg, bg = PALETTES[i % len(PALETTES)]
        make_wallpaper(os.path.join(wp_dir, "wp_%02d.jpg" % i), 1080, 1920, fg, bg, word)

    for i, word in enumerate(EMOJI_WORDS):
        fg, bg = PALETTES[(i + 2) % len(PALETTES)]
        make_emoji(os.path.join(em_dir, "em_%02d.png" % i), fg, bg, word)

    goods = [("帆布包", "MINI-SUITE"), ("马克杯", "CERAMIC"), ("T恤", "COTTON"), ("贴纸", "STICKER"), ("徽章", "BADGE"), ("笔记本", "NOTEBOOK")]
    for i, (label, sub) in enumerate(goods):
        fg, bg = PALETTES[(i + 4) % len(PALETTES)]
        make_goods(os.path.join(gd_dir, "goods_%02d.jpg" % i), fg, bg, label, sub)

    print("素材生成完成：壁纸 %d / 表情 %d / 商品图 %d" % (len(WALL_WORDS), len(EMOJI_WORDS), len(goods)))


if __name__ == "__main__":
    main()
