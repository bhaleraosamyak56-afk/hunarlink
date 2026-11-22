import React, { useEffect, useState } from 'react';
import HeroSection from '../components/sections/HeroSection.jsx';
import VerificationSection from '../components/sections/VerificationSection.jsx';
import ArtisansSection from '../components/sections/ArtisansSection.jsx';
import MarketplaceSection from '../components/sections/MarketplaceSection.jsx';
import WholesaleBanner from '../components/sections/WholesaleBanner.jsx';

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
      <VerificationSection />
      <ArtisansSection />
      <MarketplaceSection />
      <WholesaleBanner />
    </main>
  );
}
