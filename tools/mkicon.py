# ساخت آیکن بازی «دویدن تا برج» — PNG با پایتون خالص (بدون کتابخانهٔ بیرونی)
# اجرا: python3 tools/mkicon.py   →  games/borj/icons/icon-{192,512}.png
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'games', 'borj', 'icons')
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rrect(x, y, w, h, r, W, H):
    # فاصلهٔ علامت‌دار از مستطیل گوشه‌گرد
    dx = max(x + r - (x + w / 2), 0, abs(x + w / 2 - x) - (w / 2 - r))
    cx = min(max(x, x), x + w)
    return True


def make(size):
    W = H = size
    px = bytearray(W * H * 4)
    sky0, sky1 = (0x1B, 0x23, 0x40), (0x0E, 0x12, 0x20)
    ground_top = (0x4F, 0x9C, 0x47)
    ground = (0x5A, 0x46, 0x32)
    tower = (0xA4, 0x44, 0x4A)
    tower_d = (0x6D, 0x2A, 0x30)
    body = (0x2F, 0x7D, 0x5D)
    skin = (0xF0, 0xC6, 0x9C)
    gold = (0xFF, 0xD7, 0x5E)
    gold_d = (0x8A, 0x6A, 0x12)
    corner = int(size * 0.16)
    gy = int(size * 0.80)  # خط زمین (بالای زمین)

    def in_rrect(x, y, rx, ry, rw, rh, r):
        if x < rx or x >= rx + rw or y < ry or y >= ry + rh:
            return False
        cx = min(max(x, rx + r), rx + rw - r)
        cy = min(max(y, ry + r), ry + rh - r)
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r or (rx + r <= x < rx + rw - r) or (ry + r <= y < ry + rh - r)

    for y in range(H):
        for x in range(W):
            i = (y * W + x) * 4
            # پس‌زمینهٔ آسمان با گوشه‌های گرد
            t = y / (H - 1)
            col = lerp(sky0, sky1, t * t)
            a = 255
            # گوشه‌های گرد
            cx = min(max(x, corner), W - 1 - corner)
            cy = min(max(y, corner), H - 1 - corner)
            if (x - cx) ** 2 + (y - cy) ** 2 > corner * corner:
                a = 0
            # ستاره‌ها
            for (sx, sy, sr) in [
                (0.16, 0.14, 0.012),
                (0.30, 0.09, 0.009),
                (0.12, 0.28, 0.008),
                (0.78, 0.18, 0.011),
                (0.62, 0.07, 0.008),
                (0.88, 0.30, 0.009),
            ]:
                if (x - sx * W) ** 2 + (y - sy * H) ** 2 < (sr * W) ** 2:
                    col = (255, 255, 255)
            # ماه
            mx, my, mr = 0.83 * W, 0.16 * H, 0.075 * W
            if (x - mx) ** 2 + (y - my) ** 2 < mr * mr:
                col = (246, 241, 213)
            # زمین
            if y >= gy:
                col = ground_top if y < gy + max(2, size * 0.012) else ground
                if y >= gy + size * 0.02 and ((x * 7 + y * 13) % 97) < 12:
                    col = lerp(ground, (0, 0, 0), 0.25)
            # تپه‌های دور
            hy = 0.62 + 0.05 * math.sin(x / (W * 0.09))
            if y > hy * H and y < gy:
                col = lerp(col, (0x3B, 0x44, 0x70), 0.55)
            # برج
            tx0, tx1 = int(0.60 * W), int(0.79 * W)
            ty0, ty1 = int(0.33 * H), gy
            if tx0 <= x < tx1 and ty0 <= y < ty1:
                col = tower if x < tx0 + (tx1 - tx0) * 0.72 else tower_d
                # کنگره‌های نوک برج
                if y < ty0 + size * 0.055:
                    step = (x - tx0) / max(1, (tx1 - tx0) / 5)
                    if step % 2 < 1:
                        col = sky1 if y < ty0 else col
            # پنجرهٔ برج
            wx0, wx1 = tx0 + int((tx1 - tx0) * 0.3), tx0 + int((tx1 - tx0) * 0.7)
            wy0, wy1 = ty0 + int(size * 0.10), ty0 + int(size * 0.20)
            if wx0 <= x < wx1 and wy0 <= y < wy1:
                col = gold
            # پرچم
            fx, fy = tx0 + (tx1 - tx0) * 0.5, ty0 - size * 0.04
            if 0 < (y - fy) < size * 0.05 and 0 < (x - fx) < size * 0.10 * (1 - (y - fy) / (size * 0.05)):
                col = gold
            # دونده
            bx0, bx1 = int(0.20 * W), int(0.36 * W)
            by0, by1 = int(0.56 * H), gy
            if bx0 <= x < bx1 and by0 <= y < by1:
                col = body
            hx, hy2, hr = (bx0 + bx1) / 2, by0 - size * 0.055, size * 0.062
            if (x - hx) ** 2 + (y - hy2) ** 2 < hr * hr and y < gy:
                col = skin
            # سکه
            ccx, ccy, ccr = 0.45 * W, 0.62 * H, 0.062 * W
            d = math.hypot(x - ccx, y - ccy)
            if d < ccr:
                col = gold if d < ccr * 0.72 else gold_d
            px[i : i + 3] = bytes(col)
            px[i + 3] = a
    return bytes(px)


def png(w, h, raw):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    stride = w * 4
    rows = b''.join(b'\x00' + raw[y * stride : (y + 1) * stride] for y in range(h))
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(rows, 9))
        + chunk(b'IEND', b'')
    )


for size in (192, 512):
    data = png(size, size, make(size))
    with open(os.path.join(OUT, f'icon-{size}.png'), 'wb') as f:
        f.write(data)
    print(f'icon-{size}.png', len(data), 'بایت')
