/* ==========================================================================
   Client-side Mirror of HunarLink Prohibited Content & Safety Guardrail
   --------------------------------------------------------------------------
   Provides instant buyer feedback on search & GI lookup while the backend
   (ASIGS Layer 2, CraftProof AI, Demand Bridge, Search & HunarSathi) enforces
   the authoritative server-side hard block and MySQL audit trail.
   ========================================================================== */

const PROHIBITED_RULES = [
  {
    category: 'EXPLOSIVES_AND_WEAPONS',
    regex:
      /\b(bomb|bombs|bomber|bombing|explosive|explosives|ied|rdx|c4|tnt|dynamite|grenade|grenades|detonator|gunpowder|molotov|landmine|firearm|firearms|handgun|handguns|pistol|pistols|revolver|rifle|rifles|shotgun|shotguns|ak[\s-]?47|ak[\s-]?56|machine\s*gun|assault\s*rifle|ammunition|ammo|bullets|silencer|brass\s*knuckles|switchblade)\b/i,
    reason: 'Explosives, weapons, firearms, and ammunition are strictly prohibited on HunarLink.'
  },
  {
    category: 'ILLEGAL_DRUGS_AND_NARCOTICS',
    regex:
      /\b(drug|drugs|narcotic|narcotics|cocaine|heroin|meth|methamphetamine|fentanyl|lsd|mdma|ecstasy|opium|charas|ganja|hashish|marijuana|cannabis|weed|ketamine|smack|brown\s*sugar|contraband|crystal\s*meth|amphetamine|morphine|codeine\s*syrup)\b/i,
    reason: 'Illegal drugs, narcotics, and controlled substances are strictly prohibited on HunarLink.'
  },
  {
    category: 'BANNED_WILDLIFE_CONTRABAND',
    regex:
      /\b(ivory|elephant\s*tusk|rhino\s*horn|tiger\s*skin|leopard\s*skin|pangolin\s*scale|chiru\s*wool|tibetan\s*antelope|real\s*shahtoosh|pure\s*shahtoosh|original\s*shahtoosh|illegal\s*shahtoosh)\b/i,
    reason:
      'Banned wildlife contraband (including ivory and real Shahtoosh/Chiru wool under the Wildlife Protection Act, 1972) is strictly prohibited on HunarLink.'
  },
  {
    category: 'UNLAWFUL_AND_HARMFUL_CONTENT',
    regex:
      /\b(terrorist|terrorism|assassinate|hitman|cyanide|ricin|fake\s*currency|counterfeit\s*currency|fake\s*notes|stolen\s*credit\s*card|ransomware|malware\s*payload|child\s*porn|csam)\b/i,
    reason: 'Unlawful, violent, or fraudulent items are strictly prohibited on HunarLink.'
  }
];

function normalizeVariants(raw) {
  const collapsed = String(raw || '').replace(/\s+/g, ' ').trim();
  const leet = collapsed
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
  const despaced = leet.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (m) => m.replace(/\s+/g, ''));
  return [collapsed, leet, despaced];
}

export function checkProhibitedQuery(text) {
  if (!text || !String(text).trim()) return null;
  const variants = normalizeVariants(text);
  for (const v of variants) {
    for (const rule of PROHIBITED_RULES) {
      const m = v.match(rule.regex);
      if (m) {
        return {
          category: rule.category,
          matchedTerm: m[0].toLowerCase(),
          message: `Blocked by Safety Guardrail: ${rule.reason} HunarLink exclusively supports authentic Jammu & Kashmir heritage handicrafts.`
        };
      }
    }
  }
  return null;
}
