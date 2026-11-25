import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/StoreContext.jsx';
import { formatINR } from '../utils/legacy.js';
import { IconArrowRight, IconBadgeCheck, IconMapPin, IconSearchScan } from '../components/LineIcons.jsx';

export default function ArtisansPage() {
  const { artisans, catalogue, dbSyncStatus } = useStore();
  const [district, setDistrict] = useState('all');
  const [query, setQuery] = useState('');

  const districts = useMemo(() => {
    const set = new Set();
    (artisans || []).forEach((a) => {
      if (a.workshop_district) set.add(a.workshop_district);
    });
    return ['all', ...Array.from(set).sort()];
  }, [artisans]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (artisans || []).filter((a) => {
      if (district !== 'all' && a.workshop_district !== district) return false;
      if (q) {
        const hay = `${a.name} ${a.store_name} ${a.craft_specialty || ''} ${a.workshop_district || ''} ${a.claimed_gi_code || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [artisans, district, query]);

  return (
    <main className="ap-page" id="main-content">
      <section className="ap-hero">
        <div className="container">
          <div className="ap-kicker">Verified Artisan Directory &middot; Live Database Registry</div>
          <h1 className="ap-title">Master Artisans of Jammu &amp; Kashmir</h1>
          <p className="ap-subtitle">
            Every artisan listed here is verified and loaded live from HunarLink&rsquo;s MySQL /
            database registry.
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'center',
              marginTop: '1.25rem'
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
              <IconSearchScan
                size={15}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  opacity: 0.55
                }}
              />
              <input
                type="search"
                className="up-input"
                style={{ paddingLeft: '36px' }}
                placeholder="Search verified artisans, crafts, GI codes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {districts.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`pill-btn${district === d ? ' active' : ''}`}
                  onClick={() => setDistrict(d)}
                >
                  {d === 'all' ? 'All Districts' : d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBlock: '2rem 4rem' }}>
        {dbSyncStatus === 'loading' ? (
          <p style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.7 }}>
            Loading verified artisans from database&hellip;
          </p>
        ) : filtered.length === 0 ? (
          <div className="up-empty" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
            <h3>No verified artisans found</h3>
            <p style={{ opacity: 0.72, marginTop: '0.4rem' }}>
              No matching verified artisan profiles exist in the database yet.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1.5rem'
            }}
          >
            {filtered.map((a) => {
              const firstCraft = catalogue.find((p) => p.artisanSlug === a.slug);
              return (
                <article
                  key={a.seller_profile_id}
                  className="up-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '1.4rem'
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        marginBottom: '0.6rem'
                      }}
                    >
                      <span
                        className="up-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.75rem'
                        }}
                      >
                        <IconBadgeCheck size={13} />
                        {a.verification_path === 'GI' ? 'GI Verified' : 'Verified Artisan'}
                      </span>
                      {a.workshop_district && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.8rem',
                            opacity: 0.75
                          }}
                        >
                          <IconMapPin size={13} />
                          {a.workshop_district}
                        </span>
                      )}
                    </div>

                    <h2 style={{ fontSize: '1.18rem', margin: '0.2rem 0' }}>{a.name}</h2>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.8 }}>
                      {a.store_name}
                    </div>
                    {a.craft_specialty && (
                      <p style={{ fontSize: '0.88rem', opacity: 0.72, marginTop: '0.45rem' }}>
                        {a.craft_specialty}
                      </p>
                    )}

                    {a.claimed_gi_code && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          fontSize: '0.78rem',
                          fontFamily: 'monospace',
                          opacity: 0.85
                        }}
                      >
                        GI Registry: {a.claimed_gi_code}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid rgba(0,0,0,0.08)',
                      paddingTop: '0.9rem'
                    }}
                  >
                    <div style={{ fontSize: '0.84rem' }}>
                      <strong>{a.listing_count}</strong>{' '}
                      {a.listing_count === 1 ? 'listing' : 'listings'}
                      {a.starting_price != null && (
                        <span> &middot; from {formatINR(Number(a.starting_price))}</span>
                      )}
                    </div>
                    <Link
                      to={`/artisans/${a.slug}`}
                      className="btn btn-primary"
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem' }}
                    >
                      View Workshop <IconArrowRight size={13} />
                    </Link>
                  </div>
                  {firstCraft && <span style={{ display: 'none' }}>{firstCraft.id}</span>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
