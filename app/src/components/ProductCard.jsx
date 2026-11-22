import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/StoreContext.jsx';
import { formatINR } from '../utils/legacy.js';
import { Heart, Bag, ShieldCheck, Star } from './Icons.jsx';

/* ==========================================================================
   ProductCard
   --------------------------------------------------------------------------
   Markup is kept structurally identical to the card produced by the legacy
   renderer, so the existing stylesheet applies without a single override.
   Behaviour moves from inline onclick attributes to handlers, which is the
   whole point of the port: no global functions, no string-built HTML.
   ========================================================================== */

function ProductCard({ product: p, onBuyNow }) {
  const navigate = useNavigate();
  const { wishlist, compareList, addToCart, toggleWishlist, toggleCompare } = useStore();

  const isWished = wishlist.includes(p.id);
  const isCompared = compareList.includes(p.id);
  const discountPct = Math.round(((p.mrp - p.price) / p.mrp) * 100);

  const open = () => navigate(`/product?id=${encodeURIComponent(p.id)}`);

  return (
    <article className="product-card" data-product-id={p.id}>
      <div
        className="product-img-wrap"
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <img loading="lazy" decoding="async" src={p.image} alt={p.title} />
        <span className="product-gi-pill">
          <ShieldCheck size={12} /> {p.giId}
        </span>
        <button
          type="button"
          className={`product-wish-btn${isWished ? ' wishlisted' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleWishlist(p.id);
          }}
          aria-label={isWished ? `Remove ${p.title} from wishlist` : `Save ${p.title} to wishlist`}
          aria-pressed={isWished}
        >
          <Heart filled={isWished} size={17} />
        </button>
        <label className="product-compare-bar" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isCompared}
            onChange={() => toggleCompare(p.id)}
          />
          Compare
        </label>
      </div>

      <div className="product-body">
        <div className="product-meta-top">
          <span className="product-guild-tag">{p.guildLabel}</span>
          <span className="product-rating-badge">
            {p.rating.toFixed(1)} <Star size={11} /> ({p.reviewCount})
          </span>
        </div>

        <button type="button" className="product-title-btn" onClick={open}>
          {p.title}
        </button>

        <p className="product-artisan-line">
          by {p.artisan} &bull; {p.district}
        </p>

        <div className="product-purity-chip">{p.purityMetric}</div>

        <div className="product-footer-row">
          <div>
            <div className="price-kicker">Direct Artisan Price ({discountPct}% Off)</div>
            <div>
              <span className="price-main">{formatINR(p.price)}</span>
              <span className="price-mrp">{formatINR(p.mrp)}</span>
            </div>
          </div>
        </div>

        <div className="product-card-actions">
          <button
            type="button"
            className="btn-card-cart"
            onClick={(e) => {
              e.stopPropagation();
              addToCart(p.id, 1);
            }}
            title={`Add ${p.title} to Bag`}
            aria-label={`Add ${p.title} to Cart`}
          >
            <span className="btn-icon"><Bag size={14} /></span> Add to Cart
          </button>
          <button
            type="button"
            className="btn-card-buy"
            onClick={(e) => {
              e.stopPropagation();
              onBuyNow ? onBuyNow(p.id) : addToCart(p.id, 1);
            }}
            title={`Buy ${p.title} Now`}
            aria-label={`Buy ${p.title} Now`}
          >
            <span className="btn-icon">&#9889;</span> Buy Now
          </button>
        </div>
      </div>
    </article>
  );
}

export default memo(ProductCard);
