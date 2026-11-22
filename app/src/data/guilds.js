/* The five heritage craft clusters shown on the storefront, and the filters
   used by the marketplace. Copy is lifted from the static guild bento grid;
   the trailing "Discover Looms →" in the rug card was part of the original
   description text, so it is kept. */

export const GUILD_CARDS = [
  {
    id: 'pashmina',
    img: 'image_1.jpg',
    alt: 'Pashmina and Kani Shawls Guild',
    span2: true,
    topTag: 'GI Registry #46 & #51 \u2022 840+ Looms',
    kicker: 'Ladakhi Changthangi Fleece',
    title: 'Pashmina & Kani Shawls',
    desc:
      'Hand-spun sub-16-micron mountain cashmere woven on wooden foot looms with traditional Talim notation.'
  },
  {
    id: 'silk-rugs',
    img: 'image_5.jpg',
    alt: 'Silk-on-Silk Rugs Guild',
    topTag: 'Up to 900 Knots / Sq.In',
    kicker: 'Talim-Coded Medallion Carpets',
    title: 'Silk-on-Silk Rugs',
    desc:
      'Hand-knotted mulberry silk carpets from Srinagar & Budgam looms. Discover Looms \u2192'
  },
  {
    id: 'walnut',
    img: 'image_3.jpg',
    alt: 'Walnut Woodcarving Guild',
    topTag: 'GI Registered Craft',
    kicker: 'Anantnag & Srinagar Tarkhans',
    title: 'Walnut Woodcarving',
    desc:
      'Seasoned 300-year-old walnut timber hand-chiseled with deep Chinar and Pinjrakari lattice relief.'
  },
  {
    id: 'papier-mache',
    img: 'image_4.jpg',
    alt: 'Papier-Mache Art Guild',
    topTag: '24K Gold Leaf Naqash',
    kicker: 'Zadibal & Budgam Workshops',
    title: 'Papier-M\u00e2ch\u00e9 Art',
    desc:
      'Hand-molded Sakhta pulp vessels illuminated with fine Hazara floral and Persian Guldan motifs.'
  },
  {
    id: 'sozni',
    img: 'image_2.jpg',
    alt: 'Kani Jamawar and Sozni Guild',
    topTag: 'Heirloom Needle & Bobbin',
    kicker: 'Kanihama & Old Srinagar',
    title: 'Kani Jamawar & Sozni',
    desc:
      'Intricate wooden-bobbin Jamawar weaves and single-thread Sozni embroidery where reverse mirrors front.'
  }
];

/* Filters for the marketplace toolbar. `chip` is the label as printed; the
   count is computed live from the catalogue. */
export const CRAFT_FILTERS = [
  { id: 'all', label: 'All Crafts' },
  { id: 'pashmina', label: 'Pashmina' },
  { id: 'kani', label: 'Kani' },
  { id: 'sozni', label: 'Sozni' },
  { id: 'silk-rugs', label: 'Silk Rugs' },
  { id: 'walnut', label: 'Walnut Wood' },
  { id: 'papier-mache', label: 'Papier-M\u00e2ch\u00e9' }
];

export const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'rating', label: 'Top Rated' },
  { id: 'loom', label: 'Loom Hours' }
];

export const PRICE_BANDS = [
  { id: 'all', label: 'Any Price', min: 0, max: Infinity },
  { id: 'u5', label: 'Under \u20b95,000', min: 0, max: 5000 },
  { id: '5-15', label: '\u20b95,000 \u2013 \u20b915,000', min: 5000, max: 15000 },
  { id: '15-50', label: '\u20b915,000 \u2013 \u20b950,000', min: 15000, max: 50000 },
  { id: '50p', label: '\u20b950,000 +', min: 50000, max: Infinity }
];
