#!/usr/bin/env python3
"""Generate crisp HD responsive WebP variants for every storefront & portal image.

    python3 tools/make_variants.py            # generate all HD WebP variants
    python3 tools/make_variants.py --check    # report missing variants only
    python3 tools/make_variants.py --prune    # also delete stale/orphaned variants

Why
---
Previously, variants were capped at [400, 800] / [520, 1040] / [420, 840] at
quality=78 with a 1.05x minimum ratio, which dropped the high-res tier for 60+
portrait product and hero images — forcing modern browsers into tiny 400px or
520px q=78 WebPs even on Retina desktop displays and PDP zoom lenses.

What it writes
--------------
For every source JPEG under public/, it writes:
  1. A crisp Lanczos-downscaled responsive thumbnail tier (640w for cards/hero/
     portraits, 960w for full-bleed portal banners) when the source is wider, AND
  2. A full-resolution native HD WebP tier (up to 1920px wide, 1:1 native pixels
     with zero resampling blur) encoded at quality=88, method=6, sharp-yuv=true
     to preserve micro-detail in Kashmiri weaves, embroidery threads, and wood
     carving without chroma bleeding.

It also regenerates src/data/imageVariants.js with srcSetFor() and hdSrcFor()
so components never hardcode variant widths or request missing files.
"""
import argparse
import concurrent.futures
import glob
import json
import os
import shutil
import subprocess
import sys

HAS_IMAGEMAGICK = bool(shutil.which("convert") and shutil.which("identify"))
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

if not HAS_IMAGEMAGICK and not HAS_PIL:
    sys.exit("ImageMagick (convert/identify) or Pillow is required.")

PUBLIC = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public"))
MANIFEST = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "src", "data", "imageVariants.js"))

# (directory relative to public/, [downscaled thumbnail widths], skip filenames)
TARGETS = [
    ("assets/products", [640], set()),
    ("assets", [640], set()),
    ("img/artisans", [640], set()),
    ("img", [960], {"artisan-loom-source.jpg"}),
]

QUALITY_HD = 88
QUALITY_THUMB = 86
METHOD = 6
MAX_HD_WIDTH = 1920
MIN_RATIO = 1.08


def image_width(path):
    if HAS_IMAGEMAGICK:
        out = subprocess.check_output(["identify", "-format", "%w", path], text=True)
        return int(out.strip())
    with Image.open(path) as im:
        return im.width


def variants_for(path, thumb_widths):
    """Return sorted responsive widths including the full native HD width."""
    actual = image_width(path)
    hd_width = min(actual, MAX_HD_WIDTH)
    widths = [w for w in thumb_widths if actual >= w * MIN_RATIO and w < hd_width]
    if hd_width not in widths:
        widths.append(hd_width)
    return sorted(set(widths)), actual


def make(src, width, actual):
    stem = os.path.splitext(os.path.basename(src))[0]
    out = os.path.join(os.path.dirname(src), f"{stem}-{width}.webp")
    if CHECK_ONLY:
        return out

    is_native = width >= actual
    quality = QUALITY_HD if is_native else QUALITY_THUMB

    if HAS_IMAGEMAGICK:
        cmd = ["convert", src, "-colorspace", "sRGB"]
        if not is_native:
            cmd += [
                "-filter", "Lanczos",
                "-resize", f"{width}x",
                "-unsharp", "0x0.5+0.4+0.02",
            ]
        cmd += [
            "-strip",
            "-quality", str(quality),
            "-define", f"webp:method={METHOD}",
            "-define", "webp:sharp-yuv=true",
            out,
        ]
        subprocess.check_call(cmd)
    else:
        with Image.open(src) as im:
            im = im.convert("RGB")
            if not is_native:
                h = round(im.height * width / im.width)
                im = im.resize((width, h), Image.LANCZOS)
            im.save(out, "WEBP", quality=quality, method=METHOD)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report, do not write")
    parser.add_argument("--prune", action="store_true", help="delete orphaned variants")
    args = parser.parse_args()

    global CHECK_ONLY
    CHECK_ONLY = args.check

    manifest = {}
    jobs = []
    skipped = 0

    for reldir, thumb_widths, skip_names in TARGETS:
        for src in sorted(glob.glob(os.path.join(PUBLIC, reldir, "*.jpg"))):
            base = os.path.basename(src)
            if base in skip_names:
                continue
            reldir_key = reldir.replace(os.sep, "/")
            key = f"{reldir_key}/{base}"
            available, actual = variants_for(src, thumb_widths)
            if not available:
                continue
            manifest[key] = available
            for w in available:
                jobs.append((src, w, actual))

    if args.check:
        for src, w, actual in jobs:
            out = make(src, w, actual)
            if not os.path.exists(out):
                print(f"  MISSING  {os.path.relpath(out, PUBLIC)}")
                skipped += 1
        made = 0
    else:
        workers = min(8, os.cpu_count() or 4)
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(make, src, w, actual) for src, w, actual in jobs]
            for fut in concurrent.futures.as_completed(futs):
                fut.result()
        made = len(jobs)

    if args.prune:
        valid = {f"{os.path.splitext(k)[0]}-{w}.webp" for k, ws in manifest.items() for w in ws}
        removed = 0
        for reldir, _, _ in TARGETS:
            for f in glob.glob(os.path.join(PUBLIC, reldir, "*-*.webp")):
                name = f"{reldir.replace(os.sep, '/')}/{os.path.basename(f)}"
                _, _, tail = os.path.basename(f).rpartition("-")
                if not tail.replace(".webp", "").isdigit():
                    continue
                if name not in valid:
                    if not args.check:
                        os.remove(f)
                    removed += 1
        print(f"pruned {removed} stale WebP variants")

    if not args.check:
        write_manifest(manifest)

    print(
        f"{'would write' if args.check else 'wrote'} {made} HD WebP variants "
        f"for {len(manifest)} source images"
        + (f", {skipped} missing" if args.check else "")
    )
    return 1 if (args.check and skipped) else 0


def write_manifest(manifest):
    lines = [
        "/* ==========================================================================",
        "   imageVariants",
        "   --------------------------------------------------------------------------",
        "   Generated by tools/make_variants.py — do not edit by hand.",
        "",
        "   A manifest of every HD WebP width actually present on disk for each source",
        "   image. Every entry includes a full-resolution native HD WebP tier (q=88,",
        "   sharp-yuv) plus a responsive thumbnail tier when wider than the threshold.",
        "   ========================================================================== */",
        "",
        "const VARIANTS = {",
    ]
    for key in sorted(manifest):
        lines.append(f"  '{key}': {json.dumps(manifest[key])},")
    lines += [
        "};",
        "",
        "/* All widths available for a path, or [] when there are none. */",
        "export function widthsFor(path) {",
        "  return VARIANTS[path] || [];",
        "}",
        "",
        "/* Resolve against Vite's BASE_URL so nested routes keep the deployment prefix. */",
        "const BASE = (import.meta.env.BASE_URL || '/').replace(/\\/$/, '');",
        "",
        "/* A ready-to-use srcSet string, or null when the path has no variants. */",
        "export function srcSetFor(path) {",
        "  const widths = VARIANTS[path];",
        "  if (!widths || !widths.length) return null;",
        "  const stem = path.replace(/\\.(jpe?g|png)$/i, '');",
        "  return widths.map((w) => `${BASE}/${stem}-${w}.webp ${w}w`).join(', ');",
        "}",
        "",
        "/* Highest-resolution HD WebP URL for full-resolution views (zoom magnifier,",
        "   hero backdrops, portal banners), falling back to the source file. */",
        "export function hdSrcFor(path) {",
        "  if (!path) return '';",
        "  const widths = VARIANTS[path];",
        "  if (!widths || !widths.length) return `${BASE}/${path}`;",
        "  const maxW = widths[widths.length - 1];",
        "  const stem = path.replace(/\\.(jpe?g|png)$/i, '');",
        "  return `${BASE}/${stem}-${maxW}.webp`;",
        "}",
        "",
        "export default VARIANTS;",
    ]
    with open(MANIFEST, "w") as fh:
        fh.write("\n".join(lines) + "\n")


CHECK_ONLY = False

if __name__ == "__main__":
    sys.exit(main())
