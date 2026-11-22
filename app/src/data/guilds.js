/* The five heritage craft clusters shown on the storefront, and the filters
   used by the marketplace. Copy is lifted from the static guild bento grid;
   the trailing "Discover Looms →" in the rug card was part of the original
   description text, so it is kept. */

/* ==========================================================================
   The guild taxonomy
   --------------------------------------------------------------------------
   A guild is a *craft family*: one material, one workshop tradition. Before
   this file was rewritten the storefront had five "guilds", two of which were
   not guilds at all — "Kani Jamawar & Sozni" filed a weave and an embroidery
   technique as if they were separate product families, alongside a pashmina
   guild whose own name also said "Kani". A visitor could pick "Kani" from the
   filter list and get zero results, because no product was ever filed under it.

   The fix is one axis, not two:

     guild      the family a piece belongs to  (pashmina, walnut, …)
     technique  how a pashmina piece was made  (handwoven, kani, sozni)

   Kani and Sozni are techniques applied to a pashmina base, so they now live
   inside the pashmina guild as a second filter. Walnut, papier-mâché and silk
   rugs are material-defined and carry no technique.
   ========================================================================== */

export const GUILDS = [
  {
    id: 'pashmina',
    label: 'Pashmina Textiles',
    short: 'Pashmina',
    blurb: 'Hand-spun Ladakhi Changthangi fleece on wooden pit looms.',
    techniques: ['handwoven', 'kani', 'sozni']
  },
  {
    id: 'walnut',
    label: 'Walnut Woodcarving',
    short: 'Walnut Wood',
    blurb: 'Seasoned walnut timber, hand-chiselled Chinar and Pinjrakari relief.',
    techniques: []
  },
  {
    id: 'papier-mache',
    label: 'Papier-M\u00e2ch\u00e9 Art',
    short: 'Papier-M\u00e2ch\u00e9',
    blurb: 'Sakhta pulp vessels illuminated with Hazara and Guldan naqashi.',
    techniques: []
  },
  {
    id: 'silk-rugs',
    label: 'Silk-on-Silk Rugs',
    short: 'Silk Rugs',
    blurb: 'Hand-knotted mulberry silk carpets from Srinagar and Budgam.',
    techniques: []
  }
];

/* The techniques that can appear inside the pashmina guild. Kept separate from
   GUILDS because they are not filterable on their own — a technique filter
   only makes sense once a guild is chosen, otherwise it mixes a Kani shawl
   with a walnut box that has no weave at all. */
export const TECHNIQUES = [
  {
    id: 'handwoven',
    label: 'Handwoven',
    blurb: 'Plain hand-loomed pashmina, no figuring.'
  },
  {
    id: 'kani',
    label: 'Kani',
    blurb: 'Wooden-bobbin tapestry weave worked from Talim code. The slowest, and the Kani name.'
  },
  {
    id: 'sozni',
    label: 'Sozni',
    blurb: 'Fine single-needle embroidery, mirrored front and reverse.'
  }
];

/* Filter chips for the marketplace toolbar. `id` matches a guild above. */
export const CRAFT_FILTERS = GUILDS.map((g) => ({ id: g.id, label: g.short }));

/* Sort options. */
export const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'rating', label: 'Top Rated' },
  { id: 'loom', label: 'Loom Hours' }
];

/* Price bands. */
export const PRICE_BANDS = [
  { id: 'all', label: 'Any Price', min: 0, max: Infinity },
  { id: 'u5', label: 'Under \u20b95,000', min: 0, max: 5000 },
  { id: '5-15', label: '\u20b95,000 \u2013 \u20b915,000', min: 5000, max: 15000 },
  { id: '15-50', label: '\u20b915,000 \u2013 \u20b950,000', min: 15000, max: 50000 },
  { id: '50p', label: '\u20b950,000 +', min: 50000, max: Infinity }
];

/* Look-ups used by the product page and the crumbs. */
export const guildById = (id) => GUILDS.find((g) => g.id === id) || null;
export const techniqueById = (id) => TECHNIQUES.find((t) => t.id === id) || null;

/* The label printed on a product card and crumb. Falls back to the family name
   if a record is missing its technique, so a partial record cannot crash a
   render. */
export const CRAFT_ORDER = ['pashmina', 'walnut', 'papier-mache', 'silk-rugs'];

export function describeCraft(guildId, techniqueId) {
  const guild = guildById(guildId);
  const tech = techniqueById(techniqueId);
  if (!guild) return 'Valley Craft';
  if (!tech) return guild.label;
  return `${guild.label.replace(/ (Shawls|Textiles)$/, '')} \u00b7 ${tech.label}`;
}
