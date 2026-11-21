
/* ==========================================================================
   HunarLink — Valley Craft Guild (Team 16)
   100% Vanilla JavaScript Application Controller (No Frameworks, No Backend)
   State & Persistence via window.localStorage
   ========================================================================== */

const IMG_MAP = {
  jamawar: "assets/products/kani_01.jpg",
  kani: "assets/products/kani_01.jpg",
  walnut: "assets/image_3.jpg",
  papier: "assets/products/papier_01.jpg",
  ustad: "assets/image_1.jpg",
  silkrug: "assets/image_5.jpg",
  khudrang: "assets/image_6.jpg"
};

const SEED_PRODUCTS = [

  /* ── PASHMINA (16 products) ─────────────────────────────────────────── */
  {
    id: "hl-pash-001", title: "Royal Khudrang Pashmina Shawl",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Ghulam Qadir Mir", district: "Srinagar",
    price: 1650, mrp: 1990, rating: 4.9, reviewCount: 42,
    giId: "GI-JK-PASH-8821", giLevel: 3,
    purityMetric: "14.2 Micron Changthangi Fleece • 100% Hand-Spun",
    loomHours: 420, dimensions: "205 cm × 102 cm", stock: 4,
    image: "assets/products/pashmina_01.jpg",
    description: "Unbleached natural Khudrang Ladakhi Changthangi pashmina hand-woven on a traditional wooden loom in Srinagar with delicate Sozni hand-embroidered border."
  },
  {
    id: "hl-pash-002", title: "Jamawar Heirloom Stole",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Ghulam Qadir Mir", district: "Srinagar",
    price: 1850, mrp: 1999, rating: 4.9, reviewCount: 37,
    giId: "GI-JK-PASH-8810", giLevel: 3,
    purityMetric: "14.5 Micron Changthangi • Natural Indigo & Madder Dyes",
    loomHours: 980, dimensions: "200 cm × 100 cm", stock: 3,
    image: "assets/products/pashmina_02.jpg",
    description: "Heirloom Kani-border wrap blending deep forest-emerald field work with traditional Badam paisley motifs, dyed with natural valley indigo."
  },
  {
    id: "hl-pash-003", title: "Natural Ivory Ring Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustadani Zareena Bano", district: "Srinagar",
    price: 1320, mrp: 1650, rating: 4.8, reviewCount: 28,
    giId: "GI-JK-PASH-8830", giLevel: 3,
    purityMetric: "13.8 Micron • Passes Through Finger Ring",
    loomHours: 360, dimensions: "200 cm × 98 cm", stock: 5,
    image: "assets/products/pashmina_03.jpg",
    description: "So fine it passes through a finger ring — this pure ivory pashmina is hand-spun from 13.8 micron Changthangi fleece by Srinagar's finest women weavers."
  },
  {
    id: "hl-pash-004", title: "Sozni Floral Pashmina Wrap",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Nazir Ahmad Wani", district: "Srinagar",
    price: 1540, mrp: 1890, rating: 4.9, reviewCount: 33,
    giId: "GI-JK-PASH-8845", giLevel: 3,
    purityMetric: "14.1 Micron • Full-Body Sozni Needle Embroidery",
    loomHours: 650, dimensions: "205 cm × 100 cm", stock: 3,
    image: "assets/products/pashmina_04.jpg",
    description: "Full-body Sozni embroidered pashmina shawl with trailing rose and chinar motifs worked painstakingly with a single needle over six months."
  },
  {
    id: "hl-pash-005", title: "Moonlit Shahtoosh-Grade Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustad Bashir Ahmad Lone", district: "Budgam",
    price: 1920, mrp: 2000, rating: 5.0, reviewCount: 21,
    giId: "GI-JK-PASH-8862", giLevel: 3,
    purityMetric: "13.5 Micron Ultra-Fine • Moonlight Transparency Test",
    loomHours: 1100, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/pashmina_05.jpg",
    description: "Ultra-fine 13.5 micron pashmina so translucent it reveals shadows in moonlight — woven on an heirloom Kashmiri pit-loom passed down three generations."
  },
  {
    id: "hl-pash-006", title: "Badam Paisley Reversible Stole",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Farida Akhtar", district: "Pulwama",
    price: 1180, mrp: 1490, rating: 4.7, reviewCount: 44,
    giId: "GI-JK-PASH-8877", giLevel: 2,
    purityMetric: "14.8 Micron • Double-Faced Reversible Weave",
    loomHours: 320, dimensions: "200 cm × 100 cm", stock: 6,
    image: "assets/products/pashmina_06.jpg",
    description: "A rare double-faced reversible pashmina stole featuring Badam paisley on one side and a solid complimentary tone on the reverse — two shawls in one."
  },
  {
    id: "hl-pash-007", title: "Crimson Kani-Border Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustad Mohammad Yusuf", district: "Srinagar",
    price: 1790, mrp: 1995, rating: 4.8, reviewCount: 26,
    giId: "GI-JK-PASH-8891", giLevel: 3,
    purityMetric: "14.0 Micron • 60-Bobbin Kani Border",
    loomHours: 760, dimensions: "205 cm × 102 cm", stock: 3,
    image: "assets/products/pashmina_07.jpg",
    description: "Deep crimson pashmina field adorned with a 15 cm wide Kani-woven border of intricate peacock and floral motifs executed with 60 wooden Tujis bobbins."
  },
  {
    id: "hl-pash-008", title: "Sage Green Twill Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustadani Hameeda Begum", district: "Kupwara",
    price: 1090, mrp: 1390, rating: 4.6, reviewCount: 51,
    giId: "GI-JK-PASH-8903", giLevel: 2,
    purityMetric: "15.2 Micron • 2×2 Twill Weave Structure",
    loomHours: 220, dimensions: "200 cm × 98 cm", stock: 8,
    image: "assets/products/pashmina_08.jpg",
    description: "Hand-woven sage green pashmina in classic 2×2 twill weave — the softest everyday luxury crafted by Kupwara's women-led cooperative collective."
  },
  {
    id: "hl-pash-009", title: "Chinar Leaf Embossed Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Rafiq Ahmad Shah", district: "Baramulla",
    price: 1420, mrp: 1750, rating: 4.8, reviewCount: 39,
    giId: "GI-JK-PASH-8914", giLevel: 2,
    purityMetric: "14.3 Micron • Jamdani Supplementary Weft Chinar",
    loomHours: 480, dimensions: "202 cm × 100 cm", stock: 4,
    image: "assets/products/pashmina_09.jpg",
    description: "Kashmiri autumn spirit captured in a Jamdani supplementary-weft Chinar leaf pattern woven directly into the pashmina ground during looming."
  },
  {
    id: "hl-pash-010", title: "Midnight Blue Zari Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustad Shabir Ahmad", district: "Srinagar",
    price: 1680, mrp: 1980, rating: 4.9, reviewCount: 30,
    giId: "GI-JK-PASH-8929", giLevel: 3,
    purityMetric: "14.1 Micron • Pure Silver Zari Thread Accents",
    loomHours: 820, dimensions: "205 cm × 102 cm", stock: 3,
    image: "assets/products/pashmina_10.jpg",
    description: "Royal midnight blue pashmina adorned with hand-drawn silver Zari thread borders — crafted for grand occasions and collector display."
  },
  {
    id: "hl-pash-011", title: "Papier-Mâché Printed Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Manzoor Hussain", district: "Srinagar",
    price: 1240, mrp: 1550, rating: 4.7, reviewCount: 46,
    giId: "GI-JK-PASH-8937", giLevel: 2,
    purityMetric: "14.6 Micron • Hand Block-Printed Natural Pigment",
    loomHours: 290, dimensions: "200 cm × 100 cm", stock: 5,
    image: "assets/products/pashmina_11.jpg",
    description: "Soft ivory pashmina hand block-printed with traditional Naqash motifs using the same mineral pigments used in papier-mâché art — a unique craft fusion."
  },
  {
    id: "hl-pash-012", title: "Gold Embroidered Bridal Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustadani Ruksana Naqshbandi", district: "Srinagar",
    price: 1980, mrp: 2000, rating: 5.0, reviewCount: 17,
    giId: "GI-JK-PASH-8945", giLevel: 3,
    purityMetric: "13.9 Micron • 24K Gold Zari Embroidery",
    loomHours: 1600, dimensions: "210 cm × 108 cm", stock: 1,
    image: "assets/products/pashmina_12.jpg",
    description: "A once-in-a-lifetime bridal pashmina embroidered edge-to-edge with 24K gold Zari thread Naqash motifs — presented in a heritage sandalwood box."
  },
  {
    id: "hl-pash-017", title: "Striped Regency Pashmina Stole",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustad Tariq Wani", district: "Srinagar",
    price: 1050, mrp: 1350, rating: 4.5, reviewCount: 67,
    giId: "GI-JK-PASH-8990", giLevel: 1,
    purityMetric: "15.5 Micron • Natural Plant-Dyed Stripes",
    loomHours: 180, dimensions: "200 cm × 90 cm", stock: 10,
    image: "assets/products/pashmina_17.jpg",
    description: "Classic multicolour striped pashmina stole dyed with plant-based madder, indigo and turmeric in the traditional Regency palette — everyday heritage."
  },
  {
    id: "hl-pash-018", title: "Shaheen Eagle Kani Pashmina",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustad Nazir Ahmad Bhat", district: "Srinagar",
    price: 1890, mrp: 1999, rating: 5.0, reviewCount: 19,
    giId: "GI-JK-PASH-8998", giLevel: 3,
    purityMetric: "13.6 Micron • Full Kani Eagle Motif Field Weave",
    loomHours: 1420, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/pashmina_18.jpg",
    description: "A masterpiece — this full-field Kani-woven pashmina depicts the mythic Shaheen eagle in flight using 220 Tujis bobbins and Talim script notation."
  },
  {
    id: "hl-pash-019", title: "Copper Autumn Pashmina Shawl",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Ustadani Nasreen Zargar", district: "Shopian",
    price: 1290, mrp: 1599, rating: 4.7, reviewCount: 41,
    giId: "GI-JK-PASH-9006", giLevel: 2,
    purityMetric: "14.7 Micron • Pomegranate Rind Natural Dye",
    loomHours: 270, dimensions: "200 cm × 100 cm", stock: 6,
    image: "assets/products/pashmina_19.jpg",
    description: "Warm copper-autumn hue achieved entirely from pomegranate rind and iron mordant — a natural dye tradition passed through generations in Shopian."
  },
  {
    id: "hl-pash-020", title: "Diamond Weave Pashmina Throw",
    guild: "pashmina", guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Javid Ahmad", district: "Budgam",
    price: 1380, mrp: 1699, rating: 4.8, reviewCount: 36,
    giId: "GI-JK-PASH-9014", giLevel: 2,
    purityMetric: "14.4 Micron • Diamond Geometric Weave Structure",
    loomHours: 310, dimensions: "190 cm × 140 cm (Throw)", stock: 5,
    image: "assets/products/pashmina_20.jpg",
    description: "Generously sized pashmina throw in a geometric diamond weave — crafted for living room display and cosy winter draping across heritage furniture."
  },

  /* ── WALNUT WOODCARVING (20 products) ───────────────────────────────── */
  {
    id: "hl-waln-001", title: "Openwork Chinar Lattice Walnut Chest",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Fayaz Ahmad Wani", district: "Anantnag",
    price: 14800, mrp: 21500, rating: 4.9, reviewCount: 46,
    giId: "GI #JK-WNT-1180", giLevel: 3,
    purityMetric: "Seasoned Juglans Regia Walnut • 5-Yr Cured",
    loomHours: 220, dimensions: "42 cm × 26 cm × 22 cm", stock: 2,
    image: "assets/products/walnut_01.jpg",
    description: "Single-block seasoned Kashmiri walnut root chest chiseled with intricate chinar leaf openwork and traditional jali patterns, finished with natural beeswax polish."
  },
  {
    id: "hl-waln-002", title: "Walnut Wood Lattice Screen",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Bashir Tarkhan", district: "Anantnag",
    price: 46500, mrp: 55000, rating: 4.7, reviewCount: 22,
    giId: "GI-JK-WALN-4418", giLevel: 2,
    purityMetric: "Kiln & Air Seasoned Walnut • Pinjrakari Jali Geometry",
    loomHours: 380, dimensions: "165 cm × 120 cm (3-Panel)", stock: 3,
    image: "assets/products/walnut_02.jpg",
    description: "Three-panel architectural room divider carved with geometric Pinjrakari lattice work and bordered by hand-relieved Kashmiri Chinar foliage."
  },
  {
    id: "hl-waln-003", title: "Deep Relief Fruit Bowl Set",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Ghulam Nabi", district: "Anantnag",
    price: 18500, mrp: 23000, rating: 4.7, reviewCount: 48,
    giId: "GI-JK-WALN-4430", giLevel: 2,
    purityMetric: "250-Yr Walnut • Full Undercut Chinar & Grape Motif",
    loomHours: 180, dimensions: "35 cm Dia × 12 cm H (Set of 3)", stock: 5,
    image: "assets/products/walnut_03.jpg",
    description: "Nesting fruit bowl set chiseled from a single walnut burl with interlocking Chinar and grape vine motifs in deep undercut relief — functional heirloom art."
  },
  {
    id: "hl-waln-004", title: "Royal Divan Walnut Coffee Table",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Farooq Ahmad", district: "Anantnag",
    price: 185000, mrp: 220000, rating: 4.9, reviewCount: 14,
    giId: "GI-JK-WALN-4445", giLevel: 3,
    purityMetric: "300-Yr Walnut Slab • Full-Surface Deep Relief Carving",
    loomHours: 1200, dimensions: "120 cm × 70 cm × 45 cm", stock: 1,
    image: "assets/products/walnut_04.jpg",
    description: "Statement coffee table with a full-surface deep relief carved top depicting the Dal Lake Shikara panorama — each wave and mountain individually chiseled."
  },
  {
    id: "hl-waln-005", title: "Mughal Arch Photo Frame",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Riyaz Ahmad", district: "Srinagar",
    price: 8200, mrp: 10500, rating: 4.6, reviewCount: 72,
    giId: "GI-JK-WALN-4461", giLevel: 1,
    purityMetric: "Kiln-Dried Walnut • Mughal Jali Arch Border",
    loomHours: 60, dimensions: "30 cm × 25 cm (5×7 inch photo)", stock: 12,
    image: "assets/products/walnut_05.jpg",
    description: "Classic Mughal pointed-arch photo frame hand-carved with interlaced Jali border and Chinar corner medallions — perfect heritage gift item."
  },
  {
    id: "hl-waln-006", title: "Hand-Carved Chessboard & Pieces",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Nazir Ahmad Dar", district: "Anantnag",
    price: 56000, mrp: 68000, rating: 4.8, reviewCount: 31,
    giId: "GI-JK-WALN-4479", giLevel: 2,
    purityMetric: "Walnut & Deodar Inlay • Hand-Turned Chess Pieces",
    loomHours: 420, dimensions: "50 cm × 50 cm Board", stock: 3,
    image: "assets/products/walnut_06.jpg",
    description: "Complete chess set with inlaid walnut-and-deodar board and 32 hand-turned Mughal-inspired chess pieces — a functional collector's heirloom."
  },
  {
    id: "hl-waln-007", title: "Floral Walnut Wall Panel",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Bashir Tarkhan", district: "Anantnag",
    price: 38000, mrp: 46000, rating: 4.7, reviewCount: 25,
    giId: "GI-JK-WALN-4493", giLevel: 2,
    purityMetric: "250-Yr Walnut • Full Floral Field Relief",
    loomHours: 320, dimensions: "90 cm × 60 cm", stock: 4,
    image: "assets/products/walnut_07.jpg",
    description: "Rectangular wall panel carved entirely with interlocking roses, tulips, and chinar leaves in full floral field relief — ready for heritage interior display."
  },
  {
    id: "hl-waln-008", title: "Traditional Walnut Spice Box",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Master Mushtaq Ahmad", district: "Shopian",
    price: 12500, mrp: 15500, rating: 4.6, reviewCount: 59,
    giId: "GI-JK-WALN-4507", giLevel: 1,
    purityMetric: "Kiln-Dried Walnut • 7-Compartment Rotating Lid",
    loomHours: 90, dimensions: "22 cm Dia × 8 cm H", stock: 8,
    image: "assets/products/walnut_08.jpg",
    description: "Seven-compartment rotating-lid walnut spice box with carved Chinar motifs — a Kashmiri kitchen staple elevated to heirloom status."
  },
  {
    id: "hl-waln-009", title: "Shikara Gondola Model",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Shabir Naqashband", district: "Srinagar",
    price: 22000, mrp: 27500, rating: 4.8, reviewCount: 44,
    giId: "GI-JK-WALN-4521", giLevel: 2,
    purityMetric: "Walnut Hull & Deodar Detail • Hand-Painted Canopy",
    loomHours: 200, dimensions: "55 cm × 15 cm × 20 cm", stock: 5,
    image: "assets/products/walnut_09.jpg",
    description: "Meticulous scale model of a traditional Dal Lake Shikara boat, hand-carved from walnut with fabric canopy and tiny carved passengers — museum showpiece."
  },
  {
    id: "hl-waln-010", title: "Grape Vine Mirror Frame",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Abdul Majeed Tarkhan", district: "Anantnag",
    price: 29000, mrp: 36000, rating: 4.7, reviewCount: 33,
    giId: "GI-JK-WALN-4537", giLevel: 2,
    purityMetric: "250-Yr Walnut • Undercut Grape & Tendril Frame",
    loomHours: 240, dimensions: "80 cm × 60 cm (mirror included)", stock: 4,
    image: "assets/products/walnut_10.jpg",
    description: "Ornate mirror frame carved with trailing grape vines and clusters in deep undercut relief — bevelled mirror included, ready for heritage bedroom display."
  },
  {
    id: "hl-waln-011", title: "Pinjrakari Lattice Candle Stand",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Irshad Hussain", district: "Budgam",
    price: 15800, mrp: 19500, rating: 4.6, reviewCount: 52,
    giId: "GI-JK-WALN-4551", giLevel: 2,
    purityMetric: "Seasoned Walnut • Geometric Pinjrakari Jali Shade",
    loomHours: 130, dimensions: "45 cm H × 18 cm Dia", stock: 6,
    image: "assets/products/walnut_11.jpg",
    description: "Tall candle lantern with Pinjrakari geometric lattice shade — when lit, it casts intricate star-and-polygon shadow patterns across the room."
  },
  {
    id: "hl-waln-012", title: "Chinar Motif Book Stand",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Master Javid Naqashband", district: "Srinagar",
    price: 9800, mrp: 12500, rating: 4.5, reviewCount: 66,
    giId: "GI-JK-WALN-4565", giLevel: 1,
    purityMetric: "Kiln-Dried Walnut • Folding Chinar Relief Stand",
    loomHours: 75, dimensions: "32 cm × 22 cm (adjustable)", stock: 10,
    image: "assets/products/walnut_12.jpg",
    description: "Folding Quran and book stand hand-carved with five-lobed Chinar leaf motifs on each panel — a daily heritage piece for home and gifting."
  },
  {
    id: "hl-waln-013", title: "Walnut Dining Chair Pair",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Farooq Ahmad", district: "Anantnag",
    price: 128000, mrp: 155000, rating: 4.9, reviewCount: 11,
    giId: "GI-JK-WALN-4579", giLevel: 3,
    purityMetric: "300-Yr Walnut Frame • Full-Back Carved Floral Panel",
    loomHours: 880, dimensions: "50 cm × 50 cm × 95 cm (per chair)", stock: 2,
    image: "assets/products/walnut_13.jpg",
    description: "Pair of Kashmiri royal dining chairs with fully carved walnut frames and floral-panel backrests — silk brocade upholstered seats in heritage emerald green."
  },
  {
    id: "hl-waln-014", title: "Butterfly Inlay Trinket Box",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Master Nazir Hussain", district: "Pulwama",
    price: 7500, mrp: 9500, rating: 4.5, reviewCount: 83,
    giId: "GI-JK-WALN-4593", giLevel: 1,
    purityMetric: "Walnut & Bone Inlay • Butterfly & Poppy Motif",
    loomHours: 55, dimensions: "18 cm × 12 cm × 7 cm", stock: 15,
    image: "assets/products/walnut_14.jpg",
    description: "Small trinket box with butterfly and poppy bone-inlay motifs on a walnut base — a perfect heritage souvenir and jewellery gift box."
  },
  {
    id: "hl-waln-015", title: "Palace Doorway Arch Panel",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Ghulam Mohammad Tarkhan", district: "Anantnag",
    price: 220000, mrp: 265000, rating: 5.0, reviewCount: 8,
    giId: "GI-JK-WALN-4607", giLevel: 3,
    purityMetric: "300-Yr Walnut • Monumental Arch Deep Undercut",
    loomHours: 1800, dimensions: "180 cm × 90 cm (Arch)", stock: 1,
    image: "assets/products/walnut_15.jpg",
    description: "Monumental doorway arch panel replicating Mughal palace architecture — full-surface undercut carving of hunting scenes, floral borders, and calligraphy bands."
  },
  {
    id: "hl-waln-016", title: "Heirloom Jewellery Wardrobe",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Bashir Tarkhan", district: "Anantnag",
    price: 95000, mrp: 115000, rating: 4.8, reviewCount: 16,
    giId: "GI-JK-WALN-4621", giLevel: 3,
    purityMetric: "250-Yr Walnut • 12-Drawer Relief-Carved Cabinet",
    loomHours: 760, dimensions: "60 cm × 40 cm × 85 cm", stock: 2,
    image: "assets/products/walnut_16.jpg",
    description: "Twelve-drawer standing jewellery wardrobe with every drawer front carved in deep relief Chinar, lotus, and Mughal arch motifs — velvet-lined interiors."
  },
  {
    id: "hl-waln-017", title: "Walnut Carved Pen & Ink Set",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Master Tariq Naqashband", district: "Srinagar",
    price: 11000, mrp: 14000, rating: 4.6, reviewCount: 61,
    giId: "GI-JK-WALN-4635", giLevel: 1,
    purityMetric: "Kiln-Dried Walnut • Hand-Turned Pen & Relief Tray",
    loomHours: 80, dimensions: "28 cm × 12 cm Tray", stock: 9,
    image: "assets/products/walnut_17.jpg",
    description: "Executive desk set comprising a hand-turned walnut fountain pen, ink well, and carved tray — an artisanal alternative to corporate gifting."
  },
  {
    id: "hl-waln-018", title: "Floral Walnut Tissue Box Cover",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Master Abdul Rahman", district: "Shopian",
    price: 6800, mrp: 8800, rating: 4.4, reviewCount: 94,
    giId: "GI-JK-WALN-4649", giLevel: 1,
    purityMetric: "Kiln-Dried Walnut • Floral Relief Exterior",
    loomHours: 45, dimensions: "25 cm × 13 cm × 13 cm", stock: 18,
    image: "assets/products/walnut_18.jpg",
    description: "Kashmiri walnut tissue box cover with all-over floral relief — transforms a mundane household item into a heritage craft statement piece."
  },
  {
    id: "hl-waln-019", title: "Carved Walnut Garden Planter",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Ustad Mukhtar Ahmad", district: "Budgam",
    price: 24000, mrp: 29500, rating: 4.7, reviewCount: 37,
    giId: "GI-JK-WALN-4663", giLevel: 2,
    purityMetric: "Treated Walnut • Grape-Vine Exterior Relief",
    loomHours: 190, dimensions: "35 cm × 35 cm × 32 cm", stock: 5,
    image: "assets/products/walnut_19.jpg",
    description: "Outdoor garden planter hand-carved with grape vine and leaf motifs — sealed with natural linseed oil for all-weather protection and deep lustre."
  },
  {
    id: "hl-waln-020", title: "Lotus Pond Wall Clock",
    guild: "walnut", guildLabel: "Walnut Woodcarving",
    artisan: "Master Fayaz Ahmad Dar", district: "Srinagar",
    price: 16500, mrp: 20500, rating: 4.7, reviewCount: 55,
    giId: "GI-JK-WALN-4677", giLevel: 2,
    purityMetric: "250-Yr Walnut • Relief Lotus & Kingfisher Panel",
    loomHours: 150, dimensions: "40 cm Dia", stock: 6,
    image: "assets/products/walnut_20.jpg",
    description: "Round wall clock with hand-carved lotus pond scene on the walnut face — features a kingfisher in mid-dive, a blossom ring, and silent quartz movement."
  },

  /* ── PAPIER-MÂCHÉ (20 products) ─────────────────────────────────────── */
  {
    id: "hl-papr-001", title: "Shahi Gulab-dan Urn",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Ali Mohammad", district: "Srinagar",
    price: 850, mrp: 990, rating: 4.9, reviewCount: 54,
    giId: "GI-JK-PAPR-3109", giLevel: 2,
    purityMetric: "Hand-Pounded Sakhta Pulp • 24K Gold Leaf Naqash",
    loomHours: 140, dimensions: "32 cm H × 19 cm Dia", stock: 6,
    image: "assets/products/papier_01.jpg",
    description: "Museum-grade Kashmiri papier-mâché royal urn painted freehand with squirrel-hair Kalam brushes using natural mineral pigments and genuine gold leaf."
  },
  {
    id: "hl-papr-002", title: "Persian Guldan Naqash Vase",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Tariq Hussain", district: "Baramulla",
    price: 890, mrp: 1000, rating: 4.8, reviewCount: 33,
    giId: "GI-JK-PAPR-3155", giLevel: 2,
    purityMetric: "Layered Sakhta Pulp • Hazara Rose & Bulbul Motif",
    loomHours: 175, dimensions: "36 cm H × 18 cm Dia", stock: 5,
    image: "assets/products/papier_02.jpg",
    description: "Classic long-necked Kashmiri Persian Guldan finished in deep forest black lacquer and illuminated with thousand-flower Hazara Naqash gold-leaf detailing."
  },
  {
    id: "hl-papr-003", title: "Naqash Papier-Mâché Jewellery Box",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Manzoor Naqash", district: "Srinagar",
    price: 680, mrp: 850, rating: 4.7, reviewCount: 86,
    giId: "GI-JK-PAPR-3171", giLevel: 2,
    purityMetric: "Sakhta Pulp • Squirrel-Hair Brush Florals",
    loomHours: 85, dimensions: "22 cm × 15 cm × 9 cm", stock: 9,
    image: "assets/products/papier_03.jpg",
    description: "Handcrafted papier-mâché jewellery box with all-over miniature Naqash floral painting — velvet lining, brass clasp, and a mirror-fitted lid interior."
  },
  {
    id: "hl-papr-004", title: "Thousand Flowers Ceiling Pendant",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Ali Mohammad", district: "Srinagar",
    price: 980, mrp: 1000, rating: 4.9, reviewCount: 27,
    giId: "GI-JK-PAPR-3188", giLevel: 3,
    purityMetric: "Layered Sakhta Pulp • Hazara 1000-Flower All-Over",
    loomHours: 320, dimensions: "45 cm Dia × 25 cm H", stock: 3,
    image: "assets/products/papier_04.jpg",
    description: "Spectacular ceiling light shade hand-painted with the Hazara thousand-flower motif — when illuminated, it casts a garden of shadows across the room."
  },
  {
    id: "hl-papr-005", title: "Chinar Leaf Papier-Mâché Plate",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Ustadani Fatima Naqash", district: "Srinagar",
    price: 620, mrp: 780, rating: 4.6, reviewCount: 112,
    giId: "GI-JK-PAPR-3204", giLevel: 1,
    purityMetric: "Sakhta Pulp • Five-Lobed Chinar Leaf Form",
    loomHours: 55, dimensions: "30 cm Dia", stock: 14,
    image: "assets/products/papier_05.jpg",
    description: "Decorative wall plate shaped as a five-lobed Chinar leaf and hand-painted with miniature Naqash garden scenes — a classic Kashmiri souvenir elevated to art."
  },
  {
    id: "hl-papr-006", title: "Golden Shikar Hunting Scene Box",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Muzaffar Naqash", district: "Srinagar",
    price: 920, mrp: 1000, rating: 4.8, reviewCount: 41,
    giId: "GI-JK-PAPR-3221", giLevel: 2,
    purityMetric: "Multi-Layer Sakhta • Gold Leaf Hunting Scene",
    loomHours: 240, dimensions: "28 cm × 20 cm × 12 cm", stock: 4,
    image: "assets/products/papier_06.jpg",
    description: "Rectangular box with an elaborate Mughal royal hunting scene in gold leaf and mineral pigments — horses, falcons, and hunters across all four sides."
  },
  {
    id: "hl-papr-007", title: "Bird of Paradise Lamp Base",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Rafiq Naqashband", district: "Srinagar",
    price: 950, mrp: 1000, rating: 4.8, reviewCount: 36,
    giId: "GI-JK-PAPR-3238", giLevel: 2,
    purityMetric: "Sakhta Pulp • Paradise Bird & Blossom Motif",
    loomHours: 270, dimensions: "42 cm H × 16 cm Dia", stock: 4,
    image: "assets/products/papier_07.jpg",
    description: "Table lamp base painted with paradise birds perched among blossoming branches — pairs with any neutral shade for a dramatic living room centrepiece."
  },
  {
    id: "hl-papr-008", title: "Papier-Mâché Chess Set",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Tariq Hussain", district: "Baramulla",
    price: 880, mrp: 995, rating: 4.7, reviewCount: 49,
    giId: "GI-JK-PAPR-3255", giLevel: 2,
    purityMetric: "Sakhta Moulded Pieces • Hand-Painted Mughal Set",
    loomHours: 180, dimensions: "40 cm × 40 cm Board Set", stock: 5,
    image: "assets/products/papier_08.jpg",
    description: "Complete chess set with papier-mâché moulded Mughal-character pieces and a painted floral board — a fully playable heirloom game."
  },
  {
    id: "hl-papr-009", title: "Crescent Moon Wall Mask",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Ustadani Zeenat Naqash", district: "Srinagar",
    price: 740, mrp: 920, rating: 4.6, reviewCount: 68,
    giId: "GI-JK-PAPR-3272", giLevel: 1,
    purityMetric: "Sakhta Pulp • Hand-Moulded Crescent & Star",
    loomHours: 100, dimensions: "35 cm × 20 cm", stock: 7,
    image: "assets/products/papier_09.jpg",
    description: "Hand-moulded crescent moon face mask in papier-mâché, painted with lapis blue and gold leaf — a striking Eid and heritage décor wall accent."
  },
  {
    id: "hl-papr-010", title: "Miniature Dal Lake Houseboat",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Javid Naqash", district: "Srinagar",
    price: 820, mrp: 980, rating: 4.8, reviewCount: 57,
    giId: "GI-JK-PAPR-3289", giLevel: 2,
    purityMetric: "Sakhta Moulded • Dal Lake Houseboat Miniature",
    loomHours: 145, dimensions: "30 cm × 12 cm × 15 cm", stock: 6,
    image: "assets/products/papier_10.jpg",
    description: "Intricate miniature of the iconic Dal Lake houseboat — painted with Naqash floral windows, carved balustrade details, and a tiny Shikara alongside."
  },
  {
    id: "hl-papr-011", title: "Floral Naqash Coaster Set",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Ustadani Hameeda Naqash", district: "Srinagar",
    price: 560, mrp: 720, rating: 4.5, reviewCount: 134,
    giId: "GI-JK-PAPR-3306", giLevel: 1,
    purityMetric: "Sakhta Pulp • Floral Naqash Set of 6",
    loomHours: 40, dimensions: "10 cm Dia (Set of 6)", stock: 20,
    image: "assets/products/papier_11.jpg",
    description: "Set of six round papier-mâché coasters each uniquely hand-painted with a different Kashmiri flower — rose, lotus, tulip, chinar, poppy, and narcissus."
  },
  {
    id: "hl-papr-012", title: "Peacock Feather Earrings (Papier-Mâché)",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Ustadani Nasreen Naqash", district: "Srinagar",
    price: 500, mrp: 650, rating: 4.6, reviewCount: 198,
    giId: "GI-JK-PAPR-3323", giLevel: 1,
    purityMetric: "Micro Sakhta Moulded • Peacock Feather Eye",
    loomHours: 20, dimensions: "6 cm Length (Pair)", stock: 25,
    image: "assets/products/papier_12.jpg",
    description: "Featherlight papier-mâché earrings shaped as peacock feather eyes, hand-painted in iridescent teal and gold — wearable Kashmiri miniature art."
  },
  {
    id: "hl-papr-013", title: "Naqash Floral Picture Frame",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Muzaffar Naqash", district: "Srinagar",
    price: 640, mrp: 800, rating: 4.6, reviewCount: 77,
    giId: "GI-JK-PAPR-3340", giLevel: 1,
    purityMetric: "Sakhta Pulp Frame • Hand-Painted Floral Border",
    loomHours: 65, dimensions: "25 cm × 20 cm (5×7 print)", stock: 11,
    image: "assets/products/papier_13.jpg",
    description: "Hand-painted picture frame with an all-over Naqash floral border in mineral pigments and gold leaf — a heritage way to display a cherished photograph."
  },
  {
    id: "hl-papr-014", title: "Royal Blue Perfume Bottle",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Ali Mohammad", district: "Srinagar",
    price: 710, mrp: 890, rating: 4.7, reviewCount: 90,
    giId: "GI-JK-PAPR-3357", giLevel: 2,
    purityMetric: "Sakhta Pulp • Lapis Blue & Gold Naqash Perfume Bottle",
    loomHours: 90, dimensions: "18 cm H × 7 cm Dia", stock: 8,
    image: "assets/products/papier_14.jpg",
    description: "Kashmiri papier-mâché perfume bottle in deep royal lapis blue with Naqash gold-leaf rose motifs — a luxurious vanity accent and collector's piece."
  },
  {
    id: "hl-papr-015", title: "Treetop Humming Bird Panel",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Ustadani Fatima Naqash", district: "Srinagar",
    price: 900, mrp: 1000, rating: 4.8, reviewCount: 43,
    giId: "GI-JK-PAPR-3374", giLevel: 2,
    purityMetric: "Multi-Layer Sakhta • Hummingbird & Chinar Scene",
    loomHours: 200, dimensions: "50 cm × 35 cm", stock: 5,
    image: "assets/products/papier_15.jpg",
    description: "Rectangular wall panel painted with a lush Chinar treetop scene featuring hummingbirds, butterflies, and blossoms in luminous mineral pigments."
  },
  {
    id: "hl-papr-016", title: "Papier-Mâché Tissue Box Holder",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Rafiq Naqashband", district: "Srinagar",
    price: 590, mrp: 750, rating: 4.5, reviewCount: 108,
    giId: "GI-JK-PAPR-3391", giLevel: 1,
    purityMetric: "Sakhta Pulp • Floral All-Over Tissue Cover",
    loomHours: 45, dimensions: "26 cm × 13 cm × 13 cm", stock: 16,
    image: "assets/products/papier_16.jpg",
    description: "Kashmiri papier-mâché tissue box holder with all-over poppy and chinar miniature painting — transforms a bathroom or desk essential into heritage art."
  },
  {
    id: "hl-papr-017", title: "Mughal Garden Tray",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Manzoor Naqash", district: "Srinagar",
    price: 790, mrp: 960, rating: 4.7, reviewCount: 61,
    giId: "GI-JK-PAPR-3408", giLevel: 2,
    purityMetric: "Layered Sakhta • Mughal Charbagh Garden Scene",
    loomHours: 125, dimensions: "40 cm × 28 cm", stock: 7,
    image: "assets/products/papier_17.jpg",
    description: "Rectangular serving tray painted with a Mughal Charbagh formal garden aerial view — cypress trees, fountains, and flower parterre in gold and mineral colour."
  },
  {
    id: "hl-papr-018", title: "Animal Kingdom Papier-Mâché Eggs",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Ustadani Zeenat Naqash", district: "Srinagar",
    price: 660, mrp: 840, rating: 4.6, reviewCount: 73,
    giId: "GI-JK-PAPR-3425", giLevel: 1,
    purityMetric: "Sakhta Moulded • Miniature Animal Naqash Eggs",
    loomHours: 60, dimensions: "8 cm H (Set of 5)", stock: 12,
    image: "assets/products/papier_18.jpg",
    description: "Set of five hand-moulded papier-mâché eggs, each painted with a different Kashmiri wildlife scene — snow leopard, markhor, kingfisher, bear, and pheasant."
  },
  {
    id: "hl-papr-019", title: "Naqash Floral Wall Clock",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Javid Naqash", district: "Srinagar",
    price: 760, mrp: 940, rating: 4.7, reviewCount: 65,
    giId: "GI-JK-PAPR-3442", giLevel: 2,
    purityMetric: "Sakhta Pulp • Full Naqash Floral Dial Face",
    loomHours: 110, dimensions: "35 cm Dia", stock: 8,
    image: "assets/products/papier_19.jpg",
    description: "Round papier-mâché wall clock with a hand-painted Naqash floral dial and silent quartz movement — hour and minute hands finished in heritage gold."
  },
  {
    id: "hl-papr-020", title: "Lacquered Papier-Mâché Pen Stand",
    guild: "papier-mache", guildLabel: "Papier-Mâché Art",
    artisan: "Master Tariq Hussain", district: "Baramulla",
    price: 540, mrp: 690, rating: 4.5, reviewCount: 142,
    giId: "GI-JK-PAPR-3459", giLevel: 1,
    purityMetric: "Sakhta Pulp • Lacquer & Rose Motif Desk Stand",
    loomHours: 35, dimensions: "12 cm H × 8 cm Dia", stock: 22,
    image: "assets/products/papier_20.jpg",
    description: "Compact papier-mâché pen and pencil holder finished in deep burgundy lacquer with a Naqash rose motif — the ideal artisan desk accessory and gift."
  },

  /* ── SILK RUGS (20 products) ─────────────────────────────────────────── */
  {
    id: "hl-silk-001", title: "Silk-on-Silk Medallion Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Abdul Rashid", district: "Budgam",
    price: 118000, mrp: 142000, rating: 4.9, reviewCount: 19,
    giId: "GI-JK-SILK-7712", giLevel: 3,
    purityMetric: "100% Mulberry Silk Warp & Weft • 625 Knots/Sq.In",
    loomHours: 2400, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 2,
    image: "assets/products/silkrug_01.jpg",
    description: "Hand-knotted silk-on-silk Persian medallion carpet crafted with traditional Kashmiri Talim script — luminous turquoise, emerald, and gold pile."
  },
  {
    id: "hl-silk-002", title: "Hunting Scene Silk Carpet",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Nazir Ahmad Bhat", district: "Budgam",
    price: 185000, mrp: 225000, rating: 5.0, reviewCount: 12,
    giId: "GI-JK-SILK-7729", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 700 Knots/Sq.In • Talim Script",
    loomHours: 3600, dimensions: "240 cm × 160 cm (8×5 ft)", stock: 1,
    image: "assets/products/silkrug_02.jpg",
    description: "Grand Mughal-era hunting scene carpet with 700 Persian knots per square inch — horses, falcons, and hunting nobles depicted in luminous silk pile."
  },
  {
    id: "hl-silk-003", title: "Garden of Paradise Tree-of-Life Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Firdous Rashid", district: "Budgam",
    price: 142000, mrp: 172000, rating: 4.9, reviewCount: 15,
    giId: "GI-JK-SILK-7746", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 625 Knots/Sq.In",
    loomHours: 2800, dimensions: "213 cm × 137 cm (7×4.5 ft)", stock: 2,
    image: "assets/products/silkrug_03.jpg",
    description: "The iconic Kashmiri Tree of Life motif cascading from a central tree with birds, blossoms, and cypress trees across a cobalt blue silk field."
  },
  {
    id: "hl-silk-004", title: "Geometric Herati Pattern Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Shabir Rashid", district: "Budgam",
    price: 95000, mrp: 118000, rating: 4.8, reviewCount: 21,
    giId: "GI-JK-SILK-7763", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 576 Knots/Sq.In",
    loomHours: 1900, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 3,
    image: "assets/products/silkrug_04.jpg",
    description: "Classic Herati fish-in-diamond geometric all-over pattern executed in 576 Persian knots per square inch across a warm ivory silk field."
  },
  {
    id: "hl-silk-005", title: "Floral Bouquet Prayer Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustadani Ruksana Rashid", district: "Budgam",
    price: 68000, mrp: 84000, rating: 4.8, reviewCount: 28,
    giId: "GI-JK-SILK-7780", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 525 Knots/Sq.In",
    loomHours: 1400, dimensions: "120 cm × 80 cm (Prayer)", stock: 3,
    image: "assets/products/silkrug_05.jpg",
    description: "Prayer rug with a mihrab arch flanked by flowering vases and Quranic border medallions — 525 knots per square inch in rose, ivory, and gold silk."
  },
  {
    id: "hl-silk-006", title: "Shah Abbas Palmette Silk Carpet",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Abdul Rashid", district: "Budgam",
    price: 158000, mrp: 190000, rating: 4.9, reviewCount: 14,
    giId: "GI-JK-SILK-7797", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 650 Knots/Sq.In",
    loomHours: 3100, dimensions: "240 cm × 150 cm (8×5 ft)", stock: 1,
    image: "assets/products/silkrug_06.jpg",
    description: "Imperial Shah Abbas palmette and arabesque design with interlocking floral scrolls — this 650 kpsi carpet rivals 17th-century Persian court originals."
  },
  {
    id: "hl-silk-007", title: "Kashmiri Neem Design Table Runner",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Irfan Rashid", district: "Srinagar",
    price: 28000, mrp: 35000, rating: 4.7, reviewCount: 44,
    giId: "GI-JK-SILK-7814", giLevel: 2,
    purityMetric: "100% Mulberry Silk • 400 Knots/Sq.In",
    loomHours: 580, dimensions: "150 cm × 50 cm (Runner)", stock: 5,
    image: "assets/products/silkrug_07.jpg",
    description: "Narrow silk-on-silk dining table runner in the classic Kashmiri Neem leaf-scroll design — an accessible introduction to luxury hand-knotted silk."
  },
  {
    id: "hl-silk-008", title: "Azure Blue Floral Medallion Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Nazir Ahmad Bhat", district: "Budgam",
    price: 112000, mrp: 136000, rating: 4.9, reviewCount: 17,
    giId: "GI-JK-SILK-7831", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 600 Knots/Sq.In",
    loomHours: 2200, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 2,
    image: "assets/products/silkrug_08.jpg",
    description: "Deep azure blue field silk rug with a central radiant medallion in ivory, coral, and gold — the blue achieved with hand-mixed natural lapis pigment yarn."
  },
  {
    id: "hl-silk-009", title: "Fine Silk Zaronim Small Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Firdous Rashid", district: "Budgam",
    price: 48000, mrp: 59000, rating: 4.7, reviewCount: 35,
    giId: "GI-JK-SILK-7848", giLevel: 2,
    purityMetric: "100% Mulberry Silk • 500 Knots/Sq.In",
    loomHours: 980, dimensions: "100 cm × 65 cm (Zaronim)", stock: 4,
    image: "assets/products/silkrug_09.jpg",
    description: "Zaronim format small accent rug in coral and ivory with a mini medallion design — perfect for a bedside, entryway, or display frame mounting."
  },
  {
    id: "hl-silk-010", title: "Wool-Silk Blend Floral Area Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Shabir Rashid", district: "Srinagar",
    price: 62000, mrp: 76000, rating: 4.7, reviewCount: 29,
    giId: "GI-JK-SILK-7865", giLevel: 2,
    purityMetric: "70% Wool / 30% Silk Pile • 300 Knots/Sq.In",
    loomHours: 1250, dimensions: "240 cm × 160 cm (8×5 ft)", stock: 3,
    image: "assets/products/silkrug_10.jpg",
    description: "Large living room rug with wool foundation and silk pile highlights — durable for high-traffic use while retaining the luminous sheen of pure silk accents."
  },
  {
    id: "hl-silk-011", title: "Rust Red Turkoman Gul Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Abdul Rashid", district: "Budgam",
    price: 108000, mrp: 132000, rating: 4.8, reviewCount: 20,
    giId: "GI-JK-SILK-7882", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 575 Knots/Sq.In",
    loomHours: 2100, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 2,
    image: "assets/products/silkrug_11.jpg",
    description: "Deep rust-red Turkoman tribal Gul motif carpet in pure Mulberry silk — repeating octagonal Gul medallions on a rich madder-red silk field."
  },
  {
    id: "hl-silk-012", title: "Ivory Floral Allover Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustadani Ruksana Rashid", district: "Budgam",
    price: 92000, mrp: 112000, rating: 4.8, reviewCount: 23,
    giId: "GI-JK-SILK-7899", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 600 Knots/Sq.In",
    loomHours: 1850, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 2,
    image: "assets/products/silkrug_12.jpg",
    description: "Soft ivory ground silk rug with an all-over lattice of roses, tulips, and lilies — the perfect understated luxury rug for a minimal contemporary interior."
  },
  {
    id: "hl-silk-013", title: "Silk on Cotton Floral Dhurrie",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Irfan Rashid", district: "Srinagar",
    price: 36000, mrp: 44000, rating: 4.6, reviewCount: 42,
    giId: "GI-JK-SILK-7916", giLevel: 2,
    purityMetric: "Silk Pile on Cotton Warp • 220 Knots/Sq.In",
    loomHours: 720, dimensions: "240 cm × 160 cm (8×5 ft)", stock: 4,
    image: "assets/products/silkrug_13.jpg",
    description: "Accessible silk-on-cotton dhurrie flatweave with raised floral knotted silk pile accents — a lighter, more affordable path into Kashmiri silk rug heritage."
  },
  {
    id: "hl-silk-014", title: "Night Sky Star Lattice Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Nazir Ahmad Bhat", district: "Budgam",
    price: 135000, mrp: 164000, rating: 4.9, reviewCount: 16,
    giId: "GI-JK-SILK-7933", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 625 Knots/Sq.In",
    loomHours: 2650, dimensions: "213 cm × 137 cm (7×4.5 ft)", stock: 1,
    image: "assets/products/silkrug_14.jpg",
    description: "Midnight blue field with an eight-pointed star Pinjrakari lattice geometry — the dark background makes each silver-gold star seem to float in a night sky."
  },
  {
    id: "hl-silk-015", title: "Lotus Pond Pictorial Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Firdous Rashid", district: "Budgam",
    price: 160000, mrp: 195000, rating: 5.0, reviewCount: 10,
    giId: "GI-JK-SILK-7950", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 700 Knots/Sq.In",
    loomHours: 3800, dimensions: "240 cm × 160 cm (8×5 ft)", stock: 1,
    image: "assets/products/silkrug_15.jpg",
    description: "Pictorial silk carpet depicting a serene Dal Lake lotus pond — lily pads, blossoms, kingfishers and Shikaras hand-knotted in 700 knots per square inch."
  },
  {
    id: "hl-silk-016", title: "Red Tabriz Border Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Shabir Rashid", district: "Budgam",
    price: 125000, mrp: 152000, rating: 4.9, reviewCount: 18,
    giId: "GI-JK-SILK-7967", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 625 Knots/Sq.In",
    loomHours: 2450, dimensions: "213 cm × 137 cm (7×4.5 ft)", stock: 2,
    image: "assets/products/silkrug_16.jpg",
    description: "Classic Tabriz-inspired carpet with a rich red field, ivory-ground main border of palmette scrolls, and multiple guard borders in emerald and gold."
  },
  {
    id: "hl-silk-017", title: "Curvilinear Arabesque Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Abdul Rashid", district: "Budgam",
    price: 148000, mrp: 180000, rating: 4.9, reviewCount: 13,
    giId: "GI-JK-SILK-7984", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 650 Knots/Sq.In",
    loomHours: 2900, dimensions: "240 cm × 150 cm (8×5 ft)", stock: 1,
    image: "assets/products/silkrug_17.jpg",
    description: "Dense curvilinear arabesque and cloud-band design taken directly from a Safavid-era Kashmiri workshop Talim script — 650 kpsi gold and emerald silk."
  },
  {
    id: "hl-silk-018", title: "Mini Silk Prayer Mat",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustadani Ruksana Rashid", district: "Budgam",
    price: 32000, mrp: 40000, rating: 4.7, reviewCount: 38,
    giId: "GI-JK-SILK-8001", giLevel: 2,
    purityMetric: "100% Mulberry Silk • 450 Knots/Sq.In",
    loomHours: 650, dimensions: "90 cm × 60 cm (Mini Prayer)", stock: 5,
    image: "assets/products/silkrug_18.jpg",
    description: "Small but exquisitely detailed silk prayer mat with a floral mihrab and Quranic calligraphy border — a spiritually meaningful heritage gift."
  },
  {
    id: "hl-silk-019", title: "Pastel Floral Garden Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Nazir Ahmad Bhat", district: "Budgam",
    price: 102000, mrp: 125000, rating: 4.8, reviewCount: 22,
    giId: "GI-JK-SILK-8018", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 575 Knots/Sq.In",
    loomHours: 2000, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 2,
    image: "assets/products/silkrug_19.jpg",
    description: "Soft blush, sage, and pearl pastel silk garden rug — an all-over floral garden pattern designed for contemporary interiors that want heritage warmth."
  },
  {
    id: "hl-silk-020", title: "Emerald Qashqai Tribal Silk Rug",
    guild: "silk-rugs", guildLabel: "Silk-on-Silk Rugs",
    artisan: "Ustad Firdous Rashid", district: "Budgam",
    price: 118000, mrp: 143000, rating: 4.8, reviewCount: 20,
    giId: "GI-JK-SILK-8035", giLevel: 3,
    purityMetric: "100% Mulberry Silk • 600 Knots/Sq.In",
    loomHours: 2300, dimensions: "183 cm × 122 cm (6×4 ft)", stock: 2,
    image: "assets/products/silkrug_20.jpg",
    description: "Bold emerald green Qashqai tribal diamond and animal-figure design — raw geometric power of nomadic carpet traditions executed in Kashmiri fine silk."
  },

  /* ── KANI & SOZNI (20 products) ─────────────────────────────────────── */
  {
    id: "hl-kani-001", title: "Dar-i-Kani Jamawar Stole",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Ghulam Qadir Mir", district: "Budgam",
    price: 92000, mrp: 112000, rating: 5.0, reviewCount: 31,
    giId: "GI-JK-KANI-9904", giLevel: 3,
    purityMetric: "13.9 Micron Fleece • 180 Wooden Tujis Bobbins",
    loomHours: 1820, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_01.jpg",
    description: "Woven over 1,800 hours using coded Talim notation and 180 Tujis bobbins — this full-field Jamawar Kani stole carries a laser-etched GI authenticity seal."
  },
  {
    id: "hl-kani-002", title: "Shaheen Eagle Kani Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustad Nazir Ahmad Bhat", district: "Srinagar",
    price: 110000, mrp: 132000, rating: 5.0, reviewCount: 19,
    giId: "GI-JK-KANI-9920", giLevel: 3,
    purityMetric: "13.6 Micron Fleece • 220-Bobbin Full Kani",
    loomHours: 1420, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_02.jpg",
    description: "Masterpiece full-field Kani shawl depicting the mythic Shaheen eagle in flight using 220 Tujis bobbins — a museum-calibre woven painting."
  },
  {
    id: "hl-kani-003", title: "Crimson Full-Field Kani Wrap",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Mohammad Yusuf Mir", district: "Budgam",
    price: 86000, mrp: 105000, rating: 4.9, reviewCount: 24,
    giId: "GI-JK-KANI-9936", giLevel: 3,
    purityMetric: "14.0 Micron • 160-Bobbin Full Kani",
    loomHours: 1600, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_03.jpg",
    description: "Rich crimson ground full-field Kani wrap with gold and ivory Badam paisley motifs densely covering the entire shawl surface — royal bridal heirloom."
  },
  {
    id: "hl-kani-004", title: "Moonlit Ivory Kani Border Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Hameeda Kani", district: "Budgam",
    price: 68000, mrp: 84000, rating: 4.8, reviewCount: 32,
    giId: "GI-JK-KANI-9952", giLevel: 3,
    purityMetric: "14.2 Micron Pashmina • 90-Bobbin Kani Border",
    loomHours: 980, dimensions: "205 cm × 102 cm", stock: 3,
    image: "assets/products/sozni_04.jpg",
    description: "Soft ivory pashmina field with a wide 20 cm Kani-woven border in peacock and floral motifs — 90 Tujis bobbins, Talim script, and GI seal."
  },
  {
    id: "hl-kani-005", title: "Aubergine Badam Kani Stole",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Ghulam Qadir Mir", district: "Budgam",
    price: 78000, mrp: 95000, rating: 4.9, reviewCount: 27,
    giId: "GI-JK-KANI-9968", giLevel: 3,
    purityMetric: "13.8 Micron • 140-Bobbin Full Kani",
    loomHours: 1350, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_05.jpg",
    description: "Deep aubergine purple full-field Kani stole with copper, gold, and ivory Badam paisley — woven with 140 Tujis bobbins per Talim script notation."
  },
  {
    id: "hl-kani-006", title: "Sozni Needle Chinar Embroidered Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Fatima Zargar", district: "Pulwama",
    price: 56000, mrp: 70000, rating: 4.9, reviewCount: 36,
    giId: "GI-JK-KANI-9984", giLevel: 3,
    purityMetric: "14.1 Micron • Full-Body Sozni Chinar Needle Work",
    loomHours: 720, dimensions: "205 cm × 100 cm", stock: 3,
    image: "assets/products/sozni_06.jpg",
    description: "Full Sozni single-needle embroidered shawl with Chinar, tulip, and lotus covering every inch of a natural ivory pashmina ground."
  },
  {
    id: "hl-kani-007", title: "Teal Peacock Kani Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustad Bashir Ahmad Lone", district: "Budgam",
    price: 95000, mrp: 115000, rating: 5.0, reviewCount: 21,
    giId: "GI-JK-KANI-0001", giLevel: 3,
    purityMetric: "13.7 Micron • 200-Bobbin Peacock Kani Field",
    loomHours: 1750, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_07.jpg",
    description: "Teal and gold full-field Kani shawl with sprawling peacock motifs in display pose — 200 Tujis bobbins and 1,750 loom hours of encoded weaving artistry."
  },
  {
    id: "hl-kani-008", title: "Emerald Forest Sozni Stole",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Ruksana Naqshbandi", district: "Srinagar",
    price: 62000, mrp: 76000, rating: 4.8, reviewCount: 30,
    giId: "GI-JK-KANI-0017", giLevel: 3,
    purityMetric: "14.0 Micron • Dense Sozni Forest & Wildlife",
    loomHours: 800, dimensions: "205 cm × 102 cm", stock: 3,
    image: "assets/products/sozni_08.jpg",
    description: "Emerald green pashmina with full-body Sozni needle embroidery depicting a Himalayan forest scene — snow leopard, deodar trees, and mountain flowers."
  },
  {
    id: "hl-kani-009", title: "Wedding Gold Zari Kani Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Ghulam Hassan", district: "Budgam",
    price: 145000, mrp: 175000, rating: 5.0, reviewCount: 14,
    giId: "GI-JK-KANI-0033", giLevel: 3,
    purityMetric: "13.5 Micron • 24K Zari Thread Kani Weave",
    loomHours: 2200, dimensions: "210 cm × 108 cm", stock: 1,
    image: "assets/products/sozni_09.jpg",
    description: "Bridal masterpiece — full-field Kani woven with genuine 24K gold Zari thread Tujis bobbins on an ivory pashmina ground — presented in a heritage box."
  },
  {
    id: "hl-kani-010", title: "Sozni Jamawar Wall Tapestry",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Nazir Ahmad Wani", district: "Srinagar",
    price: 185000, mrp: 225000, rating: 5.0, reviewCount: 9,
    giId: "GI-JK-KANI-0049", giLevel: 3,
    purityMetric: "Full-Field Kani + Sozni Overlay • 2 Artisan Techniques",
    loomHours: 2800, dimensions: "120 cm × 180 cm (Tapestry)", stock: 1,
    image: "assets/products/sozni_10.jpg",
    description: "A unique combination of full-field Kani weaving plus post-weave Sozni needle embroidery overlay — the rarest dual-technique Kashmiri textile ever made."
  },
  {
    id: "hl-kani-011", title: "Rose Garden Sozni Dupatta",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Nasreen Zargar", district: "Shopian",
    price: 38000, mrp: 46000, rating: 4.7, reviewCount: 44,
    giId: "GI-JK-KANI-0065", giLevel: 2,
    purityMetric: "14.3 Micron • Sozni Rose Field Dupatta",
    loomHours: 420, dimensions: "250 cm × 110 cm (Dupatta)", stock: 4,
    image: "assets/products/sozni_11.jpg",
    description: "Long pashmina dupatta with an all-over rose garden Sozni embroidery on a soft blush field — stitched by Shopian women artisans over four months."
  },
  {
    id: "hl-kani-012", title: "Sunrise Badam Border Kani Stole",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustad Mohammad Yusuf Mir", district: "Budgam",
    price: 72000, mrp: 88000, rating: 4.8, reviewCount: 28,
    giId: "GI-JK-KANI-0081", giLevel: 3,
    purityMetric: "13.9 Micron • 100-Bobbin Sunrise Border Kani",
    loomHours: 1100, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_12.jpg",
    description: "Sunrise-inspired colour gradient — saffron to amber to ivory — with a wide Kani-woven Badam border and complementing scattered Badam field accents."
  },
  {
    id: "hl-kani-013", title: "Black & Gold Kani Jamawar Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Ghulam Qadir Mir", district: "Budgam",
    price: 102000, mrp: 125000, rating: 5.0, reviewCount: 22,
    giId: "GI-JK-KANI-0097", giLevel: 3,
    purityMetric: "14.0 Micron • 170-Bobbin Black & Gold Kani",
    loomHours: 1680, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_13.jpg",
    description: "Dramatic black pashmina ground with gold Kani-woven Jamawar motifs — formal, theatrical, and entirely hand-woven over 1,680 loom hours."
  },
  {
    id: "hl-kani-014", title: "Copper Lotus Sozni Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Fatima Zargar", district: "Pulwama",
    price: 48000, mrp: 58000, rating: 4.7, reviewCount: 39,
    giId: "GI-JK-KANI-0113", giLevel: 2,
    purityMetric: "14.2 Micron • Lotus & Water Lily Sozni",
    loomHours: 520, dimensions: "205 cm × 102 cm", stock: 4,
    image: "assets/products/sozni_14.jpg",
    description: "Warm copper ground pashmina embroidered with water-lily and lotus Sozni needle work — a serene botanical design inspired by Kashmir's lake ecology."
  },
  {
    id: "hl-kani-015", title: "Miniature Kani Coin Purse Set",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Hameeda Kani", district: "Budgam",
    price: 12000, mrp: 15500, rating: 4.6, reviewCount: 72,
    giId: "GI-JK-KANI-0129", giLevel: 2,
    purityMetric: "Mini Kani Woven Fabric • Heritage Coin Purse",
    loomHours: 110, dimensions: "12 cm × 9 cm (Set of 3)", stock: 7,
    image: "assets/products/sozni_15.jpg",
    description: "Set of three miniature Kani-woven coin purses — each in a different colourway using the same Talim-coded weave as a full shawl, in gifting format."
  },
  {
    id: "hl-kani-016", title: "Violet Floral Kani Stole",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Bashir Ahmad Lone", district: "Budgam",
    price: 82000, mrp: 100000, rating: 4.8, reviewCount: 26,
    giId: "GI-JK-KANI-0145", giLevel: 3,
    purityMetric: "13.8 Micron • 150-Bobbin Violet Floral Kani",
    loomHours: 1400, dimensions: "210 cm × 105 cm", stock: 2,
    image: "assets/products/sozni_16.jpg",
    description: "Violet-purple pashmina field densely filled with Kani-woven spring blossoms — roses, narcissus, and tulips — using 150 hand-carved wooden Tujis bobbins."
  },
  {
    id: "hl-kani-017", title: "Sozni Birds-in-Blossoms Stole",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Zareena Bano", district: "Srinagar",
    price: 44000, mrp: 54000, rating: 4.7, reviewCount: 46,
    giId: "GI-JK-KANI-0161", giLevel: 2,
    purityMetric: "14.1 Micron • Bird-Blossom Sozni Scatter",
    loomHours: 460, dimensions: "205 cm × 100 cm", stock: 4,
    image: "assets/products/sozni_17.jpg",
    description: "Soft sage green pashmina with scattered birds-among-blossoms Sozni single-needle embroidery — bulbuls, hoopoes, and firebirds in cherry and plum."
  },
  {
    id: "hl-kani-018", title: "Heirloom Tabard Kani Jacket",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Ghulam Hassan", district: "Budgam",
    price: 165000, mrp: 200000, rating: 5.0, reviewCount: 8,
    giId: "GI-JK-KANI-0177", giLevel: 3,
    purityMetric: "Full-Field Kani Fabric • Tailored Jacket Form",
    loomHours: 2600, dimensions: "Custom tailored (S/M/L)", stock: 1,
    image: "assets/products/sozni_18.jpg",
    description: "Unique full-field Kani woven fabric tailored into a sleeveless tabard jacket — the rarest wearable form of Jamawar craftsmanship, made to order."
  },
  {
    id: "hl-kani-019", title: "Five-Colour Kani Suzani Panel",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Master Nazir Ahmad Wani", district: "Srinagar",
    price: 125000, mrp: 152000, rating: 4.9, reviewCount: 15,
    giId: "GI-JK-KANI-0193", giLevel: 3,
    purityMetric: "Five Dye-Lot Kani • Central Field Suzani Panel",
    loomHours: 2000, dimensions: "150 cm × 100 cm (Panel)", stock: 1,
    image: "assets/products/sozni_19.jpg",
    description: "A flat Suzani-format Kani panel in five harmonious natural dye colours — designed for framing and display as a woven painting in lieu of canvas art."
  },
  {
    id: "hl-kani-020", title: "Cream & Saffron Sozni Shawl",
    guild: "sozni", guildLabel: "Kani Jamawar & Sozni",
    artisan: "Ustadani Ruksana Naqshbandi", district: "Srinagar",
    price: 52000, mrp: 64000, rating: 4.8, reviewCount: 34,
    giId: "GI-JK-KANI-0209", giLevel: 2,
    purityMetric: "14.1 Micron • Saffron & Cream Sozni All-Over",
    loomHours: 560, dimensions: "205 cm × 102 cm", stock: 4,
    image: "assets/products/sozni_20.jpg",
    description: "Creamy ivory ground lit with warm saffron Sozni embroidery — a colour palette inspired by Kashmir's crocus harvest fields at dawn, stitched over five months."
  }

];

const COUPONS = {
  VALLEY10: { code: "VALLEY10", type: "percent", value: 10, desc: "10% Direct Valley Heritage Privilege" },
  FIRSTCRAFT: { code: "FIRSTCRAFT", type: "flat", value: 2500, desc: "₹2,500 First Collectors Grant" },
  HERITAGE5000: { code: "HERITAGE5000", type: "flat", value: 5000, desc: "₹5,000 Heirloom Loom Patronage" }
};

/* Safe localStorage Wrapper */
function loadStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* Ignore quota/sandbox storage restrictions */
  }
}

/* Global Application State */
const DEFAULT_BUYER = {
  name: "Priya",
  fullName: "Priya Sharma",
  email: "priya.sharma@valleycollector.in",
  role: "buyer",
  title: "Verified Valley Collector • J&K",
  badge: "PS",
  isLoggedIn: true
};

const AppState = {
  currentUser: loadStorage("hunarlink_auth_user", DEFAULT_BUYER),
  customProducts: loadStorage("hunarlink_custom_products", []),
  cart: loadStorage("hunarlink_cart", []),
  savedLater: loadStorage("hunarlink_saved_later", []),
  wishlist: loadStorage("hunarlink_wishlist", ["hl-kani-004", "hl-papr-003", "hl-waln-001"]),
  appliedCoupon: loadStorage("hunarlink_coupon", null),
  compareList: [],
  addresses: loadStorage("hunarlink_addresses", [
    {
      id: "addr-1",
      name: "Demo Collector",
      phone: "0000000000",
      pincode: "000000",
      locality: "Demo Address",
      city: "Sample City",
      type: "Home"
    }
  ]),
  selectedAddressId: "addr-1",
  orders: loadStorage("hunarlink_orders", [
    {
      id: "HL-ORD-2026-7814",
      date: "12 Nov 2026",
      items: [{ title: "Shahi Gulab-dan Urn", qty: 1, price: 850, giId: "GI-JK-PAPR-3109" }],
      total: 850,
      paymentMethod: "UPI Verified Escrow",
      address: "Demo Address, Sample City - 000000",
      stage: 3
    }
  ]),
  reviews: loadStorage("hunarlink_reviews", {
    "hl-pash-001": [
      { author: "Dr. Meenakshi Kaul", rating: 5, date: "08 Nov 2026", comment: "Verified the GI QR tag on receipt. Featherlight Changthangi warmth and extraordinary Sozni needlework." },
      { author: "Rohan Mehta", rating: 5, date: "02 Nov 2026", comment: "Direct from Master Ghulam Qadir Mir's loom with full lab micron report included." }
    ]
  }),
  b2bQuotes: loadStorage("hunarlink_b2b_quotes", []),
  filters: {
    search: "",
    guild: "all",
    artisan: "",
    maxPrice: 125000,
    minRating: 0,
    giTier: 0,
    district: "all",
    sortBy: "featured"
  },
  activeProductModalId: null,
  checkoutStep: 1
};

function getAllProducts() {
  const custom = loadStorage("hunarlink_custom_products", AppState.customProducts || []);
  const overrides = loadStorage("hunarlink_product_overrides", {});
  const merged = [...custom, ...SEED_PRODUCTS].map(p => {
    const ov = overrides && overrides[p.id];
    return ov ? { ...p, ...ov } : p;
  });
  return merged.filter(p => p.status !== "paused");
}

function getProductById(id) {
  return getAllProducts().find(p => p.id === id) || getAllProducts()[0];
}

function formatINR(num) {
  const n = Math.round(Number(num) || 0);
  return "₹" + n.toLocaleString("en-IN");
}

/* Toast Notification Helper */
function showToast(message) {
  const stack = document.getElementById("toast-container");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => {
    item.remove();
  }, 3200);
}

/* ==========================================================================
   Catalog Filtering, Search & Rendering
   ========================================================================== */
function getFilteredProducts() {
  const f = AppState.filters;
  const q = f.search.trim().toLowerCase();

  let list = getAllProducts().filter(p => {
    if (q) {
      const hay = `${p.title} ${p.guildLabel} ${p.artisan} ${p.district} ${p.giId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.guild !== "all" && p.guild !== f.guild) return false;
    if (f.artisan && p.artisan !== f.artisan) return false;
    if (p.price > f.maxPrice) return false;
    if (f.minRating > 0 && p.rating < f.minRating) return false;
    if (f.giTier > 0 && p.giLevel < f.giTier) return false;
    if (f.district !== "all" && p.district !== f.district) return false;
    return true;
  });

  if (f.sortBy === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (f.sortBy === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (f.sortBy === "rating-desc") list.sort((a, b) => b.rating - a.rating);
  else if (f.sortBy === "hours-desc") list.sort((a, b) => b.loomHours - a.loomHours);

  return list;
}

function renderMarketplace() {
  const grid = document.getElementById("product-grid");
  const summary = document.getElementById("results-summary");
  const chipsWrap = document.getElementById("active-filter-chips");
  if (!grid) return;

  const products = getFilteredProducts();
  if (summary) {
    summary.textContent = `Showing ${products.length} of ${getAllProducts().length} GI-Certified Valley Treasures`;
  }

  /* Update category pills */
  document.querySelectorAll(".cat-pill-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === AppState.filters.guild);
  });

  /* Update guild bento highlight */
  document.querySelectorAll(".guild-bento-card").forEach(card => {
    card.classList.toggle("active-guild", card.dataset.guild === AppState.filters.guild);
  });

  /* Render active filter chips */
  if (chipsWrap) {
    const chips = [];
    if (AppState.filters.guild !== "all") chips.push(`Guild: ${AppState.filters.guild.toUpperCase()}`);
    if (AppState.filters.artisan) chips.push(`Artisan: ${AppState.filters.artisan}`);
    if (AppState.filters.search) chips.push(`Search: "${AppState.filters.search}"`);
    if (AppState.filters.maxPrice < 125000) chips.push(`Max: ${formatINR(AppState.filters.maxPrice)}`);
    if (AppState.filters.district !== "all") chips.push(`Cluster: ${AppState.filters.district}`);
    chipsWrap.innerHTML = chips.map(c => `<span class="filter-chip-tag">${c}</span>`).join("");
  }

  if (products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; background: #FFF; padding: 42px; text-align: center; border-radius: 12px; border: 1px solid var(--border-light);">
        <h3 style="font-family: var(--font-serif); font-size: 1.5rem; margin-bottom: 8px;">No Matching Heirloom Crafts Found</h3>
        <p style="font-size: 0.86rem; color: var(--text-500); margin-bottom: 16px;">Try broadening your price slider or resetting active guild filters.</p>
        <button type="button" class="btn-primary-forest" onclick="resetAllFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => {
    const isWished = AppState.wishlist.includes(p.id);
    const isCompared = AppState.compareList.includes(p.id);
    const discountPct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
    return `
      <article class="product-card" data-product-id="${p.id}">
        <div class="product-img-wrap" onclick="openProductPage('${p.id}')">
          <img loading="lazy" decoding="async" src="${p.image}" alt="${p.title}">
          <span class="product-gi-pill">✓ ${p.giId}</span>
          <button type="button" class="product-wish-btn ${isWished ? "wishlisted" : ""}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')" aria-label="Toggle Wishlist">
            ${isWished ? "♥" : "♡"}
          </button>
          <label class="product-compare-bar" onclick="event.stopPropagation();">
            <input type="checkbox" ${isCompared ? "checked" : ""} onchange="toggleCompare('${p.id}')">
            Compare
          </label>
        </div>
        <div class="product-body">
          <div class="product-meta-top">
            <span class="product-guild-tag">${p.guildLabel}</span>
            <span class="product-rating-badge">${p.rating.toFixed(1)} ★ (${p.reviewCount})</span>
          </div>
          <button type="button" class="product-title-btn" onclick="openProductPage('${p.id}')">${p.title}</button>
          <p class="product-artisan-line">by ${p.artisan} • ${p.district}</p>
          <div style="font-size: 0.7rem; color: var(--forest-700); background: var(--forest-50); padding: 4px 8px; border-radius: 4px; margin-bottom: 10px;">
            🔬 ${p.purityMetric}
          </div>
          <div class="product-footer-row">
            <div>
              <div class="price-kicker">Direct Artisan Price (${discountPct}% Off)</div>
              <div>
                <span class="price-main">${formatINR(p.price)}</span>
                <span class="price-mrp">${formatINR(p.mrp)}</span>
              </div>
            </div>
          </div>
          <div class="product-card-actions">
            <button type="button" class="btn-card-cart" onclick="event.stopPropagation(); addToCart('${p.id}', 1)" title="Add ${p.title} to Bag" aria-label="Add ${p.title} to Cart">
              <span class="btn-icon">🛍️</span> Add to Cart
            </button>
            <button type="button" class="btn-card-buy" onclick="event.stopPropagation(); buyNow('${p.id}')" title="Buy ${p.title} Now" aria-label="Buy ${p.title} Now">
              <span class="btn-icon">⚡</span> Buy Now
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function setCategoryFilter(guildKey, scrollToGrid = false) {
  AppState.filters.guild = guildKey;
  AppState.filters.artisan = "";
  renderMarketplace();
  if (scrollToGrid) {
    const el = document.getElementById("marketplace-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }
}

function resetAllFilters() {
  AppState.filters = {
    search: "",
    guild: "all",
    artisan: "",
    maxPrice: 125000,
    minRating: 0,
    giTier: 0,
    district: "all",
    sortBy: "featured"
  };
  const sInput = document.getElementById("global-search-input");
  if (sInput) sInput.value = "";
  const pSlider = document.getElementById("price-range-slider");
  if (pSlider) pSlider.value = "125000";
  const pLabel = document.getElementById("price-slider-val");
  if (pLabel) pLabel.textContent = "Up to ₹1,25,000";
  const rSelect = document.getElementById("rating-filter");
  if (rSelect) rSelect.value = "0";
  const gSelect = document.getElementById("gi-tier-filter");
  if (gSelect) gSelect.value = "0";
  const dSelect = document.getElementById("district-filter");
  if (dSelect) dSelect.value = "all";
  const sortSel = document.getElementById("sort-select");
  if (sortSel) sortSel.value = "featured";

  renderMarketplace();
  showToast("All marketplace filters reset");
}

/* ==========================================================================
   Cart, "Save for Later", Coupons & Wishlist
   ========================================================================== */
function updateHeaderBadges() {
  const cartCountEl = document.getElementById("cart-count");
  const wishCountEl = document.getElementById("wishlist-count");
  const totalCartQty = AppState.cart.reduce((sum, item) => sum + item.qty, 0);
  if (cartCountEl) cartCountEl.textContent = String(totalCartQty);
  if (wishCountEl) wishCountEl.textContent = String(AppState.wishlist.length);
}

function calculateCartTotals() {
  let totalMrp = 0;
  let sellingSubtotal = 0;
  let itemCount = 0;

  AppState.cart.forEach(entry => {
    const p = getProductById(entry.productId);
    if (p) {
      totalMrp += p.mrp * entry.qty;
      sellingSubtotal += p.price * entry.qty;
      itemCount += entry.qty;
    }
  });

  const artisanDiscount = totalMrp - sellingSubtotal;
  let couponDiscount = 0;
  if (AppState.appliedCoupon && COUPONS[AppState.appliedCoupon] && sellingSubtotal > 0) {
    const c = COUPONS[AppState.appliedCoupon];
    couponDiscount = c.type === "percent" ? Math.round(sellingSubtotal * (c.value / 100)) : c.value;
    if (couponDiscount > sellingSubtotal * 0.4) couponDiscount = Math.round(sellingSubtotal * 0.4);
  }

  const netPayable = Math.max(0, sellingSubtotal - couponDiscount);
  return { totalMrp, sellingSubtotal, artisanDiscount, couponDiscount, netPayable, itemCount };
}

function addToCart(productId, qty = 1) {
  const existing = AppState.cart.find(item => item.productId === productId);
  if (existing) {
    existing.qty = Math.min(5, existing.qty + qty);
  } else {
    AppState.cart.push({ productId, qty });
  }
  saveStorage("hunarlink_cart", AppState.cart);
  updateHeaderBadges();
  renderCartDrawer();
  const p = getProductById(productId);
  showToast(`Added "${p.title}" to your Valley Acquisition Bag`);
}

function buyNow(productId) {
  closeModal("product-detail-modal");
  closeModal("compare-modal");
  addToCart(productId, 1);
  openCheckoutWizard();
}
window.buyNow = buyNow;

function changeCartQty(productId, delta) {
  const idx = AppState.cart.findIndex(i => i.productId === productId);
  if (idx === -1) return;
  AppState.cart[idx].qty += delta;
  if (AppState.cart[idx].qty <= 0) {
    AppState.cart.splice(idx, 1);
  }
  saveStorage("hunarlink_cart", AppState.cart);
  updateHeaderBadges();
  renderCartDrawer();
}

function removeFromCart(productId) {
  AppState.cart = AppState.cart.filter(i => i.productId !== productId);
  saveStorage("hunarlink_cart", AppState.cart);
  updateHeaderBadges();
  renderCartDrawer();
  showToast("Removed item from cart");
}

function saveForLater(productId) {
  AppState.cart = AppState.cart.filter(i => i.productId !== productId);
  if (!AppState.savedLater.includes(productId)) {
    AppState.savedLater.push(productId);
  }
  saveStorage("hunarlink_cart", AppState.cart);
  saveStorage("hunarlink_saved_later", AppState.savedLater);
  updateHeaderBadges();
  renderCartDrawer();
  showToast("Moved item to Saved for Later");
}

function moveSavedToCart(productId) {
  AppState.savedLater = AppState.savedLater.filter(id => id !== productId);
  saveStorage("hunarlink_saved_later", AppState.savedLater);
  addToCart(productId, 1);
}

function applyCouponCode(rawCode) {
  const input = document.getElementById("coupon-code-input");
  const code = (rawCode || (input ? input.value : "")).trim().toUpperCase();
  if (!code || !COUPONS[code]) {
    showToast("Invalid code. Try VALLEY10, FIRSTCRAFT, or HERITAGE5000");
    return;
  }
  AppState.appliedCoupon = code;
  saveStorage("hunarlink_coupon", code);
  renderCartDrawer();
  showToast(`Applied ${code}: ${COUPONS[code].desc}`);
}

function removeCouponCode() {
  AppState.appliedCoupon = null;
  saveStorage("hunarlink_coupon", null);
  renderCartDrawer();
  showToast("Removed promotional code");
}

function renderCartDrawer() {
  const body = document.getElementById("cart-drawer-body");
  const footer = document.getElementById("cart-drawer-footer");
  if (!body || !footer) return;

  const totals = calculateCartTotals();

  const itemsHtml = AppState.cart.length === 0
    ? `<div style="text-align: center; padding: 32px 12px; color: var(--text-500);">
         <p style="font-family: var(--font-serif); font-size: 1.25rem; color: var(--forest-900); margin-bottom: 6px;">Your Acquisition Bag is Empty</p>
         <p style="font-size: 0.8rem;">Explore GI-certified Kashmiri shawls, rugs, walnut wood, and papier-mâché treasures.</p>
       </div>`
    : AppState.cart.map(entry => {
        const p = getProductById(entry.productId);
        return `
          <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-light);">
            <img loading="lazy" decoding="async" src="${p.image}" alt="${p.title}" style="width: 68px; height: 68px; border-radius: 8px; object-fit: cover;">
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 0.88rem; color: var(--forest-950);">${p.title}</div>
              <div style="font-size: 0.72rem; color: var(--text-500);">${p.giId} • ${p.artisan}</div>
              <div style="font-weight: 700; font-size: 0.86rem; color: var(--forest-900); margin-top: 4px;">
                ${formatINR(p.price * entry.qty)}
                <span style="font-size: 0.72rem; color: var(--text-400); text-decoration: line-through;">${formatINR(p.mrp * entry.qty)}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                <div style="display: inline-flex; align-items: center; border: 1px solid var(--border-mid); border-radius: 4px;">
                  <button type="button" style="padding: 2px 8px; font-weight: 700;" onclick="changeCartQty('${p.id}', -1)">−</button>
                  <span style="padding: 2px 8px; font-size: 0.78rem; font-weight: 700;">${entry.qty}</span>
                  <button type="button" style="padding: 2px 8px; font-weight: 700;" onclick="changeCartQty('${p.id}', 1)">+</button>
                </div>
                <button type="button" style="font-size: 0.72rem; color: var(--forest-700); font-weight: 600;" onclick="saveForLater('${p.id}')">Save for Later</button>
                <button type="button" style="font-size: 0.72rem; color: var(--danger-600); font-weight: 600;" onclick="removeFromCart('${p.id}')">Remove</button>
              </div>
            </div>
          </div>
        `;
      }).join("");

  const savedHtml = AppState.savedLater.length > 0
    ? `<div style="margin-top: 18px; padding-top: 12px; border-top: 2px dashed var(--border-mid);">
         <div style="font-size: 0.76rem; font-weight: 700; text-transform: uppercase; color: var(--text-500); margin-bottom: 8px;">Saved for Later (${AppState.savedLater.length})</div>
         ${AppState.savedLater.map(id => {
           const p = getProductById(id);
           return `
             <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--bg-ivory); font-size: 0.8rem;">
               <div>
                 <div style="font-weight: 600;">${p.title}</div>
                 <div style="color: var(--text-500); font-size: 0.72rem;">${formatINR(p.price)}</div>
               </div>
               <button type="button" class="btn-outline-ivory" style="padding: 5px 10px; font-size: 0.7rem;" onclick="moveSavedToCart('${p.id}')">Move to Cart</button>
             </div>
           `;
         }).join("")}
       </div>`
    : "";

  body.innerHTML = `
    <div style="background: var(--forest-50); border: 1px solid var(--forest-600); padding: 9px 12px; border-radius: 8px; font-size: 0.74rem; color: var(--forest-900); margin-bottom: 12px;">
      🤝 <strong>Zero Commission Guarantee:</strong> 100% of net craft value goes directly to the registered Kashmiri artisan loom.
    </div>
    ${itemsHtml}
    <div style="margin-top: 14px; background: var(--bg-ivory); padding: 12px; border-radius: 8px; border: 1px solid var(--border-light);">
      <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Apply Valley Privilege Coupon</div>
      <div style="display: flex; gap: 6px;">
        <input type="text" id="coupon-code-input" placeholder="e.g. VALLEY10 or FIRSTCRAFT" value="${AppState.appliedCoupon || ""}" style="flex: 1; padding: 7px 10px; border: 1px solid var(--border-mid); border-radius: 4px; font-size: 0.78rem;">
        <button type="button" class="btn-acquire" onclick="applyCouponCode()">Apply</button>
      </div>
      <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
        <button type="button" style="font-size: 0.68rem; background: #FFF; border: 1px solid var(--border-mid); padding: 3px 8px; border-radius: 4px;" onclick="applyCouponCode('VALLEY10')">VALLEY10 (10% Off)</button>
        <button type="button" style="font-size: 0.68rem; background: #FFF; border: 1px solid var(--border-mid); padding: 3px 8px; border-radius: 4px;" onclick="applyCouponCode('FIRSTCRAFT')">FIRSTCRAFT (₹2,500 Off)</button>
        ${AppState.appliedCoupon ? `<button type="button" style="font-size: 0.68rem; color: var(--danger-600); font-weight: 700;" onclick="removeCouponCode()">Remove Coupon</button>` : ""}
      </div>
    </div>
    ${savedHtml}
  `;

  footer.innerHTML = `
    <div style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between;">
        <span>Total MRP (${totals.itemCount} items)</span>
        <span>${formatINR(totals.totalMrp)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; color: var(--success-600);">
        <span>Direct Artisan Loom Savings</span>
        <span>− ${formatINR(totals.artisanDiscount)}</span>
      </div>
      ${totals.couponDiscount > 0 ? `
        <div style="display: flex; justify-content: space-between; color: var(--success-600); font-weight: 600;">
          <span>Coupon (${AppState.appliedCoupon})</span>
          <span>− ${formatINR(totals.couponDiscount)}</span>
        </div>
      ` : ""}
      <div style="display: flex; justify-content: space-between;">
        <span>Insured GI-Sealed Transit</span>
        <span style="color: var(--success-600); font-weight: 700;">FREE</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: 700; color: var(--forest-950); padding-top: 8px; border-top: 1px solid var(--border-mid);">
        <span>Net Payable</span>
        <span>${formatINR(totals.netPayable)}</span>
      </div>
    </div>
    <button type="button" class="btn-primary-forest" style="width: 100%; justify-content: center;" ${AppState.cart.length === 0 ? "disabled" : ""} onclick="openCheckoutWizard()">
      Proceed to Insured Checkout →
    </button>
  `;
}

function toggleWishlist(productId) {
  const idx = AppState.wishlist.indexOf(productId);
  const p = getProductById(productId);
  if (idx > -1) {
    AppState.wishlist.splice(idx, 1);
    showToast(`Removed "${p.title}" from Wishlist`);
  } else {
    AppState.wishlist.push(productId);
    showToast(`Saved "${p.title}" to Wishlist`);
  }
  saveStorage("hunarlink_wishlist", AppState.wishlist);
  updateHeaderBadges();
  renderMarketplace();
  renderWishlistDrawer();
}

function renderWishlistDrawer() {
  const body = document.getElementById("wishlist-drawer-body");
  if (!body) return;
  if (AppState.wishlist.length === 0) {
    body.innerHTML = `<p style="text-align: center; padding: 36px 12px; color: var(--text-500); font-size: 0.85rem;">No heirloom pieces saved in your Wishlist yet.</p>`;
    return;
  }
  body.innerHTML = AppState.wishlist.map(id => {
    const p = getProductById(id);
    return `
      <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-light); align-items: center;">
        <img loading="lazy" decoding="async" src="${p.image}" alt="${p.title}" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.86rem;">${p.title}</div>
          <div style="font-size: 0.72rem; color: var(--text-500);">${p.artisan} • ${formatINR(p.price)}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <button type="button" class="btn-acquire" style="font-size: 0.7rem; padding: 5px 10px;" onclick="addToCart('${p.id}', 1); toggleWishlist('${p.id}')">Move to Bag</button>
          <button type="button" style="font-size: 0.68rem; color: var(--danger-600);" onclick="toggleWishlist('${p.id}')">Remove</button>
        </div>
      </div>
    `;
  }).join("");
}

function toggleDrawer(drawerId, open) {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;
  if (drawerId === "cart-drawer") renderCartDrawer();
  if (drawerId === "wishlist-drawer") renderWishlistDrawer();
  drawer.classList.toggle("open", open);
}

/* ==========================================================================
   Product Detail Page (PDP) Navigation & Recently Viewed Tracking
   ========================================================================== */
function addToRecentlyViewed(productId) {
  try {
    let recent = loadStorage("hunarlink_recently_viewed", []);
    recent = recent.filter(id => id !== productId);
    recent.unshift(productId);
    if (recent.length > 12) recent = recent.slice(0, 12);
    saveStorage("hunarlink_recently_viewed", recent);
  } catch (err) {}
}

function getRecentlyViewedProducts() {
  const ids = loadStorage("hunarlink_recently_viewed", []);
  return ids.map(id => getProductById(id)).filter(Boolean);
}

function clearRecentlyViewed() {
  saveStorage("hunarlink_recently_viewed", []);
  if (typeof renderPdpRecentViewed === "function") {
    renderPdpRecentViewed();
  }
  if (typeof renderHomeRecentViewed === "function") {
    renderHomeRecentViewed();
  }
  showToast("Recently viewed history cleared");
}

function openProductPage(productId) {
  addToRecentlyViewed(productId);
  window.open(`product.html?id=${productId}`, "_blank");
}

function renderHomeRecentViewed() {
  const wrap = document.getElementById("home-recent-wrapper");
  const grid = document.getElementById("home-recent-grid");
  if (!wrap || !grid) return;

  const recent = getRecentlyViewedProducts().slice(0, 4);
  if (recent.length === 0) {
    wrap.style.display = "none";
    grid.innerHTML = "";
    return;
  }

  wrap.style.display = "block";
  grid.innerHTML = recent.map(p => {
    const isWished = AppState.wishlist.includes(p.id);
    const isCompared = AppState.compareList.includes(p.id);
    const discountPct = Math.round(((p.mrp - p.price) / p.mrp) * 100);
    return `
      <article class="product-card" data-product-id="${p.id}">
        <div class="product-img-wrap" onclick="openProductPage('${p.id}')">
          <img src="${p.image}" alt="${p.title}" loading="lazy">
          <span class="product-gi-pill">✓ ${p.giId}</span>
          <button type="button" class="product-wish-btn ${isWished ? "wishlisted" : ""}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')" aria-label="Toggle Wishlist">
            ${isWished ? "♥" : "♡"}
          </button>
          <label class="product-compare-bar" onclick="event.stopPropagation();">
            <input type="checkbox" ${isCompared ? "checked" : ""} onchange="toggleCompare('${p.id}')">
            Compare
          </label>
        </div>
        <div class="product-body">
          <div class="product-meta-top">
            <span class="product-guild-tag">${p.guildLabel}</span>
            <span class="product-rating-badge">${p.rating.toFixed(1)} ★ (${p.reviewCount})</span>
          </div>
          <button type="button" class="product-title-btn" onclick="openProductPage('${p.id}')">${p.title}</button>
          <p class="product-artisan-line">by ${p.artisan} • ${p.district}</p>
          <div class="product-footer-row">
            <div>
              <div class="price-kicker">Direct Artisan Price (${discountPct}% Off)</div>
              <div>
                <span class="price-main">${formatINR(p.price)}</span>
                <span class="price-mrp">${formatINR(p.mrp)}</span>
              </div>
            </div>
          </div>
          <div class="product-card-actions">
            <button type="button" class="btn-card-cart" onclick="event.stopPropagation(); addToCart('${p.id}', 1)" title="Add ${p.title} to Bag">
              <span class="btn-icon">🛍️</span> Add to Cart
            </button>
            <button type="button" class="btn-card-buy" onclick="event.stopPropagation(); buyNow('${p.id}')" title="Buy ${p.title} Now">
              <span class="btn-icon">⚡</span> Buy Now
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

window.addToRecentlyViewed = addToRecentlyViewed;
window.getRecentlyViewedProducts = getRecentlyViewedProducts;
window.clearRecentlyViewed = clearRecentlyViewed;
window.openProductPage = openProductPage;
window.renderHomeRecentViewed = renderHomeRecentViewed;

/* ==========================================================================
   Product Detail Modal, Texture Zoom, Pincode Estimator & Reviews
   ========================================================================== */
function openProductModal(productId) {
  const p = getProductById(productId);
  if (!p) return;
  AppState.activeProductModalId = p.id;
  const modal = document.getElementById("product-detail-modal");
  const content = document.getElementById("product-detail-body");
  if (!modal || !content) return;

  const prodReviews = AppState.reviews[p.id] || [
    { author: "Verified Collector (New Delhi)", rating: 5, date: "19 Oct 2026", comment: "Authenticated via HunarLink GI Registry QR. Museum-grade craftsmanship." }
  ];

  content.innerHTML = `
    <div class="pdp-grid">
      <div>
        <div class="zoom-stage" id="pdp-zoom-stage" onmousemove="handleZoomMove(event)" onmouseleave="resetZoomMove()">
          <img loading="lazy" decoding="async" src="${p.image}" id="pdp-main-img" alt="${p.title}">
          <span class="zoom-hint-pill">🔍 Hover to Inspect Macro Weave / Grain</span>
        </div>
        <div class="craft-passport-box">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 0.78rem; color: var(--forest-900);">🛡️ DIGITAL CRAFT PASSPORT (3-TIER VERIFIED)</strong>
            <span style="font-size: 0.7rem; background: var(--forest-900); color: var(--gold-400); padding: 2px 8px; border-radius: 99px;">${p.giId}</span>
          </div>
          <div class="passport-grid">
            <div><strong>Master Artisan:</strong> ${p.artisan}</div>
            <div><strong>Valley Cluster:</strong> ${p.district}, J&K</div>
            <div><strong>Lab Purity Audit:</strong> ${p.purityMetric}</div>
            <div><strong>Loom / Chisel Hours:</strong> ${p.loomHours} hrs • ${p.dimensions}</div>
          </div>
        </div>
      </div>

      <div>
        <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--forest-700);">${p.guildLabel}</div>
        <h2 style="font-family: var(--font-serif); font-size: 1.9rem; color: var(--forest-950); margin: 4px 0;">${p.title}</h2>
        <div style="font-size: 0.82rem; color: var(--text-500); margin-bottom: 12px;">
          Crafted by <strong>${p.artisan}</strong> • <span style="color: var(--forest-800); font-weight: 700;">${p.rating.toFixed(1)} ★ (${p.reviewCount} Verified Reviews)</span>
        </div>

        <div style="background: var(--bg-ivory); padding: 12px 16px; border-radius: 8px; margin-bottom: 14px;">
          <div style="font-size: 0.68rem; text-transform: uppercase; color: var(--text-500);">Direct Loom Valuation (Zero Middleman Cut)</div>
          <div style="display: flex; align-items: baseline; gap: 10px;">
            <span style="font-family: var(--font-serif); font-size: 1.8rem; font-weight: 700; color: var(--forest-950);">${formatINR(p.price)}</span>
            <span style="text-decoration: line-through; color: var(--text-400); font-size: 0.9rem;">${formatINR(p.mrp)}</span>
            <span style="color: var(--success-600); font-size: 0.8rem; font-weight: 700;">Save ${formatINR(p.mrp - p.price)}</span>
          </div>
        </div>

        <p style="font-size: 0.85rem; color: var(--text-700); margin-bottom: 14px; line-height: 1.6;">${p.description}</p>

        <!-- Pincode Delivery Checker -->
        <div style="border-top: 1px solid var(--border-light); border-bottom: 1px solid var(--border-light); padding: 12px 0; margin-bottom: 16px;">
          <div style="font-size: 0.74rem; font-weight: 700; text-transform: uppercase; color: var(--text-700);">Check Insured Courier Delivery (Delhivery / India Post Speed Post)</div>
          <div class="pincode-checker-row">
            <input type="text" id="pdp-pincode-input" class="pincode-input" maxlength="6" placeholder="Enter 6-digit Pincode" value="000000">
            <button type="button" class="btn-acquire" onclick="checkPincodeEta()">Check ETA</button>
          </div>
          <div id="pdp-pincode-result" style="font-size: 0.76rem; color: var(--success-600); font-weight: 600;">
            ✓ Delhivery / India Post Insured Transit to 000000: Estimated delivery in 2–3 Days (Free GI-Sealed Box).
          </div>
        </div>

        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px;">
          <button type="button" class="btn-primary-forest" onclick="addToCart('${p.id}', 1); closeModal('product-detail-modal'); toggleDrawer('cart-drawer', true);">
            🛍️ Add to Cart (${formatINR(p.price)})
          </button>
          <button type="button" class="btn-gold" onclick="buyNow('${p.id}')">
            ⚡ Buy Now
          </button>
          <button type="button" class="btn-outline-ivory" onclick="openGiVerifyModal('${p.giId}')">
            Verify GI Seal
          </button>
        </div>

        <!-- Customer Reviews Section -->
        <div>
          <h4 style="font-family: var(--font-serif); font-size: 1.15rem; margin-bottom: 8px;">Collector Reviews (${prodReviews.length})</h4>
          <div style="max-height: 135px; overflow-y: auto; margin-bottom: 10px; padding-right: 6px;">
            ${prodReviews.map(r => `
              <div style="background: var(--bg-ivory); padding: 8px 10px; border-radius: 6px; margin-bottom: 6px; font-size: 0.76rem;">
                <div style="display: flex; justify-content: space-between; font-weight: 700;">
                  <span>${r.author} <span style="color: var(--gold-600);">${"★".repeat(r.rating)}</span></span>
                  <span style="color: var(--text-400);">${r.date}</span>
                </div>
                <p style="color: var(--text-700); margin-top: 3px;">${r.comment}</p>
              </div>
            `).join("")}
          </div>
          <form onsubmit="submitProductReview(event, '${p.id}')" style="display: flex; gap: 6px; flex-wrap: wrap;">
            <input type="text" id="rev-author" placeholder="Your Name" required style="padding: 6px 8px; border: 1px solid var(--border-mid); border-radius: 4px; font-size: 0.76rem; width: 120px;">
            <select id="rev-rating" style="padding: 6px; border: 1px solid var(--border-mid); border-radius: 4px; font-size: 0.76rem;">
              <option value="5">5 ★</option>
              <option value="4">4 ★</option>
            </select>
            <input type="text" id="rev-comment" placeholder="Write a verified craft review..." required style="flex: 1; padding: 6px 8px; border: 1px solid var(--border-mid); border-radius: 4px; font-size: 0.76rem;">
            <button type="submit" class="btn-acquire" style="padding: 6px 12px; font-size: 0.74rem;">Post</button>
          </form>
        </div>
      </div>
    </div>
  `;

  modal.classList.add("open");
}

function handleZoomMove(e) {
  const stage = document.getElementById("pdp-zoom-stage");
  const img = document.getElementById("pdp-main-img");
  if (!stage || !img) return;
  const rect = stage.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  img.style.transformOrigin = `${x}% ${y}%`;
  img.style.transform = "scale(2.15)";
}

function resetZoomMove() {
  const img = document.getElementById("pdp-main-img");
  if (img) img.style.transform = "scale(1)";
}

function checkPincodeEta() {
  const inp = document.getElementById("pdp-pincode-input");
  const out = document.getElementById("pdp-pincode-result");
  if (!inp || !out) return;
  const pin = inp.value.trim();
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    out.style.color = "var(--danger-600)";
    out.textContent = "Please enter a valid 6-digit Indian pincode.";
    return;
  }
  out.style.color = "var(--success-600)";
  if (pin.startsWith("18") || pin.startsWith("19")) {
    out.textContent = `✓ J&K Priority Corridor (${pin}): 2–3 Days via Delhivery / India Post with Tamper-Proof GI Seal.`;
  } else if (["11", "40", "56", "60", "70", "50"].some(p => pin.startsWith(p))) {
    out.textContent = `✓ Metro Air Express (${pin}): 3–5 Days via Delhivery Insured Heritage Transit (FREE).`;
  } else {
    out.textContent = `✓ National Insured Dispatch (${pin}): 5–7 Days via India Post Speed Post with GI Escrow Protection.`;
  }
}

function submitProductReview(e, productId) {
  e.preventDefault();
  const author = document.getElementById("rev-author").value.trim();
  const rating = parseInt(document.getElementById("rev-rating").value, 10) || 5;
  const comment = document.getElementById("rev-comment").value.trim();
  if (!author || !comment) return;

  if (!AppState.reviews[productId]) AppState.reviews[productId] = [];
  AppState.reviews[productId].unshift({
    author,
    rating,
    date: "15 Nov 2026",
    comment
  });
  saveStorage("hunarlink_reviews", AppState.reviews);
  openProductModal(productId);
  showToast("Thank you! Your review has been published.");
}

/* ==========================================================================
   Product Comparison Tray & Modal (Up to 3 Crafts)
   ========================================================================== */
function toggleCompare(productId) {
  const idx = AppState.compareList.indexOf(productId);
  if (idx > -1) {
    AppState.compareList.splice(idx, 1);
  } else {
    if (AppState.compareList.length >= 3) {
      showToast("You can compare up to 3 heirloom crafts at a time");
      renderMarketplace();
      return;
    }
    AppState.compareList.push(productId);
  }
  renderMarketplace();
  renderCompareBar();
}

function renderCompareBar() {
  const bar = document.getElementById("compare-floating-bar");
  const text = document.getElementById("compare-bar-text");
  if (!bar || !text) return;
  if (AppState.compareList.length === 0) {
    bar.classList.remove("visible");
    return;
  }
  bar.classList.add("visible");
  text.textContent = `${AppState.compareList.length} Craft(s) Selected for Side-by-Side Comparison`;
}

function openCompareModal() {
  const modal = document.getElementById("compare-modal");
  const body = document.getElementById("compare-modal-body");
  if (!modal || !body) return;
  const items = AppState.compareList.map(id => getProductById(id));
  if (items.length === 0) {
    showToast("Select at least 1 craft using the Compare checkbox on product cards");
    return;
  }
  body.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Specification</th>
          ${items.map(p => `<th>${p.title}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Preview</strong></td>
          ${items.map(p => `<td><img loading="lazy" decoding="async" src="${p.image}" alt="${p.title}" style="width: 110px; height: 80px; object-fit: cover; border-radius: 6px;"></td>`).join("")}
        </tr>
        <tr>
          <td><strong>Direct Loom Price</strong></td>
          ${items.map(p => `<td style="font-weight: 700; color: var(--forest-900);">${formatINR(p.price)} <span style="text-decoration: line-through; color: var(--text-400); font-size: 0.72rem;">${formatINR(p.mrp)}</span></td>`).join("")}
        </tr>
        <tr>
          <td><strong>Craft Guild</strong></td>
          ${items.map(p => `<td>${p.guildLabel}</td>`).join("")}
        </tr>
        <tr>
          <td><strong>Master Artisan</strong></td>
          ${items.map(p => `<td>${p.artisan} (${p.district})</td>`).join("")}
        </tr>
        <tr>
          <td><strong>GI Registry Tag</strong></td>
          ${items.map(p => `<td><code>${p.giId}</code> (Level ${p.giLevel})</td>`).join("")}
        </tr>
        <tr>
          <td><strong>Lab Material Purity</strong></td>
          ${items.map(p => `<td>${p.purityMetric}</td>`).join("")}
        </tr>
        <tr>
          <td><strong>Craftsmanship Hours</strong></td>
          ${items.map(p => `<td>${p.loomHours} Hours • ${p.dimensions}</td>`).join("")}
        </tr>
        <tr>
          <td><strong>Action</strong></td>
          ${items.map(p => `
            <td>
              <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                <button type="button" class="btn-card-cart" onclick="addToCart('${p.id}', 1); closeModal('compare-modal')">🛍️ Add to Cart</button>
                <button type="button" class="btn-card-buy" onclick="buyNow('${p.id}')">⚡ Buy Now</button>
              </div>
            </td>
          `).join("")}
        </tr>
      </tbody>
    </table>
  `;
  modal.classList.add("open");
}

function clearCompareList() {
  AppState.compareList = [];
  renderMarketplace();
  renderCompareBar();
}

/* ==========================================================================
   4-Step Checkout Wizard & Order Tracking
   ========================================================================== */
function openCheckoutWizard() {
  toggleDrawer("cart-drawer", false);
  if (AppState.cart.length === 0) {
    showToast("Add at least one heirloom piece to your bag before checkout");
    return;
  }
  AppState.checkoutStep = 1;
  renderCheckoutStep();
  document.getElementById("checkout-modal").classList.add("open");
}

function setCheckoutStep(step) {
  AppState.checkoutStep = step;
  renderCheckoutStep();
}

function saveNewCheckoutAddress(e) {
  e.preventDefault();
  const name = document.getElementById("addr-name").value.trim();
  const phone = document.getElementById("addr-phone").value.trim();
  const pincode = document.getElementById("addr-pin").value.trim();
  const locality = document.getElementById("addr-loc").value.trim();
  const city = document.getElementById("addr-city").value.trim();
  if (!name || !phone || !pincode || !locality || !city) {
    /* M5 fix: never fail silently — tell the collector what's missing. */
    showToast("⚠️ Please fill every delivery field (name, mobile, pincode, locality & city)");
    return;
  }

  const newAddr = {
    id: "addr-" + Date.now(),
    name,
    phone,
    pincode,
    locality,
    city,
    type: "Delivery"
  };
  AppState.addresses.push(newAddr);
  AppState.selectedAddressId = newAddr.id;
  saveStorage("hunarlink_addresses", AppState.addresses);
  AppState.checkoutStep = 3;
  renderCheckoutStep();
  showToast("Delivery address saved and selected");
}

function completeSimulatedOrder(paymentMethod) {
  const totals = calculateCartTotals();
  const addr = AppState.addresses.find(a => a.id === AppState.selectedAddressId) || AppState.addresses[0];
  const buyerNameInput = (document.getElementById("chk-buyer-name")?.value || "").trim();
  const buyerPhoneInput = (document.getElementById("chk-buyer-phone")?.value || "").trim();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const orderId = "HL-ORD-2026-" + Math.floor(1000 + Math.random() * 9000);

  const buyerName = buyerNameInput || addr.name || "Priya Sharma";
  const buyerPhone = buyerPhoneInput || addr.phone || "+91 98110 44210";
  const buyerEmail = (AppState.currentUser && AppState.currentUser.email) || "collector@hunarlink.in";

  const orderItems = AppState.cart.map(entry => {
    const p = getProductById(entry.productId);
    return {
      productId: p.id,
      title: p.title,
      qty: entry.qty,
      price: p.price,
      lineTotal: p.price * entry.qty,
      giId: p.giId,
      artisan: p.artisan,
      guild: p.guildLabel || p.guild,
      image: p.image
    };
  });

  const newOrder = {
    id: orderId,
    date: dateStr,
    time: timeStr,
    createdAt: now.toISOString(),
    buyer: {
      name: buyerName,
      phone: buyerPhone,
      email: buyerEmail,
      addressType: addr.type || "Home",
      locality: addr.locality || "",
      city: addr.city || "",
      pincode: addr.pincode || "",
      fullAddress: `${addr.name}, ${addr.locality}, ${addr.city} - ${addr.pincode}`
    },
    items: orderItems,
    subtotal: totals.sellingSubtotal,
    /* Bug fix: `appliedCoupon` is stored as a string and the totals object
       exposes `couponDiscount` — receipts were silently losing the coupon
       info (discount showed 0, couponCode null) even though the charged
       total was correct. */
    discount: totals.couponDiscount || 0,
    couponCode: AppState.appliedCoupon || null,
    shippingFee: totals.shippingFee || 0,
    total: totals.netPayable,
    artisanPayout: totals.netPayable,
    paymentMethod,
    paymentStatus: paymentMethod.toLowerCase().includes("cod") || paymentMethod.toLowerCase().includes("delivery")
      ? "Verify-on-Delivery Escrow"
      : "Paid (Escrow Protected)",
    address: `${addr.name}, ${addr.locality}, ${addr.city} - ${addr.pincode}`,
    stage: 1,
    sellerNote: "",
    isNewForSeller: true
  };

  AppState.orders.unshift(newOrder);
  AppState.cart = [];
  AppState.appliedCoupon = null;
  saveStorage("hunarlink_orders", AppState.orders);
  saveStorage("hunarlink_cart", AppState.cart);
  saveStorage("hunarlink_coupon", null);
  updateHeaderBadges();
  closeModal("checkout-modal");
  openOrdersModal();
  showToast(`Order ${orderId} confirmed! Seller notified with complete order details.`);
}

function renderCheckoutStep() {
  const body = document.getElementById("checkout-modal-body");
  if (!body) return;
  const totals = calculateCartTotals();
  const step = AppState.checkoutStep;

  const stepperHtml = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px;">
      ${["1. Collector ID", "2. Delivery Address", "3. GI Certificate & Summary", "4. Escrow Payment"].map((label, idx) => {
        const sNum = idx + 1;
        const active = sNum === step;
        const done = sNum < step;
        return `<button type="button" onclick="setCheckoutStep(${sNum})" style="padding: 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; background: ${active ? "var(--forest-900)" : done ? "var(--forest-100)" : "var(--bg-ivory)"}; color: ${active ? "#FFF" : "var(--forest-900)"};">${label}</button>`;
      }).join("")}
    </div>
  `;

  if (step === 1) {
    body.innerHTML = `
      ${stepperHtml}
      <div style="background: var(--bg-ivory); padding: 18px; border-radius: 10px;">
        <h3 style="font-family: var(--font-serif); font-size: 1.35rem; margin-bottom: 10px;">Step 1: Collector Identity & GI Ownership Registration</h3>
        <p style="font-size: 0.8rem; color: var(--text-500); margin-bottom: 14px;">Your name is cryptographically bound to the Digital GI Ownership Passport upon dispatch.</p>
        <div class="form-grid">
          <div class="form-field">
            <label>Collector Full Name</label>
            <input type="text" id="chk-buyer-name" value="Demo Collector">
          </div>
          <div class="form-field">
            <label>Phone (SMS/WhatsApp Loom Telemetry)</label>
            <input type="text" id="chk-buyer-phone" value="+91 0000000000">
          </div>
        </div>
        <div style="margin-top: 16px; text-align: right;">
          <button type="button" class="btn-primary-forest" onclick="setCheckoutStep(2)">Continue to Delivery Address →</button>
        </div>
      </div>
    `;
  } else if (step === 2) {
    body.innerHTML = `
      ${stepperHtml}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
        <div>
          <h4 style="font-family: var(--font-serif); font-size: 1.2rem; margin-bottom: 10px;">Select Saved Address</h4>
          ${AppState.addresses.map(a => `
            <label style="display: block; padding: 12px; border: 2px solid ${AppState.selectedAddressId === a.id ? "var(--forest-900)" : "var(--border-light)"}; border-radius: 8px; margin-bottom: 10px; cursor: pointer;">
              <input type="radio" name="selectedAddr" ${AppState.selectedAddressId === a.id ? "checked" : ""} onchange="AppState.selectedAddressId='${a.id}'; renderCheckoutStep();">
              <strong style="font-size: 0.84rem; margin-left: 6px;">${a.name} (${a.type})</strong>
              <div style="font-size: 0.76rem; color: var(--text-500); margin-top: 4px;">${a.locality}, ${a.city} - ${a.pincode} • Ph: ${a.phone}</div>
            </label>
          `).join("")}
          <button type="button" class="btn-primary-forest" style="margin-top: 8px;" onclick="setCheckoutStep(3)">Deliver to Selected Address →</button>
        </div>
        <form onsubmit="saveNewCheckoutAddress(event)" style="background: var(--bg-ivory); padding: 14px; border-radius: 8px;">
          <h4 style="font-family: var(--font-serif); font-size: 1.15rem; margin-bottom: 8px;">Or Add New Address</h4>
          <div class="form-grid">
            <div class="form-field"><label>Full Name</label><input type="text" id="addr-name" required placeholder="Receiver Name"></div>
            <div class="form-field"><label>Mobile</label><input type="text" id="addr-phone" required placeholder="10-digit Mobile"></div>
            <div class="form-field"><label>6-Digit Pincode</label><input type="text" id="addr-pin" required placeholder="e.g. 180001"></div>
            <div class="form-field"><label>City & State</label><input type="text" id="addr-city" required placeholder="Srinagar, J&K"></div>
            <div class="form-field full"><label>Street / Locality</label><input type="text" id="addr-loc" required placeholder="House No, Street, Landmark"></div>
          </div>
          <button type="submit" class="btn-acquire" style="margin-top: 10px;">Save & Use This Address</button>
        </form>
      </div>
    `;
  } else if (step === 3) {
    body.innerHTML = `
      ${stepperHtml}
      <div style="background: var(--bg-ivory); padding: 18px; border-radius: 10px;">
        <h3 style="font-family: var(--font-serif); font-size: 1.35rem; margin-bottom: 10px;">Step 3: Order Summary & GI Ownership Certificate Preview</h3>
        ${AppState.cart.map(entry => {
          const p = getProductById(entry.productId);
          return `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light); font-size: 0.84rem;">
              <span><strong>${p.title}</strong> × ${entry.qty} <code style="color: var(--forest-700);">[${p.giId}]</code></span>
              <strong>${formatINR(p.price * entry.qty)}</strong>
            </div>
          `;
        }).join("")}
        <div style="display: flex; justify-content: space-between; font-size: 1.05rem; font-weight: 700; padding-top: 10px; color: var(--forest-950);">
          <span>Total Escrow Payable (Zero Platform Cut)</span>
          <span>${formatINR(totals.netPayable)}</span>
        </div>
        <div style="margin-top: 16px; display: flex; justify-content: space-between;">
          <button type="button" class="btn-outline-ivory" onclick="setCheckoutStep(2)">← Back</button>
          <button type="button" class="btn-primary-forest" onclick="setCheckoutStep(4)">Proceed to Escrow Payment →</button>
        </div>
      </div>
    `;
  } else {
    body.innerHTML = `
      ${stepperHtml}
      <div style="background: var(--bg-ivory); padding: 18px; border-radius: 10px;">
        <h3 style="font-family: var(--font-serif); font-size: 1.35rem; margin-bottom: 12px;">Step 4: Select Simulated Artisan Escrow Payment (${formatINR(totals.netPayable)})</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <div style="background: #FFF; padding: 14px; border-radius: 8px; border: 1px solid var(--border-mid);">
            <strong style="font-size: 0.86rem;">📱 Instant UPI Escrow</strong>
            <p style="font-size: 0.74rem; color: var(--text-500); margin: 6px 0 12px;">Direct UPI transfer held in GI-verified artisan escrow until delivery.</p>
            <button type="button" class="btn-primary-forest" style="width: 100%; justify-content: center;" onclick="completeSimulatedOrder('UPI Direct Artisan Escrow')">Pay via UPI</button>
          </div>
          <div style="background: #FFF; padding: 14px; border-radius: 8px; border: 1px solid var(--border-mid);">
            <strong style="font-size: 0.86rem;">💳 Credit / Debit Card</strong>
            <p style="font-size: 0.74rem; color: var(--text-500); margin: 6px 0 12px;">Visa, Mastercard, RuPay & Zero-Cost Heritage EMI options.</p>
            <button type="button" class="btn-primary-forest" style="width: 100%; justify-content: center;" onclick="completeSimulatedOrder('Card Escrow Payment')">Pay via Card</button>
          </div>
          <div style="background: #FFF; padding: 14px; border-radius: 8px; border: 1px solid var(--border-mid);">
            <strong style="font-size: 0.86rem;">📦 Insured COD / Verification on Arrival</strong>
            <p style="font-size: 0.74rem; color: var(--text-500); margin: 6px 0 12px;">Verify physical GI QR tag at your doorstep before releasing payment.</p>
            <button type="button" class="btn-gold" style="width: 100%; justify-content: center;" onclick="completeSimulatedOrder('Verify-on-Delivery Escrow')">Place COD Order</button>
          </div>
        </div>
      </div>
    `;
  }
}

/* My Orders & 5-Stage Shipment Tracker */
const TRACKING_STAGES = [
  "1. Order Confirmed",
  "2. GI Laser Seal Verified",
  "3. Packed at Valley Loom",
  "4. Insured Courier Transit",
  "5. Delivered to Collector"
];

function openOrdersModal() {
  const modal = document.getElementById("orders-modal");
  renderOrdersList();
  if (modal) modal.classList.add("open");
}

function advanceOrderStage(orderId) {
  const ord = AppState.orders.find(o => o.id === orderId);
  if (!ord) return;
  ord.stage = Math.min(5, (ord.stage || 1) + 1);
  saveStorage("hunarlink_orders", AppState.orders);
  renderOrdersList();
  showToast(`Order ${orderId} advanced to: ${TRACKING_STAGES[ord.stage - 1]}`);
}

function renderOrdersList() {
  const body = document.getElementById("orders-modal-body");
  if (!body) return;
  if (AppState.orders.length === 0) {
    body.innerHTML = `<p style="text-align: center; padding: 30px;">No orders placed yet.</p>`;
    return;
  }
  body.innerHTML = AppState.orders.map(o => `
    <div style="background: var(--bg-ivory); border: 1px solid var(--border-mid); border-radius: 10px; padding: 16px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
        <div>
          <strong style="font-size: 0.92rem; color: var(--forest-950);">Order #${o.id}</strong>
          <span style="font-size: 0.74rem; color: var(--text-500); margin-left: 8px;">Placed on ${o.date} • ${o.paymentMethod}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-outline-ivory" style="padding: 5px 10px; font-size: 0.7rem;" onclick="advanceOrderStage('${o.id}')">Simulate Next Tracking Step →</button>
          <button type="button" class="btn-acquire" style="padding: 5px 10px; font-size: 0.7rem;" onclick="window.print()">🖨️ Print GI Invoice</button>
        </div>
      </div>
      <div style="font-size: 0.78rem; color: var(--text-700); margin-bottom: 10px;">
        <strong>Delivery To:</strong> ${o.address} • <strong>Total Paid:</strong> ${formatINR(o.total)}
      </div>
      <div style="margin-bottom: 12px; font-size: 0.8rem;">
        ${o.items.map(i => `<div>• ${i.title} (Qty: ${i.qty}) — <code>${i.giId}</code></div>`).join("")}
      </div>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
        ${TRACKING_STAGES.map((lbl, idx) => {
          const done = idx + 1 <= o.stage;
          return `<div style="padding: 6px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; text-align: center; background: ${done ? "var(--forest-900)" : "#FFF"}; color: ${done ? "var(--gold-400)" : "var(--text-400)"}; border: 1px solid var(--border-light);">${lbl}</div>`;
        }).join("")}
      </div>
    </div>
  `).join("");
}

/* ==========================================================================
   GI Tag / QR Verifier, B2B Wholesale Calculator & Artisan Studio
   ========================================================================== */
function openGiVerifyModal(prefillId) {
  const modal = document.getElementById("gi-verify-modal");
  const inp = document.getElementById("gi-lookup-input");
  if (inp) inp.value = prefillId || "GI-JK-PASH-8821";
  runGiLookup();
  if (modal) modal.classList.add("open");
}

function runGiLookup() {
  const inp = document.getElementById("gi-lookup-input");
  const res = document.getElementById("gi-lookup-result");
  if (!inp || !res) return;
  const raw = inp.value.trim();

  /* M2 fix: an empty field should never "verify" — ask for a code instead. */
  if (!raw) {
    res.innerHTML = `
      <div style="background: #FFF8EB; border: 1px solid #E8C988; border-radius: 8px; padding: 14px; margin-top: 12px; color: #734D0D; font-size: 0.82rem;">
        <strong>⚠️ Please enter a GI tag code to verify.</strong><br>
        Try a verified sample like <code>GI-JK-PASH-8821</code>, <code>GI #JK-WNT-1180</code>, or <code>GI-JK-PAPR-3109</code>.
      </div>
    `;
    return;
  }

  const normalize = s => s.toUpperCase().replace(/[\s#-]/g, "");
  const codeNorm = normalize(raw);
  const all = getAllProducts();
  const match = all.find(p => normalize(p.giId) === codeNorm || normalize(p.giId).includes(codeNorm));

  if (!match) {
    res.innerHTML = `
      <div style="background: #FFF8EB; border: 1px solid #E8C988; border-radius: 8px; padding: 14px; margin-top: 12px; color: #734D0D; font-size: 0.82rem;">
        <strong>⚠️ No matching GI record found for "${raw}".</strong><br>
        Double-check the tag code or try a verified sample like <code>GI-JK-PASH-8821</code>, <code>GI #JK-WNT-1180</code>, or <code>GI-JK-PAPR-3109</code>.
      </div>
    `;
    return;
  }

  res.innerHTML = `
    <div style="background: var(--forest-50); border: 1px solid var(--forest-700); border-radius: 8px; padding: 14px; margin-top: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
        <span style="font-weight: 700; color: var(--forest-900);">✓ CRYPTOGRAPHIC GI SEAL VERIFIED</span>
        <code style="background: var(--forest-900); color: var(--gold-400); padding: 2px 8px; border-radius: 4px;">${match.giId}</code>
      </div>
      <div style="font-size: 0.8rem; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <div><strong>Craft Title:</strong> ${match.title}</div>
        <div><strong>Master Artisan:</strong> ${match.artisan}</div>
        <div><strong>Geo-Tagged Loom:</strong> ${match.district} Cluster, J&K</div>
        <div><strong>Lab Purity Audit:</strong> ${match.purityMetric}</div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   Interactive Valley Verification Flow Controller
   ========================================================================== */
const VERIFICATION_STEPS = {
  1: {
    kicker: "STEP 01 OF 03 • LOOM ORIGIN CHECK",
    heading: "How We Verify the Artisan & Workshop",
    checks: [
      "Every craft is photographed and logged at the artisan's actual workshop in Srinagar, Budgam, or Anantnag.",
      "We verify the artisan's Government of J&K Handicrafts Registry ID and family guild lineage.",
      "Exact GPS coordinates and loom hours are recorded so middlemen cannot swap in factory copies."
    ],
    proofTitle: "Sample Origin Record",
    proofBadge: "GPS VERIFIED",
    proof: [
      { label: "Master Artisan", value: "Ustad Ghulam Qadir Mir" },
      { label: "Workshop Cluster", value: "Kanihama, Budgam (J&K)" },
      { label: "Guild Registry", value: "JK-HANDLOOM #019" },
      { label: "Crafting Time", value: "1,420 Hand-Loom Hours" }
    ]
  },
  2: {
    kicker: "STEP 02 OF 03 • CERTIFIED LAB TESTING",
    heading: "How We Test Fiber & Material Purity",
    checks: [
      "Microscopic fiber testing confirms authentic Ladakhi Changthangi Pashmina (under 16 microns — 5x finer than human hair).",
      "AI macro weave inspection verifies hand-spun irregularity, real mulberry silk knot density, and seasoned walnut wood grain.",
      "Natural mineral and vegetable dyes are checked to ensure heirloom longevity and skin-safe comfort."
    ],
    proofTitle: "Sample Lab Purity Report",
    proofBadge: "99.4% PURE",
    proof: [
      { label: "Fiber Diameter", value: "14.2 Microns (µm)" },
      { label: "Weave Type", value: "100% Hand-Spun Kani" },
      { label: "Synthetic Blends", value: "0.0% Detected (Pass)" },
      { label: "Testing Authority", value: "Pashmina Testing & Quality Lab" }
    ]
  },
  3: {
    kicker: "STEP 03 OF 03 • LIFETIME BUYER PROTECTION",
    heading: "How Your GI Tag & Digital Passport Work",
    checks: [
      "Once approved, a tamper-evident Government Geographical Indication (GI) laser seal is attached to the craft.",
      "Each seal links to a permanent Digital Craft Passport storing the artisan profile, origin map, and lab certificate.",
      "Simply scan the QR code or enter the GI ID anytime — even years later — to prove authenticity and heirloom value."
    ],
    proofTitle: "Sample Digital Passport",
    proofBadge: "GI SEALED",
    proof: [
      { label: "GI Certificate ID", value: "GI-JK-PASH-8821" },
      { label: "Seal Type", value: "Tamper-Proof Laser QR" },
      { label: "Registry Status", value: "Active • Govt. GI #46" },
      { label: "Buyer Guarantee", value: "100% Authenticity Refund" }
    ]
  }
};

let activeVerificationStep = 1;

function selectVerificationStep(step) {
  const s = Math.max(1, Math.min(3, Number(step) || 1));
  activeVerificationStep = s;

  // Sync top pills & cards
  [1, 2, 3].forEach(n => {
    const pill = document.getElementById(`verify-pill-${n}`);
    const card = document.getElementById(`verify-card-${n}`);
    const tag = document.getElementById(`verify-tag-${n}`);
    const isActive = n === s;
    const isDone = n < s;

    if (pill) {
      pill.classList.toggle("active", isActive);
      pill.classList.toggle("completed", isDone);
      pill.setAttribute("aria-selected", isActive ? "true" : "false");
    }
    if (card) {
      card.classList.toggle("highlighted", isActive);
      card.classList.toggle("completed", isDone);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
    if (tag) {
      tag.textContent = isActive ? "Viewing Step" : isDone ? "✓ Checked" : "Click to Inspect";
    }
  });

  // Render interactive step detail content
  const data = VERIFICATION_STEPS[s];
  const contentEl = document.getElementById("verify-detail-content");
  if (contentEl && data) {
    contentEl.innerHTML = `
      <div class="verify-detail-grid">
        <div>
          <div class="verify-detail-kicker">${data.kicker}</div>
          <h3 class="verify-detail-heading">${data.heading}</h3>
          <ul class="verify-checklist">
            ${data.checks.map(c => `<li><span class="verify-check-icon">✓</span><span>${c}</span></li>`).join("")}
          </ul>
        </div>
        <div class="verify-sample-proof">
          <div class="verify-proof-header">
            <span class="verify-proof-title">${data.proofTitle}</span>
            <span class="verify-proof-badge">${data.proofBadge}</span>
          </div>
          <div class="verify-proof-rows">
            ${data.proof.map(item => `
              <div class="verify-proof-item">
                <strong>${item.label}</strong>
                <span>${item.value}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  // Sync Previous / Next buttons & counter
  const counterEl = document.getElementById("verify-step-counter");
  const prevBtn = document.getElementById("verify-prev-btn");
  const nextBtn = document.getElementById("verify-next-btn");
  if (counterEl) counterEl.textContent = `Step ${s} of 3`;
  if (prevBtn) prevBtn.disabled = s === 1;
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.textContent = s === 3 ? "Restart Flow ↺" : "Next Step →";
  }
}

function stepVerification(delta) {
  if (delta > 0 && activeVerificationStep === 3) {
    selectVerificationStep(1);
    return;
  }
  selectVerificationStep(activeVerificationStep + delta);
}

function quickVerifyFromSection(sampleId) {
  const inlineInput = document.getElementById("inline-gi-input");
  const code = sampleId || (inlineInput ? inlineInput.value.trim() : "") || "GI-JK-PASH-8821";
  if (inlineInput && sampleId) inlineInput.value = sampleId;
  openGiVerifyModal(code);
}

window.selectVerificationStep = selectVerificationStep;
window.stepVerification = stepVerification;
window.quickVerifyFromSection = quickVerifyFromSection;

function openB2BModal() {
  document.getElementById("b2b-modal").classList.add("open");
  updateB2BCalculator();
}

function updateB2BCalculator() {
  const unitPrice = parseInt(document.getElementById("b2b-guild-select")?.value || "58500", 10);
  const qty = parseInt(document.getElementById("b2b-qty-input")?.value || "15", 10);
  const out = document.getElementById("b2b-quote-output");
  if (!out) return;

  let discPct = 12;
  if (qty >= 50) discPct = 25;
  else if (qty >= 25) discPct = 18;

  const gross = unitPrice * qty;
  const net = Math.round(gross * (1 - discPct / 100));
  out.innerHTML = `
    <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
      <span>Standard Guild Valuation (${qty} units):</span>
      <span>${formatINR(gross)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--success-600); margin-bottom: 4px;">
      <span>Hospitality / Trade Tier Discount (${discPct}%):</span>
      <span>− ${formatINR(gross - net)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 1.05rem; font-weight: 700; color: var(--forest-950); border-top: 1px solid var(--border-mid); padding-top: 6px;">
      <span>Estimated B2B Lot Total (Includes Batch GI Export Seals):</span>
      <span>${formatINR(net)}</span>
    </div>
  `;
}

function submitB2BQuote(e) {
  e.preventDefault();
  const firm = document.getElementById("b2b-firm-name").value.trim();
  const email = document.getElementById("b2b-firm-email").value.trim();
  if (!firm || !email) return;
  AppState.b2bQuotes.push({ firm, email, date: "15 Nov 2026" });
  saveStorage("hunarlink_b2b_quotes", AppState.b2bQuotes);

  /* H2 fix: also mirror the quote into `hunarlink_seller_inquiries` using the
     exact shape the seller dashboard's Product Responses tab renders, so
     wholesale requests actually reach artisans. */
  try {
    const inquiries = loadStorage("hunarlink_seller_inquiries", []);
    const guildSel = document.getElementById("b2b-guild-select");
    const qtyInp = document.getElementById("b2b-qty-input");
    const guildLabel = guildSel && guildSel.selectedOptions[0]
      ? guildSel.selectedOptions[0].textContent.trim()
      : "Heritage Craft Guild";
    const out = document.getElementById("b2b-quote-output");
    const estimateMatch = out ? (out.textContent.match(/₹[\d,]+/) || [null])[0] : null;
    inquiries.push({
      id: "inq-b2b-" + Date.now(),
      type: "B2B Quote",
      author: `${firm} (${email})`,
      productTitle: `Wholesale Lot — ${guildLabel}`,
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      rating: null,
      comment: `Bulk enquiry for ${qtyInp ? qtyInp.value : "?"} units${estimateMatch ? ` • Lot estimate ${estimateMatch}` : ""}. Requesting the wholesale trade dossier & batch GI export seals.`,
      reply: ""
    });
    saveStorage("hunarlink_seller_inquiries", inquiries);
  } catch (err) {}

  closeModal("b2b-modal");
  showToast(`Wholesale Trade Dossier & GI Lot Quote sent for ${firm}`);
}

/* Artisan Studio Seller Listing Simulator */
function openArtisanStudioModal() {
  const el = document.getElementById("artisan-studio-modal");
  if (el) {
    el.classList.add("open");
  } else {
    window.location.href = "index.html#artisan-studio";
  }
}

function toggleCategoryFilter(guildKey) {
  if (AppState.filters.guild === guildKey) {
    AppState.filters.guild = "all";
  } else {
    AppState.filters.guild = guildKey;
  }
  AppState.filters.artisan = "";
  renderMarketplace();
}
window.toggleCategoryFilter = toggleCategoryFilter;

function simulateVoiceAutoFill() {
  document.getElementById("studio-title").value = "Pampore Saffron-Dyed Kani Pashmina Shawl";
  document.getElementById("studio-guild").value = "pashmina";
  document.getElementById("studio-artisan").value = "Ustad Ghulam Nabi Dar";
  document.getElementById("studio-district").value = "Srinagar";
  document.getElementById("studio-price").value = "64000";
  document.getElementById("studio-mrp").value = "75000";
  document.getElementById("studio-hours").value = "540";
  document.getElementById("studio-purity").value = "14.1 Micron Ladakhi Fleece • Natural Saffron Dye";
  showToast("🎙️ Voice-to-Listing (Kashmiri/Urdu Assist) populated craft specifications!");
}

function submitNewArtisanCraft(e) {
  e.preventDefault();
  const title = document.getElementById("studio-title").value.trim();
  const guild = document.getElementById("studio-guild").value;
  const artisan = document.getElementById("studio-artisan").value.trim();
  const district = document.getElementById("studio-district").value;
  const price = parseInt(document.getElementById("studio-price").value, 10) || 45000;
  const mrp = parseInt(document.getElementById("studio-mrp").value, 10) || Math.round(price * 1.18);
  const loomHours = parseInt(document.getElementById("studio-hours").value, 10) || 320;
  const purityMetric = document.getElementById("studio-purity").value.trim();

  const guildLabels = {
    "pashmina": "Pashmina & Kani Guild",
    "silk-rugs": "Silk-on-Silk Rugs",
    "walnut": "Walnut Woodcarving",
    "papier-mache": "Papier-Mâché Art",
    "sozni": "Kani Jamawar & Sozni"
  };
  const guildImg = {
    "pashmina": IMG_MAP.khudrang,
    "silk-rugs": IMG_MAP.silkrug,
    "walnut": IMG_MAP.walnut,
    "papier-mache": IMG_MAP.papier,
    "sozni": IMG_MAP.jamawar
  };

  const newCraft = {
    id: "hl-custom-" + Date.now(),
    title,
    guild,
    guildLabel: guildLabels[guild] || "Valley Craft Guild",
    artisan,
    district,
    price,
    mrp,
    rating: 5.0,
    reviewCount: 1,
    giId: "GI-JK-" + Math.floor(1000 + Math.random() * 9000),
    giLevel: 3,
    purityMetric: purityMetric || "100% GI Lab Verified Craft",
    loomHours,
    dimensions: "Custom Artisan Standard",
    stock: 2,
    image: guildImg[guild] || IMG_MAP.jamawar,
    description: `Newly authenticated heirloom piece listed directly from ${artisan}'s workshop in ${district}, Jammu & Kashmir.`
  };

  AppState.customProducts.unshift(newCraft);
  saveStorage("hunarlink_custom_products", AppState.customProducts);
  closeModal("artisan-studio-modal");
  resetAllFilters();
  const el = document.getElementById("marketplace-section");
  if (el) el.scrollIntoView({ behavior: "smooth" });
  showToast(`Verified & Published "${title}" (${newCraft.giId}) to Live Marketplace!`);
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove("open");
}

/* ==========================================================================
   Seller / Artisan Authentication Controller
   ========================================================================== */
let currentAuthRole = 'artisan';

function openSellerLoginModal() {
  setAuthRole('artisan');
  const modal = document.getElementById('seller-login-modal');
  if (modal) modal.classList.add('open');
}

function setAuthRole() {
  currentAuthRole = 'artisan';
  const artisanTab = document.getElementById('auth-role-artisan');
  const submitBtnText = document.getElementById('auth-submit-btn-text');

  if (artisanTab) {
    artisanTab.classList.add('active');
  }

  if (submitBtnText) {
    submitBtnText.textContent = 'Sign In as Master Artisan';
  }
}

function quickFillAuth() {
  setAuthRole('artisan');
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');

  if (emailInput) emailInput.value = 'ustad.mir@hunarlink.jk';
  if (passInput) passInput.value = 'KashmirLoom46!';
  showToast('⚡ Quick-Filled: Master Artisan Ustad Mir credentials');
}

function togglePasswordVisibility() {
  const passInput = document.getElementById('auth-password');
  const icon = document.getElementById('auth-eye-icon');
  if (!passInput) return;
  
  if (passInput.type === 'password') {
    passInput.type = 'text';
    if (icon) {
      icon.innerHTML = '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line>';
    }
  } else {
    passInput.type = 'password';
    if (icon) {
      icon.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
  }
}

function handleSellerLogin(event) {
  if (event) event.preventDefault();
  const email = (document.getElementById('auth-email')?.value || '').trim();

  const authUser = {
    role: 'artisan',
    name: 'Ustad Ghulam Qadir Mir',
    title: 'Master Artisan • Pashmina & Kani Guild',
    badge: 'UM',
    email: email || 'ustad.mir@hunarlink.jk',
    isLoggedIn: true
  };

  AppState.currentUser = authUser;
  saveStorage('hunarlink_auth_user', authUser);
  updateAuthUI();
  closeModal('seller-login-modal');

  showToast('✦ Authenticated as Master Artisan Ustad Mir! Opening Seller Studio...');
  setTimeout(() => {
    openArtisanStudioModal();
  }, 500);
}

function updateAuthUI() {
  const buyerProfile = loadStorage('hunarlink_buyer_profile', null);
  const storedAuth = loadStorage('hunarlink_auth_user', null);
  const user = storedAuth || AppState.currentUser;
  const buyerFirst = (buyerProfile && buyerProfile.firstName) || (user && user.role !== 'artisan' && user.name ? user.name.split(' ')[0] : 'Priya');
  const buyerFull = (buyerProfile && buyerProfile.fullName) || (user && user.fullName) || 'Priya Sharma';
  const buyerBadge = (buyerProfile && buyerProfile.badge) || (user && user.badge) || 'PS';

  const avatarBtn = document.getElementById('profile-menu-btn');
  const nameEl = document.querySelector('.profile-menu-name');
  const roleEl = document.querySelector('.profile-menu-role');
  const sellerBtn = document.getElementById('seller-login-btn');
  const sellerText = document.getElementById('seller-login-text');
  const userBtn = document.getElementById('user-login-btn');
  const userText = document.getElementById('user-login-text');
  const signoutBtn = document.getElementById('btn-profile-signout');

  if (user && user.isLoggedIn) {
    if (avatarBtn) avatarBtn.textContent = user.role === 'artisan' ? (user.badge || 'UM') : buyerBadge;
    if (nameEl) nameEl.textContent = user.role === 'artisan' ? (user.name || 'Artisan') : buyerFull;
    if (roleEl) roleEl.textContent = user.title || (user.role === 'artisan' ? 'Master Artisan' : 'Valley Collector');
    if (signoutBtn) signoutBtn.style.display = 'flex';

    if (user.role === 'artisan') {
      // Logged in as Artisan / Seller
      if (sellerBtn) {
        if (sellerText) {
          sellerText.textContent = 'Studio Active';
        } else {
          sellerBtn.innerHTML = '<span>✦</span> Studio Active';
        }
        sellerBtn.classList.add('logged-in');
        sellerBtn.style.backgroundColor = 'var(--btn-orange)';
        sellerBtn.style.color = '#FFFFFF';
        sellerBtn.title = `Logged in as ${user.name} (Artisan). Click to open Seller Portal`;
      }

      if (userBtn) {
        if (userText) {
          userText.textContent = buyerFirst;
        } else {
          userBtn.innerHTML = `<span>👤</span> ${buyerFirst}`;
        }
        userBtn.classList.add('logged-in');
        userBtn.style.backgroundColor = '';
        userBtn.style.color = '';
        userBtn.style.borderColor = '';
        userBtn.title = 'Open User Profile & Account Settings';
      }
    } else {
      // Collector / Profile state
      if (userBtn) {
        if (userText) {
          userText.textContent = buyerFirst;
        } else {
          userBtn.innerHTML = `<span>👤</span> ${buyerFirst}`;
        }
        userBtn.classList.add('logged-in');
        userBtn.style.backgroundColor = '';
        userBtn.style.color = '';
        userBtn.style.borderColor = '';
        userBtn.title = `Profile: ${buyerFull}. Click to customize profile & track orders`;
      }

      if (sellerBtn) {
        if (sellerText) {
          sellerText.textContent = 'Artisan Login';
        } else {
          sellerBtn.innerHTML = '<span>🔑</span> Artisan Login';
        }
        sellerBtn.classList.remove('logged-in');
        sellerBtn.style.backgroundColor = '';
        sellerBtn.style.color = '';
        sellerBtn.title = 'Artisan Login - Artisan & Seller Portal';
      }
    }
  } else {
    // Guest / Logged out state
    if (avatarBtn) avatarBtn.textContent = buyerBadge;
    if (nameEl) nameEl.textContent = buyerFull;
    if (roleEl) roleEl.textContent = 'Verified Valley Collector • J&K';
    if (signoutBtn) signoutBtn.style.display = 'none';

    if (userBtn) {
      const label = (buyerProfile && buyerProfile.isLoggedIn === false) ? 'User Login' : buyerFirst;
      if (userText) {
        userText.textContent = label;
      } else {
        userBtn.innerHTML = `<span>👤</span> ${label}`;
      }
      userBtn.classList.toggle('logged-in', !(buyerProfile && buyerProfile.isLoggedIn === false));
      userBtn.style.backgroundColor = '';
      userBtn.style.color = '';
      userBtn.style.borderColor = '';
      userBtn.title = 'Open User Account & Profile';
    }

    if (sellerBtn) {
      if (sellerText) {
        sellerText.textContent = 'Artisan Login';
      } else {
        sellerBtn.innerHTML = '<span>🔑</span> Artisan Login';
      }
      sellerBtn.classList.remove('logged-in');
      sellerBtn.style.backgroundColor = '';
      sellerBtn.style.color = '';
      sellerBtn.style.borderColor = '';
      sellerBtn.title = 'Artisan Login - Artisan & Seller Portal';
    }
  }
}

function handleUserLoginClick() {
  const buyerProfile = loadStorage('hunarlink_buyer_profile', null);
  if (buyerProfile && buyerProfile.isLoggedIn === false) {
    window.location.href = 'user-portal/login.html';
  } else {
    window.location.href = 'user-portal/profile.html';
  }
}

function handleSellerLoginClick() {
  const user = AppState.currentUser || loadStorage('hunarlink_auth_user', null);
  if (user && user.isLoggedIn && user.role === 'artisan') {
    window.location.href = 'seller-portal/dashboard.html';
  } else {
    window.location.href = 'auth.html?mode=login&role=artisan';
  }
}

function logoutUser() {
  try {
    localStorage.removeItem('hunarlink_auth_user');
  } catch (e) {}
  AppState.currentUser = null;
  updateAuthUI();
  showToast("Logged out of Artisan Session.");
}

function handleForgotPassword() {
  window.location.href = 'auth.html?mode=forgot';
}

function handleRegisterClick() {
  window.location.href = 'auth.html?mode=register&role=artisan';
}

window.handleUserLoginClick = handleUserLoginClick;
window.handleSellerLoginClick = handleSellerLoginClick;
window.logoutUser = logoutUser;
window.updateAuthUI = updateAuthUI;

window.openSellerLoginModal = openSellerLoginModal;
window.setAuthRole = setAuthRole;
window.quickFillAuth = quickFillAuth;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleSellerLogin = handleSellerLogin;
window.handleForgotPassword = handleForgotPassword;
window.handleRegisterClick = handleRegisterClick;

function resetDemoStorage() {
  try {
    /* M3 fix: wipe EVERY HunarLink key (including seller inquiries, buyer
       profile, registered users, product overrides & recently-viewed) so a
       "Reset Demo" really returns every portal to its pristine demo state. */
    Object.keys(window.localStorage)
      .filter(k => k.startsWith("hunarlink_") || k.startsWith("hunarsathi_"))
      .forEach(k => window.localStorage.removeItem(k));
  } catch (err) {}
  AppState.currentUser = { ...DEFAULT_BUYER };
  saveStorage('hunarlink_auth_user', AppState.currentUser);
  AppState.customProducts = [];
  AppState.cart = [];
  AppState.savedLater = [];
  AppState.wishlist = ["hl-kani-004", "hl-papr-003", "hl-waln-001"];
  AppState.appliedCoupon = null;
  updateHeaderBadges();
  updateAuthUI();
  resetAllFilters();
  showToast("Demo data restored to initial HunarLink catalog state");
}

/* ==========================================================================
   Secondary Section Nav — Active State Controller
   --------------------------------------------------------------------------
   Rules:
   1. Exactly ONE nav item is highlighted at any time.
   2. The item the visitor clicked is highlighted immediately, and stays
      highlighted while that section is on screen.
   3. The highlight only follows page scroll once the visitor actually scrolls,
      so a click never gets overridden by a stale scroll-spy value.
   ========================================================================== */

/* Nav order → section order on the page (Home → Valley Verification Flow →
   Our Artisans → J&K Heritage Store → Wholesale). Keep this list in sync with
   the DOM order of .snav-item so "next/previous section" logic stays correct. */
const SNAV_SECTIONS = [
  { navId: 'snav-home',      sectionId: 'hero-section' },
  { navId: 'snav-verify',    sectionId: 'verification-section' },
  { navId: 'snav-artisans',  sectionId: 'craft-guilds-section' },
  { navId: 'snav-store',     sectionId: 'marketplace-section' },
  { navId: 'snav-wholesale', sectionId: 'b2b-wholesale-section' }
];

/* Set the single active nav item. This is the ONLY function that may add or
   remove the .active class, so two items can never be highlighted together. */
function snav_setActive(activeId) {
  document.querySelectorAll('.snav-item').forEach(el => {
    const isActive = el.id === activeId;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'true');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}

/* Height of the two sticky bars (main header + section nav) so a section
   heading never lands underneath them. */
function snav_stickyOffset() {
  const header = document.getElementById('site-header');
  const navBar = document.getElementById('section-nav-bar');
  const isNavStatic = navBar && getComputedStyle(navBar).position !== 'sticky';
  const headerH = header ? header.offsetHeight : 0;
  const navH = navBar && !isNavStatic ? navBar.offsetHeight : 0;
  return headerH + navH + 8;
}

/* Scroll a section into view and highlight the clicked nav item right away. */
function snav_scrollTo(navId) {
  const entry = SNAV_SECTIONS.find(s => s.navId === navId);
  if (!entry) return;

  snav_setActive(navId);
  snav_lockUntilUserScroll(navId);

  if (navId === 'snav-home' || entry.sectionId === 'hero-section') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const target = document.getElementById(entry.sectionId);
  if (!target) return;
  const top = Math.max(target.getBoundingClientRect().top + window.pageYOffset - snav_stickyOffset(), 0);
  window.scrollTo({ top, behavior: 'smooth' });
}

/* While a click-initiated smooth scroll is running (and briefly after it ends)
   ignore scroll-spy updates, otherwise the nav flickers through every section
   it passes. The lock is released by a real user gesture (wheel, touch, key). */
let snavLockedNavId = null;
let snavLockTimer = null;

function snav_lockUntilUserScroll(navId) {
  snavLockedNavId = navId;
  clearTimeout(snavLockTimer);
  snavLockTimer = setTimeout(() => { snavLockedNavId = null; }, 1200);
}

function snav_releaseLock() {
  snavLockedNavId = null;
  clearTimeout(snavLockTimer);
}

/* Distance (in px) the page actually scrolled — split to catch bottom overshoot. */
function snav_getScrollY() {
  return window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop || 0;
}

/* Work out which section currently occupies the reading area of the viewport. */
function snav_currentSectionNavId() {
  const offset = snav_stickyOffset();
  const line = snav_getScrollY() + offset + 12;
  let current = SNAV_SECTIONS[0].navId;

  SNAV_SECTIONS.forEach(entry => {
    const el = document.getElementById(entry.sectionId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + snav_getScrollY();
    if (top <= line) current = entry.navId;
  });

  /* Bottom of the page: the last section may be too short to ever reach the
     reading line, so treat "scrolled to the end" as the last nav item. */
  const maxScroll = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight
  ) - window.innerHeight;
  if (maxScroll > 0 && snav_getScrollY() >= maxScroll - 4) {
    current = SNAV_SECTIONS[SNAV_SECTIONS.length - 1].navId;
  }
  return current;
}

/* Single source of truth for the highlight — used by the scroll listener and
   exposed for other pages/components that need to resync. */
function snav_syncToScroll() {
  if (snavLockedNavId) return;
  snav_setActive(snav_currentSectionNavId());
}

/* Keep the bar honest while smooth-scrolling from a click too: if the browser
   reports a position we can trust, re-derive the highlight from it. */
function snav_syncIfDrifted() {
  if (!snavLockedNavId) return;
  const landId = snav_currentSectionNavId();
  if (landId !== snavLockedNavId) return;
  /* Locked item and the derived item agree → keep the lock, it is still valid. */
  snav_setActive(landId);
}

window.snav_setActive = snav_setActive;
window.snav_scrollTo = snav_scrollTo;
window.snav_syncToScroll = snav_syncToScroll;

/* ==========================================================================
   DOM Initialization & Event Listeners
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  /* H1 fix: honor `?q=<term>` (sent by the product-page search box) and other
     deep-link filters like `?gi=` before the first catalog render. */
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const q = (urlParams.get("q") || "").trim();
    if (q) {
      AppState.filters.search = q;
      const searchField = document.getElementById("global-search-input");
      if (searchField) searchField.value = q;
      const clearBtnEarly = document.getElementById("search-clear-btn");
      if (clearBtnEarly) clearBtnEarly.classList.add("visible");
      const storeSection = document.getElementById("marketplace-section");
      if (storeSection) setTimeout(() => storeSection.scrollIntoView({ behavior: "smooth" }), 400);
    }
  } catch (e) {}

  updateHeaderBadges();
  updateAuthUI();
  renderMarketplace();
  renderCompareBar();
  renderHomeRecentViewed();
  selectVerificationStep(1);

  window.addEventListener("focus", () => {
    AppState.customProducts = loadStorage("hunarlink_custom_products", AppState.customProducts);
    AppState.orders = loadStorage("hunarlink_orders", AppState.orders);
    AppState.reviews = loadStorage("hunarlink_reviews", AppState.reviews);
    if (typeof renderMarketplace === "function") renderMarketplace();
    if (typeof renderHomeRecentViewed === "function") {
      renderHomeRecentViewed();
    }
  });

  /* ── Scroll-spy: keep secondary nav active state in sync with page scroll ── */
  (function () {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        if (snavLockedNavId) {
          snav_syncIfDrifted();
        } else {
          snav_syncToScroll();
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    /* A real user gesture always wins over a click-initiated scroll lock. */
    ['wheel', 'touchstart', 'keydown'].forEach(evt => {
      window.addEventListener(evt, () => {
        snav_releaseLock();
        onScroll();
      }, { passive: true });
    });

    /* Honour a #hash deep-link (e.g. index.html#verification-section). */
    const hashSection = window.location.hash ? window.location.hash.replace('#', '') : '';
    if (hashSection) {
      const match = SNAV_SECTIONS.find(s => s.sectionId === hashSection);
      if (match) snav_scrollTo(match.navId);
    }

    /* Initial paint: highlight the section that is actually on screen. */
    snav_syncToScroll();
  })();

  /* Live Search Autocomplete */
  const searchInput = document.getElementById("global-search-input");
  const clearBtn = document.getElementById("search-clear-btn");
  const dropdown = document.getElementById("search-suggestions");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const val = searchInput.value;
      AppState.filters.search = val;
      if (clearBtn) clearBtn.classList.toggle("visible", val.length > 0);
      renderMarketplace();

      if (!dropdown) return;
      if (val.trim().length < 1) {
        dropdown.classList.remove("open");
        return;
      }
      const matches = getFilteredProducts().slice(0, 5);
      if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding: 10px 12px; font-size: 0.78rem; color: var(--text-500);">No matching crafts for "${val}"</div>`;
      } else {
        dropdown.innerHTML = matches.map(p => `
          <button type="button" class="suggestion-item" onclick="openProductPage('${p.id}'); document.getElementById('search-suggestions').classList.remove('open');">
            <img loading="lazy" decoding="async" src="${p.image}" class="suggestion-thumb" alt="${p.title}">
            <div class="suggestion-meta">
              <div class="suggestion-title">${p.title}</div>
              <div class="suggestion-sub">${p.artisan} • ${p.giId}</div>
            </div>
            <div class="suggestion-price">${formatINR(p.price)}</div>
          </button>
        `).join("");
      }
      dropdown.classList.add("open");
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      clearBtn.classList.remove("visible");
      if (dropdown) dropdown.classList.remove("open");
      AppState.filters.search = "";
      renderMarketplace();
    });
  }

  /* Filter Bar Listeners */
  const priceSlider = document.getElementById("price-range-slider");
  const priceVal = document.getElementById("price-slider-val");
  if (priceSlider) {
    priceSlider.addEventListener("input", () => {
      const v = parseInt(priceSlider.value, 10);
      AppState.filters.maxPrice = v;
      if (priceVal) priceVal.textContent = "Up to " + formatINR(v);
      renderMarketplace();
    });
  }

  const ratingFilter = document.getElementById("rating-filter");
  if (ratingFilter) {
    ratingFilter.addEventListener("change", () => {
      AppState.filters.minRating = parseFloat(ratingFilter.value) || 0;
      renderMarketplace();
    });
  }

  const giFilter = document.getElementById("gi-tier-filter");
  if (giFilter) {
    giFilter.addEventListener("change", () => {
      AppState.filters.giTier = parseInt(giFilter.value, 10) || 0;
      renderMarketplace();
    });
  }

  const distFilter = document.getElementById("district-filter");
  if (distFilter) {
    distFilter.addEventListener("change", () => {
      AppState.filters.district = distFilter.value;
      renderMarketplace();
    });
  }

  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      AppState.filters.sortBy = sortSelect.value;
      renderMarketplace();
    });
  }

  /* Profile Menu Toggle */
  const profBtn = document.getElementById("profile-menu-btn");
  const profMenu = document.getElementById("profile-menu");
  if (profBtn && profMenu) {
    profBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profMenu.classList.toggle("open");
    });
    document.addEventListener("click", () => profMenu.classList.remove("open"));
  }

  /* Newsletter Submit */
  const newsForm = document.getElementById("newsletter-form");
  if (newsForm) {
    newsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const emailInp = document.getElementById("newsletter-email");
      if (emailInp && emailInp.value.trim()) {
        showToast(`Subscribed ${emailInp.value.trim()} to The Valley Chronicle!`);
        emailInp.value = "";
      }
    });
  }
});



/* ==========================================================================
   M1 fix: Close modals & drawers with Escape key or by clicking the backdrop
   (applies to marketplace + product page — both load this file)
   ========================================================================== */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".backdrop-overlay.open").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".slide-drawer.open").forEach(d => d.classList.remove("open"));
  const profileMenu = document.getElementById("profile-menu");
  if (profileMenu) profileMenu.classList.remove("open");
});

document.addEventListener("click", (e) => {
  if (!e.target.classList) return;
  if (e.target.classList.contains("backdrop-overlay") && e.target.classList.contains("open")) {
    e.target.classList.remove("open");
  }
});
