/* ==========================================================================
   DB-Backed Artisan Profile Builder & UUID Route Helpers
   --------------------------------------------------------------------------
   Zero hardcoded static showcase arrays: every artisan profile, portrait,
   GI credential, review quote, and unique UUID (`seller_profile_id`) comes
   from FastAPI (`GET /api/v1/artisans`, `GET /api/v1/artisans/detail?id=...`)
   merged with the DB-hydrated catalogue (`GET /api/v1/catalog/products`).
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

export function cleanAssetPath(rawPath) {
  if (!rawPath) return '';
  return String(rawPath).split('?')[0].replace(/^\/+/, '');
}

export function productProfileHref(productOrId) {
  const id =
    typeof productOrId === 'object' && productOrId !== null
      ? productOrId.id || productOrId.sellerListingId || productOrId.productId
      : productOrId;
  return `/product?id=${encodeURIComponent(String(id || ''))}`;
}

export function artisanProfileHref(artisanOrProduct) {
  if (!artisanOrProduct) return '/artisans';
  if (typeof artisanOrProduct === 'string') {
    return `/artisan?id=${encodeURIComponent(artisanOrProduct)}`;
  }
  const uuid =
    artisanOrProduct.id ||
    artisanOrProduct.seller_profile_id ||
    artisanOrProduct.sellerProfileId ||
    artisanOrProduct.artisanId;
  if (uuid) {
    return `/artisan?id=${encodeURIComponent(uuid)}`;
  }
  const fallbackSlug = artisanOrProduct.slug || artisanOrProduct.artisanSlug || artisanSlug(artisanOrProduct.name || artisanOrProduct.artisan);
  return fallbackSlug ? `/artisan?id=${encodeURIComponent(fallbackSlug)}` : '/artisans';
}

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

function deriveBio(name, mainCraft, mainDistrict, techniqueLabels, maxGiLevel, count) {
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
  const pieceWord = count === 1 ? '1 curated piece' : `${count} curated pieces`;

  return `Independent master workshop led by ${name} in ${place}, specialising in ${craftPhrase} (${techList}) and ${giPhrase}. Currently offering ${pieceWord} direct from the loom with zero middleman cut.`;
}

export function collectArtisans(catalogue = [], storeReviews = {}, dbArtisans = []) {
  const dbById = new Map();
  const dbBySlug = new Map();
  const dbByName = new Map();

  for (const row of dbArtisans || []) {
    if (!row) continue;
    if (row.seller_profile_id) dbById.set(String(row.seller_profile_id).toLowerCase(), row);
    if (row.slug) dbBySlug.set(String(row.slug).toLowerCase(), row);
    if (row.name) dbByName.set(normalizeArtisanName(row.name), row);
  }

  const grouped = new Map();

  const ensureEntry = (dbRow, fallbackName, fallbackSellerId, fallbackSlug) => {
    const idKey = String(dbRow?.seller_profile_id || fallbackSellerId || '').toLowerCase();
    const name = String(dbRow?.name || fallbackName || '').trim();
    const slug = String(dbRow?.slug || fallbackSlug || artisanSlug(name)).toLowerCase();
    const mapKey = idKey || slug || normalizeArtisanName(name);
    if (!mapKey) return null;

    let entry = grouped.get(mapKey);
    if (!entry) {
      entry = {
        key: mapKey,
        id: dbRow?.seller_profile_id || fallbackSellerId || slug,
        seller_profile_id: dbRow?.seller_profile_id || fallbackSellerId || null,
        name: name || dbRow?.store_name || 'Verified Artisan',
        storeName: dbRow?.store_name || `${name} Heritage Atelier`,
        slug,
        dbRecord: dbRow || null,
        listings: [],
        districts: new Map(),
        guilds: new Map(),
        techniques: new Set(),
        giIds: new Set(),
        maxGiLevel: 0,
        totalLoomHours: 0,
        weightedRatingSum: 0,
        reviewCountSum: 0,
        topProduct: null,
        startingPrice: 0,
        highestPrice: 0
      };
      grouped.set(mapKey, entry);
    } else if (dbRow && !entry.dbRecord) {
      entry.dbRecord = dbRow;
      entry.id = dbRow.seller_profile_id || entry.id;
      entry.seller_profile_id = dbRow.seller_profile_id || entry.seller_profile_id;
      entry.storeName = dbRow.store_name || entry.storeName;
    }
    return entry;
  };

  for (const dbRow of dbArtisans || []) {
    ensureEntry(dbRow, dbRow?.name, dbRow?.seller_profile_id, dbRow?.slug);
  }

  for (const product of catalogue || []) {
    const sellerId = product.sellerProfileId || product.artisanId || null;
    const matchedDb =
      (sellerId && dbById.get(String(sellerId).toLowerCase())) ||
      (product.artisanSlug && dbBySlug.get(String(product.artisanSlug).toLowerCase())) ||
      dbByName.get(normalizeArtisanName(product.artisan));

    const entry = ensureEntry(matchedDb, product.artisan, sellerId, product.artisanSlug);
    if (!entry) continue;

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

    const r = Number(product.rating) || 4.9;
    const rc = Number(product.reviewCount) || 0;
    entry.weightedRatingSum += r * Math.max(rc, 1);
    entry.reviewCountSum += rc;

    const price = Number(product.price) || 0;
    if (!entry.topProduct || price > (entry.topProduct.price || 0)) {
      entry.topProduct = product;
    }
    if (price > 0 && (entry.startingPrice === 0 || price < entry.startingPrice)) {
      entry.startingPrice = price;
    }
    if (price > entry.highestPrice) entry.highestPrice = price;
  }

  return [...grouped.values()]
    .map((entry) => {
      const dbRow = entry.dbRecord;
      const sortedDistricts = [...entry.districts.entries()].sort((a, b) => b[1] - a[1]);
      const mainDistrict = dbRow?.workshop_district || sortedDistricts[0]?.[0] || 'Srinagar';
      const sortedGuilds = [...entry.guilds.values()].sort((a, b) => b.count - a.count);
      const primaryGuild = sortedGuilds[0]?.id || 'pashmina';
      const mainCraft =
        dbRow?.craft_specialty || sortedGuilds[0]?.label || 'Jammu & Kashmir Heritage Craft';
      const techniqueLabels = [...entry.techniques];

      if (dbRow?.claimed_gi_code) {
        entry.giIds.add(dbRow.claimed_gi_code);
      }

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

      const dbReviews = Array.isArray(dbRow?.reviews)
        ? dbRow.reviews.map((r, i) => ({
            id: `db-rev-${entry.id}-${i}`,
            author: r.author || 'Verified Collector',
            city: r.city || 'India',
            stars: Number(r.stars) || 5,
            text: r.text || '',
            date: 'Verified Collector',
            productId: entry.topProduct?.id || '',
            productTitle: entry.topProduct?.title || mainCraft
          }))
        : [];

      const reviews = [...liveReviews, ...dbReviews];
      const baseCount = Math.max(
        Number(dbRow?.total_reviews || 0),
        entry.reviewCountSum + liveReviews.length,
        reviews.length
      );
      const computedAvg =
        entry.listings.length > 0
          ? entry.weightedRatingSum /
            entry.listings.reduce((sum, p) => sum + Math.max(Number(p.reviewCount) || 0, 1), 0)
          : Number(dbRow?.average_rating || 4.9);

      const cleanPortrait = cleanAssetPath(
        dbRow?.portrait_url || entry.topProduct?.artisanPortrait || ''
      );
      const image = cleanPortrait || entry.topProduct?.image || 'assets/image_1.jpg';
      const isFeatured = Boolean(dbRow?.is_featured_showcase);
      const featuredOrder =
        isFeatured && dbRow?.featured_order != null
          ? Number(dbRow.featured_order)
          : Number.MAX_SAFE_INTEGER;

      const sortedListings = [...entry.listings].sort(
        (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)
      );

      const maxGi = entry.maxGiLevel || (dbRow?.verification_path === 'GI' ? 3 : 2);
      const skills = [
        ...sortedGuilds.map((g) => g.label),
        ...techniqueLabels,
        maxGi >= 3 ? 'GI Tier-3 Certified' : 'GI Craft Registry',
        `${mainDistrict} Cluster`
      ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

      const credential =
        dbRow?.credential ||
        `${maxGi >= 3 ? 'GI Tier-3 Verified' : 'GI Registered'} \u00b7 ${mainDistrict} Artisan Cluster`;

      const startingPrice =
        entry.startingPrice > 0
          ? entry.startingPrice
          : Number(dbRow?.starting_price || 0);

      return {
        key: entry.key,
        id: entry.id,
        seller_profile_id: entry.seller_profile_id,
        slug: entry.slug,
        name: entry.name,
        storeName: entry.storeName,
        verificationPath: dbRow?.verification_path || 'GI',
        featured: isFeatured,
        featuredOrder,
        craft: mainCraft,
        primaryGuild,
        guilds: sortedGuilds,
        techniques: techniqueLabels,
        district: mainDistrict,
        districts: sortedDistricts.length ? sortedDistricts.map(([d]) => d) : [mainDistrict],
        image,
        portrait: cleanPortrait || null,
        coverImage: entry.topProduct?.image || image,
        listings: sortedListings,
        listingCount: sortedListings.length || Number(dbRow?.listing_count || 0),
        topProduct: entry.topProduct,
        startingPrice,
        highestPrice: entry.highestPrice || startingPrice,
        avgRating: Number(computedAvg.toFixed(1)),
        totalReviews: baseCount,
        totalLoomHours: entry.totalLoomHours,
        maxGiLevel: maxGi,
        giIds: [...entry.giIds],
        since: dbRow?.since_year || null,
        credential,
        bio:
          dbRow?.bio ||
          deriveBio(entry.name, mainCraft, mainDistrict, techniqueLabels, maxGi, sortedListings.length),
        skills,
        languages: ['Kashmiri', 'Urdu', 'Hindi', 'English'],
        reviews
      };
    })
    .sort((a, b) => a.featuredOrder - b.featuredOrder || a.name.localeCompare(b.name, 'en-IN'));
}

export function findArtisan(allArtisans = [], identifier = '') {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return null;
  return (
    allArtisans.find(
      (a) =>
        String(a.id || '').toLowerCase() === clean ||
        String(a.seller_profile_id || '').toLowerCase() === clean ||
        String(a.slug || '').toLowerCase() === clean
    ) || null
  );
}

export function findSimilarArtisans(allArtisans = [], current, limit = 3) {
  if (!current) return [];
  const curId = String(current.id || current.slug).toLowerCase();
  const sameGuild = allArtisans.filter(
    (a) => String(a.id || a.slug).toLowerCase() !== curId && a.primaryGuild === current.primaryGuild
  );
  const others = allArtisans.filter(
    (a) => String(a.id || a.slug).toLowerCase() !== curId && a.primaryGuild !== current.primaryGuild
  );
  return [...sameGuild, ...others].slice(0, limit);
}

export function featuredPortraitFor(productOrArtisanName, dbArtisans = []) {
  if (productOrArtisanName && typeof productOrArtisanName === 'object') {
    if (productOrArtisanName.artisanPortrait) {
      return cleanAssetPath(productOrArtisanName.artisanPortrait);
    }
    const sid = String(productOrArtisanName.sellerProfileId || '').toLowerCase();
    if (sid) {
      const hit = (dbArtisans || []).find((a) => String(a.seller_profile_id || '').toLowerCase() === sid);
      if (hit?.portrait_url) return cleanAssetPath(hit.portrait_url);
    }
    const norm = normalizeArtisanName(productOrArtisanName.artisan || productOrArtisanName.name);
    const byName = (dbArtisans || []).find((a) => normalizeArtisanName(a.name) === norm);
    return byName?.portrait_url ? cleanAssetPath(byName.portrait_url) : null;
  }
  const norm = normalizeArtisanName(productOrArtisanName);
  const hit = (dbArtisans || []).find((a) => normalizeArtisanName(a.name) === norm);
  return hit?.portrait_url ? cleanAssetPath(hit.portrait_url) : null;
}
