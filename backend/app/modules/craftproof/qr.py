"""Pure-Python QR code rendering for HunarLink CraftProof Passports (via `segno`)."""
from __future__ import annotations

import io
import segno


def generate_passport_qr_svg(passport_url: str, scale: int = 6) -> bytes:
    """Render a crisp, high-contrast SVG QR code pointing to a public Craft Passport."""
    qr = segno.make(passport_url, error="m")
    buf = io.BytesIO()
    qr.save(
        buf,
        kind="svg",
        scale=scale,
        border=2,
        dark="#14382A",
        light="#FFFDF8",
        xmldecl=False,
        svgclass="craftproof-qr-svg",
    )
    return buf.getvalue()
