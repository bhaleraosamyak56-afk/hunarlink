#!/usr/bin/env python3
"""
HunarLink — generate the missing craft imagery.

Produces on-brand JPGs for every path referenced by the site, so nothing 404s.
Each craft guild gets its own palette + motif:

  pashmina/kani  — Kani paisley (boteh) buta on warm ivory / deep saffron
  silk rugs      — medallion field with border guards
  walnut         — Chinar leaf + pinjrakari lattice on deep walnut brown
  papier-mache   — Guldan floral on lacquer ground
  sozni          — fine nakshi vine with gold thread

Run:  python3 tools/generate_assets.py
"""
import os, math, random
import cairosvg

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")

# ── palettes ────────────────────────────────────────────────────────────────
PALETTES = {
    "pashmina":      dict(bg="#FBF7EF", deep="#9C4A2A", mid="#E8D9C3", light="#CFA97A", accent="#B9884B"),
    "kani":          dict(bg="#FAF5EA", deep="#8E4A28", mid="#EADCCA", light="#D3B183", accent="#B08A4A"),
    "silk":          dict(bg="#F6F1E7", deep="#2C4055", mid="#DCD3C2", light="#BFAE8E", accent="#9E8A5C"),
    "walnut":        dict(bg="#F7F2E9", deep="#3A2718", mid="#E4D8C4", light="#A98B66", accent="#8E7042"),
    "papier":        dict(bg="#F8F4EC", deep="#2A3A4A", mid="#E2DACB", light="#AF9C7C", accent="#94804F"),
    "sozni":         dict(bg="#FBF6EE", deep="#7A3324", mid="#EBDCC9", light="#CBA97E", accent="#B08F52"),
    "neutral":       dict(bg="#F7F4EC", deep="#22382E", mid="#DFDACB", light="#B9AE95", accent="#8E7C50"),
}

# ── motifs ──────────────────────────────────────────────────────────────────
def paisley(cx, cy, s, fill, stroke, sw=2.0, rot=0):
    """A boteh / paisley teardrop."""
    return (f'<g transform="translate({cx},{cy}) rotate({rot}) scale({s})">'
            f'<path d="M0,60 C-42,60 -60,20 -60,-10 C-60,-46 -26,-70 4,-70 '
            f'C40,-70 62,-44 62,-8 C62,26 42,44 24,60 C16,67 8,60 0,60 Z" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
            f'<path d="M0,40 C-26,40 -38,16 -38,-8 C-38,-32 -16,-46 2,-46 C26,-46 40,-30 40,-8 '
            f'C40,14 26,26 14,40" fill="none" stroke="{stroke}" stroke-width="{sw*0.7}"/>'
            f'<circle cx="0" cy="-6" r="{7}" fill="{stroke}" opacity="0.75"/>'
            f'</g>')

def medallion(cx, cy, r, p, sw=2.4):
    """Rug medallion: layered lobed rosette."""
    parts = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{p["light"]}" stroke-width="{sw}"/>']
    for i in range(16):
        a = 2 * math.pi * i / 16
        x, y = cx + r * 0.82 * math.cos(a), cy + r * 0.82 * math.sin(a)
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*0.075:.1f}" fill="{p["accent"]}" opacity="0.85"/>')
    parts.append(f'<path d="M{cx-r*0.5},{cy} Q{cx},{cy-r*0.62} {cx+r*0.5},{cy} Q{cx},{cy+r*0.62} {cx-r*0.5},{cy} Z" '
                 f'fill="{p["mid"]}" stroke="{p["light"]}" stroke-width="{sw*0.6}"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.16}" fill="{p["accent"]}"/>')
    return "".join(parts)

def chinar_leaf(cx, cy, s, fill, stroke, sw=2.0, rot=0):
    """Chinar (plane tree) leaf: 7 rounded lobes on a shared centre + stem."""
    parts = []
    lobes = 5
    for i in range(lobes):
        # fan the lobes across a 200° arc, centred upward
        a = math.radians(-200 + (220 / (lobes - 1)) * i)
        dist = 0.80 if i % 2 == 0 else 0.58           # alternate long/short lobes
        lx, ly = math.cos(a) * 70 * dist, math.sin(a) * 70 * dist
        rx = 30 if i % 2 == 0 else 22
        parts.append(f'<ellipse cx="{lx:.1f}" cy="{ly:.1f}" rx="{rx}" ry="{rx*0.82:.1f}" '
                     f'transform="rotate({math.degrees(a)+90:.1f} {lx:.1f} {ly:.1f})" '
                     f'fill="{fill or "none"}" stroke="{stroke}" stroke-width="{sw}"/>')
    # stem
    parts.append(f'<path d="M0,4 L0,34" stroke="{stroke}" stroke-width="{sw*1.4}" stroke-linecap="round"/>')
    parts.append(f'<circle cx="0" cy="0" r="6" fill="{stroke}" opacity="0.9"/>')
    return f'<g transform="translate({cx},{cy}) rotate({rot}) scale({s})">{"".join(parts)}</g>'

def lattice(w, h, step, stroke, opacity=0.5, sw=1.4):
    """Pinjrakari-style diagonal lattice."""
    out = [f'<g stroke="{stroke}" stroke-width="{sw}" opacity="{opacity}" fill="none">']
    for x in range(-h, w + h, step):
        out.append(f'<path d="M{x},0 L{x+h},{h}"/>')
        out.append(f'<path d="M{x},{h} L{x+h},0"/>')
    out.append("</g>")
    return "".join(out)

def floral(cx, cy, r, p, petals=8):
    """Guldan rosette."""
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r*0.22}" fill="{p["accent"]}"/>']
    for i in range(petals):
        a = 2 * math.pi * i / petals
        px, py = cx + r * 0.55 * math.cos(a), cy + r * 0.55 * math.sin(a)
        out.append(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="{r*0.3:.1f}" ry="{r*0.17:.1f}" '
                   f'transform="rotate({math.degrees(a):.0f} {px:.1f} {py:.1f})" '
                   f'fill="{p["light"]}" opacity="0.9"/>')
    return "".join(out)

def vine(w, h, stroke, opacity=0.45, sw=1.6, amp=18, period=90):
    out = [f'<g stroke="{stroke}" stroke-width="{sw}" fill="none" opacity="{opacity}">']
    for k, y0 in enumerate((h * 0.32, h * 0.68)):
        pts = []
        for x in range(-20, w + 40, 10):
            pts.append(f"{x},{y0 + amp * math.sin(2 * math.pi * x / period + k):.1f}")
        out.append(f'<polyline points="{" ".join(pts)}"/>')
        for i, x in enumerate(range(0, w + 40, period // 2)):
            yy = y0 + amp * math.sin(2 * math.pi * x / period + k)
            out.append(f'<circle cx="{x}" cy="{yy:.1f}" r="3.6" fill="{stroke}" opacity="0.8"/>')
    out.append("</g>")
    return "".join(out)

def frame(w, h, p, inset=26):
    """Rug border guards."""
    return (f'<rect x="{inset}" y="{inset}" width="{w-2*inset}" height="{h-2*inset}" '
            f'fill="none" stroke="{p["light"]}" stroke-width="3" opacity="0.8"/>'
            f'<rect x="{inset+12}" y="{inset+12}" width="{w-2*inset-24}" height="{h-2*inset-24}" '
            f'fill="none" stroke="{p["accent"]}" stroke-width="1.2" opacity="0.65"/>')

def grad(w, h, p, a=1.0):
    """Warm ivory ground with a very soft corner vignette — reads as fabric on paper."""
    return (f'<defs>'
            f'<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0%" stop-color="{p["bg"]}"/>'
            f'<stop offset="60%" stop-color="{p["bg"]}"/>'
            f'<stop offset="100%" stop-color="{p["mid"]}" stop-opacity="0.55"/>'
            f'</linearGradient>'
            f'<radialGradient id="v" cx="50%" cy="46%" r="72%">'
            f'<stop offset="60%" stop-color="#000" stop-opacity="0"/>'
            f'<stop offset="100%" stop-color="#000" stop-opacity="0.07"/>'
            f'</radialGradient>'
            f'</defs>'
            f'<rect width="{w}" height="{h}" fill="url(#g)"/>')

def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}">{body}</svg>')

# ── guild renderers ─────────────────────────────────────────────────────────
def render(kind, w, h, seed=0):
    """Sparse, low-contrast craft texture — a textile photographed on ivory paper."""
    rnd = random.Random(seed)
    p = PALETTES.get(kind, PALETTES["neutral"])
    b = [grad(w, h, p)]
    unit = min(w, h)

    if kind in ("pashmina", "kani", "sozni"):
        # fine vine ground
        b.append(vine(w, h, p["light"], 0.3, 1.3, amp=14, period=110))
        # a few boteh, generously spaced — layout varies per item so the
        # catalogue grid doesn't look like one repeated photo
        cols = rnd.choice([2, 3, 3, 4])
        rows = rnd.choice([2, 2, 3])
        skip = rnd.choice([(1, 2), (0, 1), (2, 1), (2,)])
        for r in range(rows):
            for c in range(cols):
                if (r + c) % 3 == skip[r % len(skip)] % 3:
                    continue
                cx = w * (c + 0.5) / cols + rnd.uniform(-w*0.04, w*0.04)
                cy = h * (r + 0.5) / rows + rnd.uniform(-h*0.05, h*0.05)
                b.append(paisley(cx, cy, unit / 470 * rnd.uniform(0.8, 1.35), "none",
                                 p["deep"], sw=2.2, rot=rnd.uniform(-22, 22)))
                b.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{unit*0.012:.1f}" '
                         f'fill="{p["accent"]}" opacity="0.85"/>')
        if kind == "sozni":
            b.append(vine(w, h * 0.55, p["accent"], 0.3, 1.5, amp=9, period=74))

    elif kind == "silk":
        b.append(frame(w, h, p))
        b.append(lattice(w, h, 78, p["light"], 0.1, 0.9))
        b.append(medallion(w / 2, h / 2, unit * 0.28, p, sw=3.0))
        for (mx, my) in ((w*0.14, h*0.15), (w*0.86, h*0.15), (w*0.14, h*0.85), (w*0.86, h*0.85)):
            b.append(medallion(mx, my, unit * 0.085, p, sw=1.2))

    elif kind == "walnut":
        # carved panel: deep lattice, a single large chinar leaf
        b.append(lattice(w, h, 84, p["deep"], 0.07, 1.2))
        b.append(chinar_leaf(w * 0.5, h * 0.54, unit / 520, "none", p["deep"], sw=3.0))
        b.append(chinar_leaf(w * 0.5, h * 0.54, unit / 1000, "none", p["accent"], sw=1.6))
        b.append(f'<rect x="20" y="20" width="{w-40}" height="{h-40}" fill="none" '
                 f'stroke="{p["light"]}" stroke-width="1.4" opacity="0.5"/>')

    elif kind == "papier":
        b.append(lattice(w, h, 74, p["light"], 0.06))
        b.append(floral(w*0.5, h*0.5, unit*0.27, p))
        for (fx, fy, fr) in ((w*0.19, h*0.21, unit*0.09), (w*0.81, h*0.23, unit*0.085),
                             (w*0.23, h*0.80, unit*0.08), (w*0.79, h*0.79, unit*0.095)):
            b.append(floral(fx, fy, fr, p))

    else:  # neutral — artisan / certificate cards
        b.append(lattice(w, h, 90, p["light"], 0.07))
        b.append(f'<circle cx="{w/2}" cy="{h*0.40}" r="{unit*0.13}" fill="{p["light"]}" opacity="0.55"/>')
        b.append(f'<path d="M{w*0.5-unit*0.21},{h*0.92} Q{w/2},{h*0.56} {w*0.5+unit*0.21},{h*0.92} Z" '
                 f'fill="{p["mid"]}" opacity="0.8"/>')
        b.append(f'<rect x="16" y="16" width="{w-32}" height="{h-32}" fill="none" '
                 f'stroke="{p["accent"]}" stroke-width="1.4" opacity="0.4"/>')

    # soft vignette on top
    b.append(f'<rect width="{w}" height="{h}" fill="url(#v)"/>')
    return svg(w, h, "".join(b))

# ── what the site actually asks for ─────────────────────────────────────────
# kind, width, height
JOBS = {}
def add(path, kind, w, h, seed=0):
    JOBS[path] = (kind, w, h, seed)

# hero + guild bento cards
for i, (k, w, h) in enumerate([
    ("pashmina", 1200, 620), ("kani", 900, 620), ("walnut", 900, 520),
    ("papier", 900, 520), ("silk", 900, 620), ("sozni", 900, 520),
], start=1):
    add(f"image_{i}.jpg", k, w, h, seed=i)

# product photography — mirror exactly what the catalogue references
GUILD_FILES = {
    "pashmina": ("pashmina", 20),
    "walnut":   ("walnut", 20),
    "papier":   ("papier", 20),
    "silkrug":  ("silk", 20),
    "sozni":    ("sozni", 20),
    "kani":     ("kani", 20),
}
for prefix, (kind, count) in GUILD_FILES.items():
    for i in range(1, count + 1):
        add(f"products/{prefix}_{i:02d}.jpg", kind, 800, 800, seed=(hash(prefix) + i * 37) % 9999)

# PDP thumbnails
for name, kind in [("thumb_artisan", "neutral"), ("thumb_cert", "neutral"),
                   ("thumb_detail", "sozni"), ("thumb_workshop", "neutral")]:
    add(f"products/{name}.jpg", kind, 420, 420, seed=hash(name) % 9999)

# auth illustration
add("auth/forgot_illustration.png", "sozni", 640, 480, seed=77)


def main():
    made = 0
    for rel, (kind, w, h, seed) in JOBS.items():
        dest = os.path.normpath(os.path.join(OUT, rel))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = render(kind, w, h, seed).encode()
        if dest.endswith(".png"):
            cairosvg.svg2png(bytestring=data, write_to=dest, output_width=w, output_height=h)
        else:
            # cairosvg has no JPEG writer — rasterise to PNG then convert with Pillow
            import io
            from PIL import Image
            buf = io.BytesIO()
            cairosvg.svg2png(bytestring=data, write_to=buf, output_width=w, output_height=h)
            buf.seek(0)
            Image.open(buf).convert("RGB").save(dest, "JPEG", quality=88, optimize=True)
        made += 1
    print(f"generated {made} images into assets/")


if __name__ == "__main__":
    main()
