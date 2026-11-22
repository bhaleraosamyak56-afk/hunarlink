import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../state/StoreContext.jsx';
import { asset, formatINR } from '../../utils/legacy.js';

/* ==========================================================================
   HeroSection
   --------------------------------------------------------------------------
   Left column: credential ribbon, overline, the rotating location pill, the
   headline, two calls to action, and the artisan proof row. Right column: the
   three-card bento collage. Below: the four-KPI trust bar.

   The location pill cycles through five phrases — a plain interval, with the
   active class swapped rather than the text rewritten.
   ========================================================================== */

const PLACES = [
  'Jammu & Kashmir',
  'Kashmir Handicrafts',
  'GI-Certified Crafts',
  'Handmade in Srinagar',
  'Pashmina \u00b7 Walnut \u00b7 Kani'
];

const BENTO = [
  {
    id: 'hl-pash-002',
    img: 'image_2.jpg',
    alt: 'Jamawar Heirloom Stole',
    main: true,
    pill: '\u2713 GI Certified Loom #108',
    kicker: 'Kani Masterweave \u2022 Srinagar',
    name: 'Jamawar Heirloom Stole'
  },
  {
    id: 'hl-waln-007',
    img: 'image_3.jpg',
    alt: 'Walnut Wood Lattice Carving',
    pill: 'GI Walnut',
    kicker: '300-Yr Seasoned Timber',
    name: 'Lattice Carving'
  },
  {
    id: 'hl-papr-008',
    img: 'image_4.jpg',
    alt: 'Persian Guldan Papier-Mache',
    pill: '24K Naqash',
    kicker: 'Hand-Painted Lacquer',
    name: 'Persian Guldan'
  }
];

export default function HeroSection() {
  const navigate = useNavigate();
  const { openModal, openDrawer, catalogue } = useStore();

  /* The price on the feature card is read from the live catalogue. It used to
     be typed into the string above, which left the hero advertising Rs 1,850
     for a piece the grid below listed at a hundred times that. */
  const featurePrice = catalogue.find((p) => p.id === BENTO[0].id)?.price;
  const [place, setPlace] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPlace((i) => (i + 1) % PLACES.length), 2600);
    return () => clearInterval(t);
  }, []);

  const scrollTo = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section className="hero-section" id="hero-section">
      <div className="container">
        <div className="hero-grid">
          <div className="hero-left">
            {/* The weaver. Deliberately visible -- this is the one photograph
                on the page at full strength, not a background wash, because
                the claim above it is "direct from artisan looms". */}
            <div className="hero-craftsman">
              <img
                src={`${import.meta.env.BASE_URL}img/artisans/artisan-01.jpg`}
                alt="Ustad Nazir Ahmad Bhat at his kani pit-loom in Srinagar"
                width="1024"
                height="1536"
                fetchPriority="high"
              />
              <div className="hero-craftsman-caption">
                <span className="hcc-kicker">Srinagar &middot; Kani pit-loom</span>
                <span className="hcc-name">Ustad Nazir Ahmad Bhat</span>
              </div>
              <div className="hero-craftsman-badge">
                <span className="hcb-num">45</span>
                <span className="hcb-label">
                  years
                  <br />
                  at the loom
                </span>
              </div>
            </div>

            <div className="hero-copy">
            <div className="cred-ribbon">
              <span className="cr-dot" aria-hidden="true" />
              <b>GI-Certified</b>
              <span className="cr-sep" aria-hidden="true">
                &#9670;
              </span>
              <b>Escrow Protected</b>
              <span className="cr-sep" aria-hidden="true">
                &#9670;
              </span>
              <b>Shipped Worldwide</b>
            </div>

            <div className="hero-overline">
              GI-CERTIFIED VALLEY CRAFT MARKETPLACE &bull; TEAM 16
            </div>

            <div className="hero-location-pill">
              <span className="pill-pin" aria-hidden="true" />
              <span className="loc-rotor" aria-hidden="true">
                {PLACES.map((p, i) => (
                  <span
                    key={p}
                    className={`loc-item${i === place ? ' is-active' : ''}`}
                  >
                    {p}
                  </span>
                ))}
              </span>
              <span className="sr-only">
                Srinagar, Jammu &amp; Kashmir — Kashmir handicrafts, GI-certified crafts, pashmina,
                walnut and Kani
              </span>
            </div>

            <h1 className="hero-title">
              Explore Timeless <em>Indian Crafts</em>
            </h1>

            <div className="hero-cta-row">
              <button
                type="button"
                className="btn-primary-forest"
                id="hero-explore-btn"
                onClick={() => scrollTo('marketplace-section')}
              >
                <span>Explore Crafts</span>
                <span>&rarr;</span>
              </button>
              <button
                type="button"
                className="btn-outline-ivory"
                id="hero-verify-btn"
                onClick={() => openModal('giVerify', { giId: 'GI-JK-PASH-8810' })}
              >
                <span>&#128737;&#65039;</span>
                <span>Verify GI Tag / QR</span>
              </button>
            </div>

            <div className="hero-artisan-proof">
              <img
                src={asset('assets/image_1.jpg')}
                alt="Registered Kashmiri Artisans"
                className="proof-thumb"
              />
              <div>
                <div className="proof-title">2,400+ Registered Artisans</div>
                <div className="proof-sub">
                  Direct payout to geo-verified workshops across Srinagar, Budgam &amp; Anantnag
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="hero-bento">
            {BENTO.map((b) => (
              <button
                type="button"
                key={b.id}
                className={`bento-card${b.main ? ' bento-main' : ''}`}
                onClick={() => navigate(`/product?id=${b.id}`)}
              >
                <img
                  src={asset(`assets/${b.img}`)}
                  alt={b.alt}
                  loading={b.main ? undefined : 'lazy'}
                  decoding={b.main ? undefined : 'async'}
                />
                <div className="bento-overlay">
                  <span className="bento-top-pill">
                    {b.pill}
                    {b.main && featurePrice ? ` \u2022 ${formatINR(featurePrice)}` : ''}
                  </span>
                  <div>
                    <span className="bento-kicker">{b.kicker}</span>
                    <div className="bento-name">{b.name}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="trust-bar">
          <button
            type="button"
            className="trust-item"
            onClick={() => scrollTo('craft-guilds-section')}
          >
            <div className="trust-icon-box">&#127963;&#65039;</div>
            <div>
              <div className="trust-value">2,400+</div>
              <div className="trust-label">Direct Valley Artisans</div>
            </div>
          </button>

          <button
            type="button"
            className="trust-item"
            onClick={() => openModal('giVerify', { giId: 'GI-JK-PASH-8821' })}
          >
            <div className="trust-icon-box">&#128205;</div>
            <div>
              <div className="trust-value">100% Origin</div>
              <div className="trust-label">Geo-Tagged Looms</div>
            </div>
          </button>

          <button
            type="button"
            className="trust-item"
            onClick={() => scrollTo('verification-section')}
          >
            <div className="trust-icon-box">&#128300;</div>
            <div>
              <div className="trust-value">3-Layer GI</div>
              <div className="trust-label">Automated Lab Audit</div>
            </div>
          </button>

          <button
            type="button"
            className="trust-item"
            onClick={() => openDrawer('cart')}
          >
            <div className="trust-icon-box">&#129309;</div>
            <div>
              <div className="trust-value">Zero Cut</div>
              <div className="trust-label">Direct Artisan Payouts</div>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}
