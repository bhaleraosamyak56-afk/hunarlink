import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../state/StoreContext.jsx';
import { formatINR } from '../../utils/legacy.js';
import { IconArrowRight, IconBadgeCheck, IconMapPin } from '../LineIcons.jsx';

export default function ArtisansSection() {
  const { artisans, catalogue, addToCart, dbSyncStatus } = useStore();

  const cards = useMemo(() => {
    return (artisans || []).map((a) => {
      const works = catalogue.filter((p) => p.artisanSlug === a.slug);
      const featured = works[0] || null;
      return { artisan: a, works, featured };
    });
  }, [artisans, catalogue]);

  return (
    <section className="artisans-section" id="artisan-showcase-section">
      <div className="container">
        <div className="section-header-split">
          <div>
            <div className="section-kicker">VERIFIED WORKSHOPS &middot; LIVE DATABASE</div>
            <h2 className="section-title">Meet the Artisans</h2>
          </div>
          <p className="section-desc artisans-header-note">
            Every workshop below is loaded live from HunarLink&rsquo;s verified artisan database
            alongside its active craft listings.
          </p>
        </div>

        {dbSyncStatus === 'loading' ? (
          <p style={{ padding: '2rem 0', opacity: 0.72 }}>
            Loading verified artisans from database&hellip;
          </p>
        ) : cards.length === 0 ? (
          <div style={{ padding: '2rem 0', opacity: 0.75 }}>
            No verified artisan workshops are currently published in the database.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
              gap: '1.35rem',
              marginTop: '1.5rem'
            }}
          >
            {cards.map(({ artisan: a, works, featured }) => (
              <article
                key={a.seller_profile_id}
                style={{
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '14px',
                  padding: '1.35rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.9rem'
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.78rem',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#0d5e3a', fontWeight: 600 }}>
                      <IconBadgeCheck size={14} />
                      {a.verification_path === 'GI' ? 'GI Authorized' : 'Verified Artisan'}
                    </span>
                    {a.workshop_district && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', opacity: 0.72 }}>
                        <IconMapPin size={13} />
                        {a.workshop_district}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.12rem', margin: '0.15rem 0' }}>{a.name}</h3>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, opacity: 0.8 }}>{a.store_name}</div>
                  {a.craft_specialty && (
                    <p style={{ fontSize: '0.84rem', opacity: 0.72, marginTop: '0.35rem' }}>
                      {a.craft_specialty}
                    </p>
                  )}
                  {a.claimed_gi_code && (
                    <div style={{ fontSize: '0.76rem', fontFamily: 'monospace', marginTop: '0.5rem', opacity: 0.8 }}>
                      GI: {a.claimed_gi_code}
                    </div>
                  )}
                </div>

                {featured && (
                  <div
                    style={{
                      borderTop: '1px solid rgba(0,0,0,0.07)',
                      paddingTop: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem'
                    }}
                  >
                    <div style={{ fontSize: '0.83rem' }}>
                      <div style={{ fontWeight: 600 }}>{featured.title}</div>
                      <div style={{ opacity: 0.75 }}>{formatINR(featured.price)}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                      onClick={() => addToCart(featured.id, 1)}
                    >
                      Add
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                    {works.length} {works.length === 1 ? 'listing' : 'listings'}
                  </span>
                  <Link
                    to={`/artisans/${a.slug}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.84rem',
                      fontWeight: 600
                    }}
                  >
                    Visit Workshop <IconArrowRight size={13} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Link to="/artisans" className="btn btn-outline">
            Explore All Verified Artisans <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
