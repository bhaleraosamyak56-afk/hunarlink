"""Prohibited Content, Contraband & Platform Safety Guardrail (Shared Across ASIGS, AI, Search & B2B).

Hard-blocks weapons, explosives, illegal narcotics/drugs, banned wildlife contraband
(including real Shahtoosh / Tibetan Antelope / Chiru wool prohibited under India's
Wildlife Protection Act, 1972), and severe unlawful content — while carefully using
word-boundary patterns so authentic Kashmiri craft terms (e.g. 'walnut butter knife box',
'poppy floral papier-mache', 'drop-spindle spun wool', 'copper samovar', 'saffron kahwa')
NEVER suffer false positives.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.modules.guardrails.schemas import FieldIssue, GuardrailOutcome


@dataclass(frozen=True)
class ProhibitedContentMatch:
    category: str
    matched_term: str
    rule_code: str
    message: str


_LEET_MAP = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s"})

_PROHIBITED_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "EXPLOSIVES_AND_WEAPONS",
        re.compile(
            r"\b("
            r"bomb|bombs|bomber|bombing|explosive|explosives|ied|rdx|c4|tnt|dynamite|"
            r"grenade|grenades|detonator|gunpowder|molotov|landmine|"
            r"firearm|firearms|handgun|handguns|pistol|pistols|revolver|rifle|rifles|"
            r"shotgun|shotguns|ak[\s\-]?47|ak[\s\-]?56|machine\s*gun|assault\s*rifle|"
            r"ammunition|ammo|bullets|silencer|brass\s*knuckles|switchblade"
            r")\b",
            re.IGNORECASE,
        ),
        "Explosives, weapons, firearms, and ammunition are strictly prohibited on HunarLink.",
    ),
    (
        "ILLEGAL_DRUGS_AND_NARCOTICS",
        re.compile(
            r"\b("
            r"drug|drugs|narcotic|narcotics|cocaine|heroin|meth|methamphetamine|"
            r"fentanyl|lsd|mdma|ecstasy|opium|charas|ganja|hashish|marijuana|"
            r"cannabis|weed|ketamine|smack|brown\s*sugar|contraband|crystal\s*meth|"
            r"amphetamine|morphine|codeine\s*syrup"
            r")\b",
            re.IGNORECASE,
        ),
        "Illegal drugs, narcotics, and controlled substances are strictly prohibited on HunarLink.",
    ),
    (
        "BANNED_WILDLIFE_CONTRABAND",
        re.compile(
            r"\b("
            r"ivory|elephant\s*tusk|rhino\s*horn|tiger\s*skin|leopard\s*skin|"
            r"pangolin\s*scale|chiru\s*wool|tibetan\s*antelope|"
            r"real\s*shahtoosh|pure\s*shahtoosh|original\s*shahtoosh|illegal\s*shahtoosh"
            r")\b",
            re.IGNORECASE,
        ),
        "Trade in banned wildlife products (including ivory and real Shahtoosh/Chiru wool under the Wildlife Protection Act, 1972) is strictly prohibited on HunarLink.",
    ),
    (
        "UNLAWFUL_AND_HARMFUL_CONTENT",
        re.compile(
            r"\b("
            r"terrorist|terrorism|assassinate|hitman|cyanide|ricin|"
            r"fake\s*currency|counterfeit\s*currency|fake\s*notes|"
            r"stolen\s*credit\s*card|ransomware|malware\s*payload|child\s*porn|csam|"
            r"human\s*(?:skin|leather|bone|bones|flesh|organ|organs|remains|tissue|skull|blood)|"
            r"(?:pure|real|genuine|100%?)\s+human"
            r")\b",
            re.IGNORECASE,
        ),
        "Unlawful, violent, fraudulent, or prohibited human-material content is strictly prohibited on HunarLink.",
    ),
]


def _normalize_for_safety(text: str) -> list[str]:
    """Return both original collapsed text and leet/de-spaced forms for resilient detection."""
    collapsed = re.sub(r"\s+", " ", text).strip()
    leet_norm = collapsed.lower().translate(_LEET_MAP)
    # Catch spaced-out single letters like "b o m b" or "d r u g s"
    despaced_singles = re.sub(
        r"\b(?:[a-z]\s+){2,}[a-z]\b",
        lambda m: m.group(0).replace(" ", ""),
        leet_norm,
    )
    variants = [collapsed]
    if leet_norm != collapsed.lower():
        variants.append(leet_norm)
    if despaced_singles not in variants:
        variants.append(despaced_singles)
    return variants


def check_prohibited_content(text: str | None) -> ProhibitedContentMatch | None:
    """Inspect arbitrary seller, buyer, search, or AI text for prohibited contraband terms."""
    if not text or not text.strip():
        return None
    for variant in _normalize_for_safety(text):
        for category, pattern, reason in _PROHIBITED_PATTERNS:
            m = pattern.search(variant)
            if m:
                return ProhibitedContentMatch(
                    category=category,
                    matched_term=m.group(0).lower(),
                    rule_code="PROHIBITED_CONTENT_BLOCKED",
                    message=(
                        f"Blocked by HunarLink Safety Guardrail ({category}): {reason} "
                        "HunarLink exclusively supports authentic Jammu & Kashmir heritage handicrafts."
                    ),
                )
    return None


def validate_no_prohibited_content(field: str, value: str | None) -> list[FieldIssue]:
    """Return a hard BLOCK ASIGS FieldIssue if `value` contains prohibited/contraband terms."""
    match = check_prohibited_content(value)
    if match is None:
        return []
    return [
        FieldIssue(
            field=field,
            rule_code=match.rule_code,
            severity=GuardrailOutcome.BLOCK,
            message=match.message,
        )
    ]
