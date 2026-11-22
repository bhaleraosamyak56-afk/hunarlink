import React from 'react';
import { useStore } from '../../state/StoreContext.jsx';
import { GUILD_CARDS } from '../../data/guilds.js';
import { asset } from '../../utils/legacy.js';

/* ==========================================================================
   GuildsSection — Master Craft clusters
   --------------------------------------------------------------------------
   Each card is one button, as in the static build. Clicking a guild card sets
   the marketplace filter and scrolls down to the grid.
   ========================================================================== */

export default function GuildsSection() {
  const { setFilters } = useStore();

  const pick = (guild) => {
    setFilters({ guild });
    document.getElementById('marketplace-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="guilds-section" id="craft-guilds-section">
      <div className="container">
        <div className="section-header-split">
          <div>
            <div className="section-kicker">HERITAGE CRAFT CLUSTERS</div>
            <h2 className="section-title">Master Craft </h2>
          </div>
          <p className="section-desc" style={{ marginTop: 0 }} />
        </div>

        <div className="guilds-bento-grid">
          {GUILD_CARDS.map((g) => (
            <button
              type="button"
              key={g.id}
              className={`guild-bento-card${g.span2 ? ' span-2' : ''}`}
              data-guild={g.id}
              onClick={() => pick(g.id)}
            >
              <img loading="lazy" decoding="async" src={asset(`assets/${g.img}`)} alt={g.alt} />
              <div className="guild-bento-overlay">
                <span className="guild-top-tag">{g.topTag}</span>
                <div className={g.span2 ? 'guild-bottom-row' : undefined}>
                  <div>
                    <div className="guild-card-kicker">{g.kicker}</div>
                    <div className="guild-card-title">{g.title}</div>
                    <p className="guild-card-desc">{g.desc}</p>
                  </div>
                  {g.span2 && <span className="guild-cta-pill">Explore Guild &rarr;</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
