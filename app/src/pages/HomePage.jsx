import React, { Suspense, lazy, useEffect, useState } from 'react';
import HeroSection from '../components/sections/HeroSection.jsx';

/* The hero is the only section in the first screen, and it is the only one
   imported eagerly. The four below it — verification, artisans, the 96-card
   marketplace grid, wholesale — were all in the entry chunk, which is why the
   entry was 270 KB and why first paint waited on JavaScript for markup the
   user had not scrolled to yet.

   Each becomes its own chunk. The browser downloads them as soon as the hero
   has mounted, so scrolling down is seamless; what changes is that the first
   frame no longer waits for 96 product cards to be parsed.

   The Suspense fallback is height-reserving rather than a spinner: these
   sections are tall, and an empty box that later grows would move the scroll
   position under the user. */
const VerificationSection = lazy(() => import('../components/sections/VerificationSection.jsx'));
const ArtisansSection = lazy(() => import('../components/sections/ArtisansSection.jsx'));
const MarketplaceSection = lazy(() => import('../components/sections/MarketplaceSection.jsx'));
const WholesaleBanner = lazy(() => import('../components/sections/WholesaleBanner.jsx'));

/* Reserves vertical space so the lazy chunks cannot cause a layout shift. */
function SectionPlaceholder({ height }) {
  return <div style={{ minHeight: height }} aria-hidden="true" />;
}

/* ==========================================================================
   HomePage
   --------------------------------------------------------------------------
   Four sections in the order the nav promises: hero, verification flow,
   the artisan showcase, store, wholesale. The old "Master Craft" guild grid
   was removed on request -- the artisan showcase now carries the
   "Our Artisans" nav item on its own. Scroll-spy used to be a hand-rolled
   intersection walker; it is now a single IntersectionObserver driving one
   piece of state, and only the section actually in view is highlighted.
   ========================================================================== */

const SECTIONS = [
  { id: 'hero-section', nav: 'home' },
  { id: 'verification-section', nav: 'verify' },
  { id: 'artisan-showcase-section', nav: 'artisans' },
  { id: 'marketplace-section', nav: 'store' },
  { id: 'b2b-wholesale-section', nav: 'wholesale' }
];

export default function HomePage({ onSectionChange }) {
  const [active, setActive] = useState('home');

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const match = SECTIONS.find((s) => s.id === visible.target.id);
        if (match) setActive(match.nav);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onSectionChange?.(active);
  }, [active, onSectionChange]);

  return (
    <main id="main-content">
      <HeroSection />
      <Suspense fallback={<SectionPlaceholder height={720} />}>
        <VerificationSection />
        <ArtisansSection />
        <MarketplaceSection />
        <WholesaleBanner />
      </Suspense>
    </main>
  );
}
