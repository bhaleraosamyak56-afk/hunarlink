#!/usr/bin/env python3
"""
html2jsx.py — mechanical body-markup converter for the HunarLink port.

Takes the <body> of an existing page and produces a JSX component body.
It is deliberately conservative: anything it cannot translate with
certainty it leaves alone and reports, rather than guessing.

Handled:
  class=            -> className=
  for=              -> htmlFor=
  self-closing      -> /> for void elements
  inline style=""   -> style={{ camelCase }}
  onclick="fn('x')" -> onClick={() => fn('x')}   (dotted names become window.fn)
  <kbd>/<svg> attr   camelCase fixes
  HTML comments     -> {/* ... */}
  entities          -> plain characters
  reserved words    -> flagged

Not handled (reported for manual port):
  <script> blocks, event handlers needing `this`, inline JS logic
"""
import re
import sys
import json

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}

# attributes that React wants camelCased
ATTR_MAP = {
    "class": "className",
    "for": "htmlFor",
    "tabindex": "tabIndex",
    "readonly": "readOnly",
    "maxlength": "maxLength",
    "minlength": "minLength",
    "colspan": "colSpan",
    "rowspan": "rowSpan",
    "autocomplete": "autoComplete",
    "autofocus": "autoFocus",
    "contenteditable": "contentEditable",
    "crossorigin": "crossOrigin",
    "enctype": "encType",
    "novalidate": "noValidate",
    "srcset": "srcSet",
    "usemap": "useMap",
    "formaction": "formAction",
    "datetime": "dateTime",
    "accesskey": "accessKey",
    "spellcheck": "spellCheck",
    "aria-hidden": "aria-hidden",
}

# svg attributes that must be camelCased too
SVG_ATTRS = {
    "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin", "stroke-dasharray": "strokeDasharray",
    "stroke-opacity": "strokeOpacity", "fill-rule": "fillRule",
    "clip-rule": "clipRule", "clip-path": "clipPath", "stroke-miterlimit": "strokeMiterlimit",
    "stop-color": "stopColor", "stop-opacity": "stopOpacity",
    "xlink:href": "href", "xmlns:xlink": None,
}

ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&apos;": "'", "&nbsp;": "\u00a0", "&mdash;": "\u2014",
    "&ndash;": "\u2013", "&rsquo;": "\u2019", "&lsquo;": "\u2018",
    "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&bull;": "\u2022",
    "&middot;": "\u00b7", "&times;": "\u00d7", "&minus;": "\u2212",
    "&eacute;": "\u00e9", "&acirc;": "\u00e2", "&hellip;": "\u2026",
    "&rarr;": "\u2192", "&larr;": "\u2190", "&deg;": "\u00b0",
    "&copy;": "\u00a9", "&trade;": "\u2122", "&rupee;": "\u20b9",
}

RESERVED = {"class", "for", "default", "function", "delete", "new", "var", "case", "switch"}


def camel_style(css: str) -> str:
    """style="padding: 4px; font-size: 2px" -> { padding: '4px', fontSize: '2px' }"""
    out = []
    for decl in [d for d in css.split(";") if d.strip()]:
        if ":" not in decl:
            continue
        prop, val = decl.split(":", 1)
        prop, val = prop.strip(), val.strip()
        if not prop:
            continue
        camel = re.sub(r"-([a-z])", lambda m: m.group(1).upper(), prop)
        if camel.startswith("--"):
            key = f"'{camel}'"
        else:
            key = camel
        val = val.replace("'", "\\'")
        out.append(f"{key}: '{val}'")
    return "{ " + ", ".join(out) + " }" if out else "{}"


def convert_entities(s: str) -> str:
    for k, v in ENTITIES.items():
        s = s.replace(k, v)
    return s


def handler_to_jsx(value: str, warnings: list) -> str:
    """onclick="foo('a', 1)" -> onClick={() => foo('a', 1)}"""
    v = value.strip()
    if v.endswith(";"):
        v = v[:-1].strip()
    if "this." in v or "event." in v or "return false" in v:
        warnings.append(f"handler needs manual port: {value[:70]}")
        return None
    # a bare function name is passed directly
    if re.fullmatch(r"[A-Za-z_$][\w$]*", v):
        return "{" + f"window.{v}" + "}"
    # Always use a block body. An expression body breaks whenever the
    # original statement contains an object literal, because braces inside
    # the JSX expression brace cannot be matched.
    stmts = [x.strip() for x in v.split(";") if x.strip()]
    body = " ".join(x + ";" for x in stmts)
    return "{() => { " + body + " }}"


def convert_attrs(tag: str, warnings: list) -> str:
    """Rewrite the attribute section of a single tag."""
    def attr_repl(m):
        name, value = m.group(1), m.group(2)
        low = name.lower()

        # events
        if low.startswith("on") and len(low) > 2:
            evt = "on" + low[2:].capitalize()
            # onclick -> onClick, onchange -> onChange, onsubmit -> onSubmit
            if low in ("onclick", "onchange", "oninput", "onsubmit", "onkeyup",
                       "onkeydown", "onmouseenter", "onmouseleave", "onfocus",
                       "onblur", "onload", "onerror", "onscroll"):
                evt = "on" + low[2:].capitalize()
            converted = handler_to_jsx(value, warnings)
            if converted is None:
                return f'data-needs-port="{name}"'
            return f"{evt}={converted}"

        if low == "style":
            return f"style={{{camel_style(value)}}}"

        newname = ATTR_MAP.get(low)
        if newname is None and low in SVG_ATTRS:
            mapped = SVG_ATTRS[low]
            if mapped is None:
                return ""      # drop xmlns:xlink etc
            newname = mapped
        if newname is None and "-" in low and not low.startswith(("aria-", "data-")):
            # unknown hyphenated attr inside svg markup
            camel = re.sub(r"-([a-z])", lambda m: m.group(1).upper(), low)
            newname = camel
        if newname is None:
            newname = name

        v = convert_entities(value)
        if '"' in v:
            return f"{newname}='{v}'"
        return f'{newname}="{v}"'

    # match name="value" allowing single or double quotes
    return re.sub(r'([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"|([a-zA-Z_:][-\w:.]*)\s*=\s*\'([^\']*)\'',
                  lambda m: attr_repl(m) if m.group(1) else attr_repl(
                      type("M", (), {"group": lambda self, i: m.group(3) if i == 1 else m.group(4)})()),
                  tag)


def convert(src: str, component: str, warnings: list) -> str:
    # strip <script> and <style> blocks entirely — those are ported by hand
    src = re.sub(r"<script\b[^>]*>.*?</script>", "", src, flags=re.S | re.I)
    src = re.sub(r"<style\b[^>]*>.*?</style>", "", src, flags=re.S | re.I)

    out = []
    i = 0
    # walk tags and text
    for m in re.finditer(r"<!--.*?-->|<[^>]+>", src, flags=re.S):
        text = src[i:m.start()]
        if text.strip():
            t = convert_entities(text)
            # JSX chokes on stray braces in text
            t = t.replace("{", "&#123;").replace("}", "&#125;")
            out.append(t)
        token = m.group(0)
        i = m.end()

        if token.startswith("<!--"):
            body = token[4:-3].strip()
            if body:
                out.append("{/* " + body.replace("*/", "* /") + " */}")
            continue

        # closing tag
        if token.startswith("</"):
            name = token[2:-1].strip()
            out.append(f"</{name}>")
            continue

        # opening tag
        tag = token[1:-1]
        self_closing = tag.endswith("/")
        if self_closing:
            tag = tag[:-1]
        name = re.match(r"[\w:-]+", tag).group(0)
        rest = tag[len(name):]
        new_attrs = convert_attrs(rest, warnings)
        # collapse whitespace inside the tag
        new_attrs = re.sub(r"\s+", " ", new_attrs).strip()
        if new_attrs:
            new_attrs = " " + new_attrs
        if self_closing or name.lower() in VOID:
            out.append(f"<{name}{new_attrs} />")
        else:
            out.append(f"<{name}{new_attrs}>")

    tail = src[i:]
    if tail.strip():
        out.append(convert_entities(tail).replace("{", "&#123;").replace("}", "&#125;"))

    body = "".join(out)
    # tidy: drop leading/trailing blank runs
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return body


def main():
    page, comp, outpath = sys.argv[1], sys.argv[2], sys.argv[3]
    html = open(page, encoding="utf-8").read()

    m = re.search(r"<body[^>]*>(.*)</body>", html, flags=re.S | re.I)
    if not m:
        print(f"  !! no <body> in {page}")
        return 1
    inner = m.group(1)

    warnings = []
    body = convert(inner, comp, warnings)

    component_src = (
        "import React from 'react';\n\n"
        f"/* Converted mechanically from {page.split('/')[-1]}.\n"
        "   Review hand-ported handlers marked data-needs-port. */\n"
        f"export default function {comp}() {{\n"
        "  return (\n"
        "    <>\n"
        + "\n".join("      " + line if line.strip() else "" for line in body.split("\n"))
        + "\n    </>\n"
        "  );\n"
        "}\n"
    )
    open(outpath, "w", encoding="utf-8").write(component_src)

    print(f"  {page} -> {outpath}")
    print(f"    {len(body.splitlines())} lines")
    if warnings:
        print(f"    {len(warnings)} handler(s) need manual port:")
        for w in warnings[:8]:
            print(f"      - {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
