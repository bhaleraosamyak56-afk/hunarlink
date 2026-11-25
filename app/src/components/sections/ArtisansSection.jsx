import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { srcSetFor } from '../../data/imageVariants.js';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../state/StoreContext.jsx';
import { asset, formatINR } from '../../utils/legacy.js';
import {
  artisanProfileHref,
  collectArtisans,
  productProfileHref
} from '../../utils/artisans.js';
import { Star } from '../Icons.jsx';

/* ==========================================================================
   ArtisansSection — DB-hydrated featured master artisans on a 12-second loop
   --------------------------------------------------------------------------
   Every slide, portrait (`img/artisans/artisan-01..06.jpg`), GI credential,
   unique artisan UUID (`seller_profile_id`), top-selling heirloom piece
   UUID (`listing_id`), and collector review is hydrated directly from the
   FastAPI database endpoints (`/api/v1/artisans` & `/api/v1/catalog/products`).
   ========================================================================== */

const SLIDE_MS = 12000;

export default function ArtisansSection() {
  const navigate = useNavigate();
  const { catalogue, artisans: dbArtisans, reviews, addToCart, dbSyncStatus } = useStore();

  const allArtisans = useMemo(
    () => collectArtisans(catalogue, reviews, dbArtisans),
    [catalogue, reviews, dbArtisans]
  );

  const showcase = useMemo(() => {
    const featured = allArtisans.filter((a) => a.featured);
    return featured.length ? featured : allArtisans.slice(0, 6);
  }, [allArtisans]);

  const total = showcase.length;
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    if (total > 0 && index >= total) {
      setIndex(0);
    }
  }, [total, index]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.25 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const step = useCallback(
    (delta) => {
      if (!total) return;
      setIndex((i) => (i + delta + total) % total);
    },
    [total]
  );

  const running = !reduced && !held && inView && total > 1;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => step(1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [running, index, step]);

  if (!total) {
    return (
      <section className="artisans-section" id="artisan-showcase-section" ref={sectionRef}>
        <div className="container">
          <div className="section-header-split">
            <div>
              <div className="section-kicker">THE HANDS BEHIND THE HEIRLOOMS</div>
              <h2 className="section-title">Meet the Artisans</h2>
            </div>
            <p className="section-desc artisans-header-note">
              {dbSyncStatus === 'loading'
                ? 'Loading verified master artisans from the HunarLink database\u2026'
                : 'Verified artisan workshops from the HunarLink database appear here.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const artisan = showcase[index] || showcase[0];
  const artisanUrl = artisanProfileHref(artisan);
  const topProduct = artisan.topProduct;
  const theirWork = artisan.listings || [];
  const loomHours = artisan.totalLoomHours || 0;
  const avgWorkRating = artisan.avgRating || 4.9;
  const shownReviews = (artisan.reviews || []).slice(0, 2);
  const avgStars = shownReviews.length
    ? shownReviews.reduce((a, r) => a + (Number(r.stars) || 5), 0) / shownReviews.length
    : avgWorkRating;
  const portraitImg = artisan.portrait || artisan.image;

  return (
    <section className="artisans-section" id="artisan-showcase-section" ref={sectionRef}>
      <div className="container">
        <div className="section-header-split">
          <div>
            <div className="section-kicker">THE HANDS BEHIND THE HEIRLOOMS</div>
            <h2 className="section-title">Meet the Artisans</h2>
          </div>
          <p className="section-desc artisans-header-note">
            {total} featured workshops from our {allArtisans.length} verified database
            artisans, one at a time. Every profile carries the piece that artisan is
            known for and what collectors said after it arrived.
          </p>
        </div>

        <div
          className={`artisan-stage${reduced ? ' is-static' : ''}`}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
          aria-roledescription="carousel"
          aria-label="Featured artisans"
        >
          <div className="artisan-progress" aria-hidden="true">
            <span
              key={`${index}-${running}`}
              className={`artisan-progress-fill${running ? ' is-running' : ''}`}
              style={{ animationDuration: `${SLIDE_MS}ms` }}
            />
          </div>

          <div className="artisan-slide" key={artisan.id}>
            {/* ---------------------------------------------------- portrait */}
            <div className="artisan-portrait-col">
              <Link
                to={artisanUrl}
                className="artisan-portrait"
                style={{ display: 'block', textDecoration: 'none' }}
                aria-label={`Open ${artisan.name}'s full profile`}
              >
                <picture>
                  {srcSetFor(portraitImg) && (
                    <source
                      type="image/webp"
                      srcSet={srcSetFor(portraitImg)}
                      sizes="(max-width: 760px) 100vw, 45vw"
                    />
                  )}
                  <img
                    src={asset(portraitImg)}
                    alt={artisan.name}
                    width="420"
                    height="525"
                  />
                </picture>
                <div className="artisan-portrait-tag">
                  <span className="artisan-since">
                    {artisan.since ? `At the loom since ${artisan.since}` : `${artisan.district} Workshop`}
                  </span>
                </div>
              </Link>
            </div>

            {/* ------------------------------------------------------- story */}
            <div className="artisan-copy-col">
              <div className="artisan-craft-line">{artisan.craft}</div>
              <h3 className="artisan-name">
                <Link
                  to={artisanUrl}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {artisan.name}
                </Link>
              </h3>
              <div className="artisan-credential">{artisan.credential}</div>
              <p className="artisan-bio">{artisan.bio}</p>

              {topProduct && (
                <button
                  type="button"
                  className="artisan-product"
                  onClick={() => navigate(productProfileHref(topProduct))}
                >
                  <span className="artisan-product-thumb">
                    <picture>
                      {srcSetFor(topProduct.image) && (
                        <source
                          type="image/webp"
                          srcSet={srcSetFor(topProduct.image)}
                          sizes="200px"
                        />
                      )}
                      <img
                        src={asset(topProduct.image)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width="160"
                        height="120"
                      />
                    </picture>
                  </span>
                  <span className="artisan-product-copy">
                    <span className="artisan-product-kicker">Their best-selling piece</span>
                    <span className="artisan-product-title">{topProduct.title}</span>
                    <span className="artisan-product-meta">
                      {formatINR(topProduct.price)}
                      <s>{formatINR(topProduct.originalPrice ?? topProduct.mrp)}</s>
                      <span className="artisan-product-dot" aria-hidden="true">
                        &bull;
                      </span>
                      {topProduct.loomHours} loom hours
                    </span>
                  </span>
                  <span className="artisan-product-go" aria-hidden="true">
                    &rarr;
                  </span>
                </button>
              )}

              <div className="artisan-action-row">
                <button
                  type="button"
                  className="btn-primary-forest artisan-shop-btn"
                  onClick={() => navigate(artisanUrl)}
                >
                  <span>View full profile</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
                {topProduct && (
                  <button
                    type="button"
                    className="btn-outline-ivory"
                    onClick={() => addToCart(topProduct.id, 1)}
                  >
                    Add best-seller to bag
                  </button>
                )}
              </div>

              <dl className="artisan-stats">
                <div className="artisan-stat">
                  <dt>Listings</dt>
                  <dd>{theirWork.length || artisan.listingCount}</dd>
                </div>
                <div className="artisan-stat">
                  <dt>Loom hours</dt>
                  <dd>{loomHours.toLocaleString('en-IN')}</dd>
                </div>
                <div className="artisan-stat">
                  <dt>Avg rating</dt>
                  <dd>{avgWorkRating ? avgWorkRating.toFixed(1) : '\u2014'}</dd>
                </div>
                <div className="artisan-stat">
                  <dt>Workshop</dt>
                  <dd>{artisan.district || '\u2014'}</dd>
                </div>
              </dl>
            </div>

            {/* ----------------------------------------------------- reviews */}
            <div className="artisan-review-col">
              <div className="artisan-review-head">
                <span className="artisan-review-score">
                  {avgStars.toFixed(1)} <Star size={13} />
                </span>
                <span className="artisan-review-count">
                  {shownReviews.length || artisan.totalReviews} recent buyer reviews
                </span>
              </div>

              {shownReviews.map((r) => (
                <figure className="artisan-review" key={r.id || r.author + r.city}>
                  <div
                    className="artisan-review-stars"
                    role="img"
                    aria-label={`${r.stars} out of 5 stars`}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} />
                    ))}
                  </div>
                  <blockquote className="artisan-review-text">{r.text}</blockquote>
                  <figcaption className="artisan-review-by">
                    {r.author} <span aria-hidden="true">&middot;</span> {r.city}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------------- controls */}
          <div className="artisan-controls">
            <div className="artisan-dots" role="tablist" aria-label="Choose an artisan">
              {showcase.map((a, i) => (
                <button
                  type="button"
                  key={a.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={a.name}
                  className={`artisan-dot${i === index ? ' is-active' : ''}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>

            <div className="artisan-arrows">
              <button
                type="button"
                className="artisan-arrow"
                onClick={() => step(-1)}
                aria-label="Previous artisan"
              >
                &larr;
              </button>
              <span className="artisan-counter" aria-live="polite">
                {String(index + 1).padStart(2, '0')}{' '}
                <span aria-hidden="true">/</span> {String(total).padStart(2, '0')}
              </span>
              <button
                type="button"
                className="artisan-arrow"
                onClick={() => step(1)}
                aria-label="Next artisan"
              >
                &rarr;
              </button>
            </div>
          </div>
        </div>

        <div className="artisan-directory-cta-row">
          <button
            type="button"
            id="show-more-artisans"
            className="artisan-show-more"
            onClick={() => navigate('/artisans')}
            aria-label="Show more artisans"
          >
            Show more <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>
    </section>
  );
}
