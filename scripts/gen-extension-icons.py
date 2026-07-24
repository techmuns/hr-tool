#!/usr/bin/env python3
"""Generate simple flat PNG icons for the Chrome extension.

No image libraries required — writes minimal RGBA PNGs by hand.
Draws a rounded indigo square with a white clock glyph (ring + two hands).
Run: python3 scripts/gen-extension-icons.py
"""
import struct
import zlib
import math
import os

BG = (79, 70, 229, 255)      # indigo-600
FG = (255, 255, 255, 255)    # white
TRANSPARENT = (0, 0, 0, 0)


def blend(dst, src):
    a = src[3] / 255
    return tuple(round(src[i] * a + dst[i] * (1 - a)) for i in range(3)) + (255,)


def make_icon(size):
    px = [[TRANSPARENT for _ in range(size)] for _ in range(size)]
    radius = size * 0.22
    cx = cy = (size - 1) / 2

    # rounded-rect background
    for y in range(size):
        for x in range(size):
            inset = radius
            dx = max(inset - x, x - (size - 1 - inset), 0)
            dy = max(inset - y, y - (size - 1 - inset), 0)
            if math.hypot(dx, dy) <= inset:
                px[y][x] = BG

    ring_r = size * 0.30
    ring_w = max(size * 0.06, 1.0)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy)
            if abs(d - ring_r) <= ring_w / 2 and px[y][x] == BG:
                px[y][x] = FG

    # clock hands
    def draw_line(angle_deg, length, width):
        ang = math.radians(angle_deg)
        ex = cx + math.sin(ang) * length
        ey = cy - math.cos(ang) * length
        steps = int(length * 3) + 1
        for i in range(steps + 1):
            t = i / steps
            hx = cx + (ex - cx) * t
            hy = cy + (ey - cy) * t
            r = int(width) + 1
            for oy in range(-r, r + 1):
                for ox in range(-r, r + 1):
                    if math.hypot(ox, oy) <= width / 2:
                        xx, yy = int(round(hx + ox)), int(round(hy + oy))
                        if 0 <= xx < size and 0 <= yy < size and px[yy][xx] == BG:
                            px[yy][xx] = FG

    draw_line(0, ring_r * 0.55, max(size * 0.05, 1))    # hour hand up
    draw_line(105, ring_r * 0.75, max(size * 0.05, 1))  # minute hand

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(px[y][x])
    return png_bytes(size, size, bytes(raw))


def png_bytes(w, h, raw):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")
    os.makedirs(out, exist_ok=True)
    for s in (16, 48, 128):
        with open(os.path.join(out, f"icon{s}.png"), "wb") as f:
            f.write(make_icon(s))
        print(f"wrote icon{s}.png")
