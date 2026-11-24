import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ARTISAN_SHOWCASE } from '../data/artisanShowcase.js';
import { srcSetFor } from '../data/imageVariants.js';
import { useStore } from '../state/StoreContext.jsx';
import { asset } from '../utils/legacy.js';
import '../styles/artisan-directory.css';

const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
const featuredByName = new Map(ARTISAN_SHOWCASE.map((artisan, index) => [
  normalizeName(artisan.name), { artisan, index }
]));

function collectArtisans(catalogue) {
  const grouped = new Map();

  for (const product of catalogue) {
    const name = String(product.artisan || '').trim();
    if (!name) continue;

    const key = normalizeName(name);
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        key,
        name,
        listings: 0,
        districts: new Map(),
        crafts: new Map(),
        topProduct: product
      };
      grouped.set(key, entry);
    }

    entry.listings += 1;
    if (product.district) {
      entry.districts.set(product.district, (entry.districts.get(product.district) || 0) + 1);
    }
    if (product.guildLabel) {
      entry.crafts.set(product.guildLabel, (entry.crafts.get(product.guildLabel) || 0) + 1);
    }
    if ((product.price || 0) > (entry.topProduct.price || 0)) entry.topProduct = product;
  }

  return [...grouped.values()]
    .map((entry) => {
      const featured = featuredByName.get(entry.key);
      const mainDistrict = [...entry.districts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const mainCraft = [...entry.crafts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Jammu & Kashmir craft';
      const profile = featured?.artisan;
      const image = profile?.portrait || entry.topProduct.image;

      return {
        ...entry,
        featured: Boolean(profile),
        featuredOrder: featured?.index ?? Number.MAX_SAFE_INTEGER,
        craft: profile?.craft || mainCraft,
        image,
        district: mainDistrict
      };
    })
    .sort((a, b) => a.featuredOrder - b.featuredOrder || a.name.localeCompare(b.name, 'en-IN'));
}

export default function ArtisansPage() {
  const { catalogue } = useStore();
  const artisans = useMemo(() => collectArtisans(catalogue), [catalogue]);

  return (
    <main className="artisan-directory-page" id="main-content">
      <section className="artisan-directory-hero" aria-labelledby="artisan-directory-title">
        <div className="container artisan-directory-wrap">
          <Link className="artisan-directory-back" to="/">
            <span aria-hidden="true">&larr;</span> Back to HunarLink
          </Link>
          <div className="artisan-directory-heading">
            <div>
              <p className="artisan-directory-kicker">THE HANDS BEHIND THE HEIRLOOMS</p>
              <h1 id="artisan-directory-title">Our Artisans</h1>
              <p className="artisan-directory-intro">
                Meet every artisan represented in the current HunarLink collection.
                Each profile is grouped from their live craft listings.
              </p>
            </div>
            <div className="artisan-directory-count" aria-live="polite">
              <strong>{artisans.length}</strong>
              <span>{artisans.length === 1 ? 'artisan' : 'artisans'}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="artisan-directory-list" aria-label="Artisan directory">
        <div className="container artisan-directory-wrap">
          {artisans.length ? (
            <div className="artisan-directory-grid">
              {artisans.map((artisan) => {
                const srcSet = srcSetFor(artisan.image);
                return (
                  <article className="artisan-directory-card" key={artisan.key}>
                    <div className="artisan-directory-image">
                      <picture>
                        {srcSet && (
                          <source
                            type="image/webp"
                            srcSet={srcSet}
                            sizes="(max-width: 640px) 92vw, (max-width: 1000px) 45vw, 30vw"
                          />
                        )}
                        <img
                          src={asset(artisan.image)}
                          alt={artisan.featured ? `${artisan.name} at work` : `${artisan.craft} by ${artisan.name}`}
                          loading="lazy"
                          decoding="async"
                        />
                      </picture>
                      {artisan.featured && <span className="artisan-directory-featured">Featured artisan</span>}
                    </div>
                    <div className="artisan-directory-card-body">
                      <p className="artisan-directory-craft">{artisan.craft}</p>
                      <h2>{artisan.name}</h2>
                      <div className="artisan-directory-meta">
                        {artisan.district && <span>{artisan.district}</span>}
                        <span>{artisan.listings} {artisan.listings === 1 ? 'listing' : 'listings'}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="artisan-directory-empty">No artisan listings are available yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
