import React, { useEffect, useState } from 'react';
import HeroSection from '../components/sections/HeroSection.jsx';
import VerificationSection from '../components/sections/VerificationSection.jsx';
import GuildsSection from '../components/sections/GuildsSection.jsx';
import MarketplaceSection from '../components/sections/MarketplaceSection.jsx';
import WholesaleBanner from '../components/sections/WholesaleBanner.jsx';

/* ==========================================================================
   HomePage
   --------------------------------------------------------------------------
   Five sections in the order the nav promises: hero, verification flow,
   artisans, store, wholesale. Scroll-spy used to be a hand-rolled
   intersection walker; it is now a single IntersectionObserver driving one
   piece of state, and only the section actually in view is highlighted.
   ========================================================================== */

const SECTIONS = [
  { id: 'hero-section', nav: 'home' },
  { id: 'verification-section', nav: 'verify' },
  { id: 'craft-guilds-section', nav: 'artisans' },
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
      <GuildsSection />
      <MarketplaceSection />
      <WholesaleBanner />
    </main>
  );
}
