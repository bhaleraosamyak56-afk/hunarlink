import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../state/StoreContext.jsx';
import { useClerkBridge } from '../data/clerkConfig.js';
import { fetchArtisanBySlug } from '../services/apiClient.js';
import ProductCard from '../components/ProductCard.jsx';
import { formatINR } from '../utils/legacy.js';
import { IconArrowRight, IconBadgeCheck, IconMapPin, IconShield } from '../components/LineIcons.jsx';

export default function ArtisanProfilePage() {
  const { slug } = useParams();
  const { artisans, catalogue } = useStore();
  const clerkAuth = useClerkBridge();

  const cachedArtisan = useMemo(
    () => (artisans || []).find((a) => a.slug === slug) || null,
    [artisans, slug]
  );

  const [detail, setDetail] = useState(cachedArtisan);
  const [loading, setLoading] = useState(!cachedArtisan);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const token = clerkAuth.isSignedIn && clerkAuth.getToken ? await clerkAuth.getToken() : null;
        const res = await fetchArtisanBySlug(slug, token);
        if (active) {
          setDetail(res);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          if (cachedArtisan) {
            setDetail(cachedArtisan);
          } else {
            setNotFound(true);
          }
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [slug, clerkAuth, cachedArtisan]);

  const works = useMemo(
    () => catalogue.filter((p) => p.artisanSlug === slug),
    [catalogue, slug]
  );

  if (loading && !detail) {
    return (
      <main className="container" id="main-content" style={{ paddingBlock: '4rem', textAlign: 'center' }}>
        <p style={{ opacity: 0.72 }}>Loading artisan workshop from database&hellip;</p>
      </main>
    );
  }

  if (notFound || !detail) {
    return (
      <main className="container" id="main-content" style={{ paddingBlock: '4rem', textAlign: 'center' }}>
        <h1>Artisan not found</h1>
        <p style={{ opacity: 0.72, marginTop: '0.5rem' }}>
          No verified artisan with slug <code>{slug}</code> exists in the HunarLink database.
        </p>
        <Link to="/artisans" className="btn btn-primary" style={{ marginTop: '1.25rem' }}>
          Browse Verified Artisans <IconArrowRight size={14} />
        </Link>
      </main>
    );
  }

  return (
    <main className="ap-page" id="main-content">
      <section className="ap-hero">
        <div className="container">
          <div style={{ marginBottom: '0.9rem', fontSize: '0.86rem' }}>
            <Link to="/artisans">&larr; All Verified Artisans</Link>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <span className="up-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <IconBadgeCheck size={13} />
              {detail.verification_path === 'GI' ? 'GI Authorized Workshop' : 'Verified HunarLink Artisan'}
            </span>
            {detail.workshop_district && (
              <span className="up-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <IconMapPin size={13} />
                {detail.workshop_district}, Jammu &amp; Kashmir
              </span>
            )}
          </div>
          <h1 className="ap-title">{detail.name}</h1>
          <p className="ap-subtitle">
            <strong>{detail.store_name}</strong>
            {detail.craft_specialty ? ` — ${detail.craft_specialty}` : ''}
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem',
              marginTop: '1rem',
              fontSize: '0.88rem'
            }}
          >
            {detail.claimed_gi_code && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <IconShield size={15} />
                GI Code: <code>{detail.claimed_gi_code}</code>
              </span>
            )}
            <span>
              <strong>{works.length}</strong> active craft {works.length === 1 ? 'listing' : 'listings'}
            </span>
            {detail.starting_price != null && (
              <span>Starting from {formatINR(Number(detail.starting_price))}</span>
            )}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBlock: '2rem 4rem' }}>
        <h2 style={{ marginBottom: '1.25rem' }}>Crafts from {detail.store_name}</h2>
        {works.length === 0 ? (
          <div className="up-empty" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <p style={{ opacity: 0.72 }}>
              This verified artisan currently has no active listings published in the database.
            </p>
          </div>
        ) : (
          <div className="product-grid">
            {works.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
