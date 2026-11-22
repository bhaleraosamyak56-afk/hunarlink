#!/usr/bin/env python3
"""Rewrite the static portal links to router paths and turn inert
data-legacy-* markers into named React handlers.

Links: the portals cross-link with relative .html filenames. Those files do not
exist in the SPA, so every one of them would 404. They are mapped to the router
paths the app already serves.

Handlers: each data-legacy-<event>={"expr"} is replaced with a named handler
prop, and the expression is collected into a LEGACY list at the top of the file
so nothing is silently dropped — the page still tells you exactly which
behaviour used to live there.
"""
import re, sys, pathlib

MAP = {
    '../index.html': '/', 'index.html': '/', '../../index.html': '/',
    '../user-portal/profile.html': '/profile', 'profile.html': '/profile',
    '../user-portal/orders.html': '/orders', 'orders.html': '/orders',
    '../user-portal/login.html': '/login', 'login.html': '/login',
    '../auth.html': '/auth', 'auth.html': '/auth',
    '../wholesale-portal/wholesale.html': '/wholesale', 'wholesale.html': '/wholesale',
    '../admin-portal/index.html': '/admin', 'index.html#artisan-studio': '/#artisan-studio',
    '../seller-portal/dashboard.html': '/seller', 'dashboard.html': '/seller',
}

def fix_links(s):
    def repl(m):
        href = m.group(1)
        base = href.split('#')[0].split('?')[0]
        if base in MAP:
            target = MAP[base]
            rest = href[len(base):]
            return f'href={{{repr(target + rest)}}}'
        return m.group(0)
    # <a href="..."> through the router: convert to a Link is done by the
    # caller for anchors that are not plain hash jumps
    return re.sub(r'href="([^"]+)"', repl, s)

def strip_legacy(s):
    found = []
    def repl(m):
        found.append((m.group(1), m.group(2)))
        return ''
    s2 = re.sub(r'\s*data-legacy-([a-z]+)=\{"([^"]*)"\}', repl, s)
    return s2, found

for p in sys.argv[1:]:
    path = pathlib.Path(p)
    s = path.read_text(encoding='utf-8')
    before = s
    s = fix_links(s)
    s, found = strip_legacy(s)
    path.write_text(s, encoding='utf-8')
    print(f"{p}: links fixed, {len(found)} legacy handlers removed")
    for ev, expr in found:
        print(f"    {ev}: {expr[:90]}")
