#!/usr/bin/env python3
"""
Convert one of the static portal pages into a React page shell.

The secondary pages (orders, profile, wholesale, admin, seller, login) are
mostly static markup with a handful of behaviours hooked on. Rather than
retype several thousand lines of markup and risk drifting from the design, this
lifts the body verbatim, converts it to JSX, and strips the behaviours so they
can be reattached as real React handlers.

What it does NOT do: invent behaviour. Any element that carried behaviour is
left with a marker comment naming the handler it used to call, so the page can
be finished by hand. That keeps the CSS and copy pixel-identical while making
the remaining work visible instead of silently broken.

Usage: python3 tools/html2page.py <source.html> <OutName> [--out src/pages/X.jsx]
"""

import re
import sys
import argparse
from html.parser import HTMLParser

# Attributes that are not valid in JSX as-is.
VOID = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
}


def strip_region(text, start_pat, end_pat):
    """Remove every region between two patterns (inclusive), non-greedy."""
    return re.sub(start_pat + r'.*?' + end_pat, '', text, flags=re.S)


def to_jsx(html: str) -> str:
    """HTML -> JSX. Deliberately conservative: it only rewrites what would not
    parse as JSX, and leaves everything else byte-identical."""
    s = html

    # comments
    s = re.sub(r'<!--(?!\[)(.*?)-->', lambda m: '{/*' + m.group(1).replace('*/', '* /') + '*/}', s, flags=re.S)

    # handle any remaining raw onclick/onchange/etc as data, not code
    s = re.sub(r'\s+on(click|change|submit|input|keydown|keyup|mouseover|mouseenter|mouseleave|focus|blur|load)\s*=\s*"([^"]*)"',
               lambda m: f' data-legacy-{m.group(1)}={{"{m.group(2).replace(chr(34), "&quot;")}"}}'.replace('{{', '{').replace('}}', '}'),
               s)

    # boolean / attribute spellings
    s = s.replace(' class="', ' className="')
    s = s.replace(' for="', ' htmlFor="')
    s = s.replace(' crossorigin>', ' crossOrigin="">')
    s = s.replace(' tabindex="', ' tabIndex="')
    s = s.replace(' readonly', ' readOnly')
    s = s.replace(' autocomplete=', ' autoComplete=')
    s = s.replace(' autofocus', ' autoFocus')
    s = s.replace(' novalidate', ' noValidate')
    s = s.replace(' maxlength=', ' maxLength=')
    s = s.replace(' colspan=', ' colSpan=')
    s = s.replace(' rowspan=', ' rowSpan=')
    s = s.replace(' enctype=', ' encType=')
    s = s.replace(' srcset=', ' srcSet=')
    s = s.replace(' allowfullscreen', ' allowFullScreen')

    # inline style strings -> objects
    def style_obj(m):
        decls = [d.strip() for d in m.group(1).split(';') if d.strip()]
        out = []
        for d in decls:
            if ':' not in d:
                continue
            k, v = d.split(':', 1)
            k = k.strip()
            # custom properties stay quoted; ordinary props become camelCase
            if k.startswith('--'):
                key = f"'{k}'"
            else:
                parts = k.split('-')
                key = parts[0] + ''.join(p.capitalize() for p in parts[1:])
            v = v.strip().replace('"', '&quot;')
            out.append(f"{key}: '{v}'")
        return ' style={{' + ', '.join(out) + '}}'
    s = re.sub(r' style="([^"]*)"', style_obj, s)

    # self-closing voids
    for tag in VOID:
        s = re.sub(rf'<({tag})\b([^<>]*?)(?<!/)>', rf'<\1\2 />', s)

    # entities that JSX accepts but reads oddly
    s = s.replace('&nbsp;', '\u00a0')

    return s


def convert(src_path, out_path, component_name, cut_before=None, cut_after=None):
    raw = open(src_path, encoding='utf-8').read()

    # grab the body
    m = re.search(r'<body[^>]*>(.*)</body>', raw, re.S)
    body = m.group(1) if m else raw

    # drop scripts / styles / the overlay layer, which the app owns once
    body = re.sub(r'<script\b.*?</script>', '', body, flags=re.S)
    body = re.sub(r'<style\b.*?</style>', '', body, flags=re.S)

    # trim the chrome the React shell already renders
    body = strip_region(body, r'<div class="utility-bar"', r'</div>\s*</div>\s*</div>\s*')
    body = strip_region(body, r'<header class="site-header"', r'</header>')
    body = strip_region(body, r'<nav class="section-nav-bar"', r'</nav>')
    body = strip_region(body, r'<footer\b[^>]*>', r'</footer>')
    # overlays: drawers, modals, toasts, compare bar, chat launcher
    body = strip_region(body, r'<div class="drawer-scrim"', r'</aside>\s*</aside>')
    body = strip_region(body, r'<div class="backdrop-overlay"', r'</div>\s*</div>\s*</div>\s*')
    body = strip_region(body, r'<div class="toast-stack"', r'</div>')
    body = strip_region(body, r'<div class="compare-floating-bar"', r'</div>\s*</div>')

    if cut_before:
        i = body.find(cut_before)
        if i > 0:
            body = body[i:]
    if cut_after:
        j = body.find(cut_after)
        if j > 0:
            body = body[:j]

    jsx = to_jsx(body.strip())

    # handlers stripped by to_jsx leave data-legacy-* markers; count them so the
    # console tells the truth about what is still inert
    pending = len(re.findall(r'data-legacy-', jsx))

    out = f"""import React from 'react';
import '../styles/portal.css';

/* ==========================================================================
   {component_name}
   --------------------------------------------------------------------------
   Generated from {src_path.split('/')[-1]} by tools/html2page.py, then
   finished by hand.

   The markup is the original, so the design is exact. Elements that used to
   carry an inline handler still carry a data-legacy-* marker until a React
   handler replaces it — those are the {pending} loose ends left in this file.
   ========================================================================== */

export default function {component_name}() {{
  return (
    <>
{jsx}
    </>
  );
}}
"""
    open(out_path, 'w', encoding='utf-8').write(out)
    return pending


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('name')
    ap.add_argument('--out', default=None)
    ap.add_argument('--cut-before', default=None)
    ap.add_argument('--cut-after', default=None)
    a = ap.parse_args()
    out = a.out or f"src/pages/{a.name}.jsx"
    n = convert(a.src, out, a.name, a.cut_before, a.cut_after)
    print(f"{out}: {n} handlers left inert")
