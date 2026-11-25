import { ARTISAN_SHOWCASE } from '../data/artisanShowcase.js';

/* ==========================================================================
   Dynamic artisan profile builder
   --------------------------------------------------------------------------
   Groups the live catalogue (seed + seller-published custom crafts) into rich
   artisan profiles with deterministic URL slugs (/artisans/:slug). Editorial
   details from ARTISAN_SHOWCASE enrich featured masters when available; every
   other artisan derives their profile directly from their live listings so
   nothing has to be hardcoded per artisan.
   ========================================================================== */

export function normalizeArtisanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
}

export function artisanSlug(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const featuredByName = new Map(
  ARTISAN_SHOWCASE.map((artisan, index) => [
    normalizeArtisanName(artisan.name),
    { artisan, index }
  ])
);

const TECHNIQUE_LABELS = {
  handwoven: 'Handwoven',
  kani: 'Kani Bobbin Weave',
  sozni: 'Sozni Needlework',
  tilla: 'Tilla Embroidery',
  carved: 'Chisel Carved',
  pinjrakari: 'Pinjrakari Lattice',
  naqashi: 'Naqashi Painting',
  goldleaf: '24K Gold Leaf',
  knotted: 'Hand-Knotted Silk',
  embossed: 'Embossed Relief'
};

function labelTechnique(raw) {
  if (!raw) return '';
  const key = String(raw).trim().toLowerCase();
  if (TECHNIQUE_LABELS[key]) return TECHNIQUE_LABELS[key];
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function deriveBio(entry, mainCraft, mainDistrict, techniqueLabels, maxGiLevel) {
  const craftPhrase = mainCraft || 'traditional Kashmiri craft';
  const place = mainDistrict ? `${mainDistrict}, Jammu & Kashmir` : 'the Kashmir Valley';
  const techList =
    techniqueLabels.length > 1
      ? `${techniqueLabels.slice(0, -1).join(', ')} and ${techniqueLabels[techniqueLabels.length - 1]}`
      : techniqueLabels[0] || craftPhrase;
  const giPhrase =
    maxGiLevel >= 3
      ? 'holding GI Tier-3 provenance verification'
      : 'registered with the HunarLink Valley Craft Guild';
  const pieceWord = entry.listings.length === 1 ? 'curated piece' : `${entry.listings.length} curated pieces`;

  return `Independent master workshop based in ${place}, specialising in ${craftPhrase} (${techList}) and ${giPhrase}. Currently offering ${pieceWord} direct from the loom with zero middleman cut.`;
}

export function collectArtisans(catalogue = [], storeReviews = {}) {
  const grouped = new Map();

  for (const product of catalogue) {
    const name = String(product.artisan || '').trim();
    if (!name) continue;

    const key = normalizeArtisanName(name);
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        key,
        name,
        slug: artisanSlug(name),
        listings: [],
        districts: new Map(),
        guilds: new Map(),
        techniques: new Set(),
        giIds: new Set(),
        maxGiLevel: 0,
        totalLoomHours: 0,
        weightedRatingSum: 0,
        reviewCountSum: 0,
        ratingSum: 0,
        topProduct: product,
        startingPrice: product.price || 0,
        highestPrice: product.price || 0
      };
      grouped.set(key, entry);
    }

    entry.listings.push(product);
    if (product.district) {
      entry.districts.set(product.district, (entry.districts.get(product.district) || 0) + 1);
    }
    if (product.guild) {
      const existing = entry.guilds.get(product.guild) || {
        id: product.guild,
        label: product.guildLabel || product.guild,
        count: 0
      };
      existing.count += 1;
      entry.guilds.set(product.guild, existing);
    }
    if (product.technique) {
      entry.techniques.add(labelTechnique(product.technique));
    }
    if (product.giId) {
      entry.giIds.add(product.giId);
    }
    if ((product.giLevel || 0) > entry.maxGiLevel) {
      entry.maxGiLevel = product.giLevel;
    }
    entry.totalLoomHours += Number(product.loomHours) || 0;

    const r = Number(product.rating) || 4.8;
    const rc = Number(product.reviewCount) || 0;
    entry.ratingSum += r;
    entry.weightedRatingSum += r * Math.max(rc, 1);
    entry.reviewCountSum += rc;

    const price = Number(product.price) || 0;
    if (price > (entry.topProduct.price || 0)) entry.topProduct = product;
    if (price > 0 && (entry.startingPrice === 0 || price < entry.startingPrice)) {
      entry.startingPrice = price;
    }
    if (price > entry.highestPrice) entry.highestPrice = price;
  }

  return [...grouped.values()]
    .map((entry) => {
      const featured = featuredByName.get(entry.key);
      const profile = featured?.artisan;

      const sortedDistricts = [...entry.districts.entries()].sort((a, b) => b[1] - a[1]);
      const mainDistrict = sortedDistricts[0]?.[0] || 'Srinagar';
      const sortedGuilds = [...entry.guilds.values()].sort((a, b) => b.count - a.count);
      const primaryGuild = sortedGuilds[0]?.id || profile?.guild || 'pashmina';
      const mainCraft = profile?.craft || sortedGuilds[0]?.label || 'Jammu & Kashmir Craft';
      const techniqueLabels = [...entry.techniques];

      // Gather live buyer reviews submitted for any of this artisan's pieces
      const liveReviews = [];
      for (const prod of entry.listings) {
        const list = storeReviews?.[prod.id];
        if (Array.isArray(list)) {
          for (const rev of list) {
            liveReviews.push({
              id: rev.id || `${prod.id}-${rev.date || rev.author}`,
              author: rev.author || rev.name || 'Verified Collector',
              city: rev.city || 'India',
              stars: Number(rev.rating || rev.stars) || 5,
              text: rev.comment || rev.text || '',
              date: rev.date || 'Recently',
              productId: prod.id,
              productTitle: prod.title
            });
          }
        }
      }

      const showcaseReviews = (profile?.reviews || []).map((r, i) => ({
        id: `showcase-${entry.slug}-${i}`,
        author: r.author,
        city: r.city,
        stars: r.stars,
        text: r.text,
        date: 'Verified Collector',
        productId: entry.topProduct?.id || '',
        productTitle: entry.topProduct?.title || mainCraft
      }));

      const reviews = [...liveReviews, ...showcaseReviews];
      const baseCount = entry.reviewCountSum + liveReviews.length;
      const avgRating =
        entry.listings.length > 0
          ? entry.weightedRatingSum /
            entry.listings.reduce((sum, p) => sum + Math.max(Number(p.reviewCount) || 0, 1), 0)
          : 4.9;

      const image = profile?.portrait || entry.topProduct?.image || 'assets/image_1.jpg';
      const sortedListings = [...entry.listings].sort(
        (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)
      );

      const skills = [
        ...sortedGuilds.map((g) => g.label),
        ...techniqueLabels,
        entry.maxGiLevel >= 3 ? 'GI Tier-3 Certified' : 'GI Craft Registry',
        `${mainDistrict} Cluster`
      ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

      const credential =
        profile?.credential ||
        `${entry.maxGiLevel >= 3 ? 'GI Tier-3 Verified' : 'GI Registered'} \u00b7 ${mainDistrict} Artisan Cluster`;

      return {
        key: entry.key,
        slug: entry.slug,
        name: entry.name,
        featured: Boolean(profile),
        featuredOrder: featured?.index ?? Number.MAX_SAFE_INTEGER,
        craft: mainCraft,
        primaryGuild,
        guilds: sortedGuilds,
        techniques: techniqueLabels,
        district: mainDistrict,
        districts: sortedDistricts.map(([d]) => d),
        image,
        portrait: profile?.portrait || null,
        coverImage: entry.topProduct?.image || image,
        listings: sortedListings,
        listingCount: sortedListings.length,
        topProduct: entry.topProduct,
        startingPrice: entry.startingPrice,
        highestPrice: entry.highestPrice,
        avgRating: Number(avgRating.toFixed(1)),
        totalReviews: Math.max(baseCount, reviews.length),
        totalLoomHours: entry.totalLoomHours,
        maxGiLevel: entry.maxGiLevel || 2,
        giIds: [...entry.giIds],
        since: profile?.since || null,
        credential,
        bio: profile?.bio || deriveBio(entry, mainCraft, mainDistrict, techniqueLabels, entry.maxGiLevel),
        skills,
        languages: ['Kashmiri', 'Urdu', 'Hindi', 'English'],
        reviews
      };
    })
    .sort((a, b) => a.featuredOrder - b.featuredOrder || a.name.localeCompare(b.name, 'en-IN'));
}

export function findArtisanBySlug(catalogue, slug, storeReviews = {}) {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean) return null;
  const all = collectArtisans(catalogue, storeReviews);
  return all.find((a) => a.slug === clean) || null;
}

export function findSimilarArtisans(allArtisans, current, limit = 3) {
  if (!current) return [];
  const sameGuild = allArtisans.filter(
    (a) => a.slug !== current.slug && a.primaryGuild === current.primaryGuild
  );
  const others = allArtisans.filter(
    (a) => a.slug !== current.slug && a.primaryGuild !== current.primaryGuild
  );
  return [...sameGuild, ...others].slice(0, limit);
}

export function featuredPortraitFor(name) {
  const hit = featuredByName.get(normalizeArtisanName(name));
  return hit?.artisan?.portrait || null;
}
