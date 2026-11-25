/* ==========================================================================
   responsiveImage
   --------------------------------------------------------------------------
   Turns a catalogue/asset path like "assets/products/kani_01.jpg" into a
   <picture> source set backed dynamically by the generated HD manifest in
   src/data/imageVariants.js (zero hardcoded widths).
   ========================================================================== */

import { widthsFor, srcSetFor, hdSrcFor } from '../data/imageVariants.js';

const DEFAULT_SIZES = {
  'assets/products/': '(max-width: 620px) 100vw, (max-width: 1024px) 50vw, 34vw',
  'img/artisans/': '(max-width: 760px) 100vw, 45vw',
  'assets/': '(max-width: 760px) 100vw, 52vw',
  'img/': '100vw'
};

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i + 1);
}

function stemOf(path) {
  return path.replace(/\.(jpe?g|png)$/i, '');
}

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export function webpSources(path) {
  if (!path) return null;
  const widths = widthsFor(path);
  if (!widths.length) return null;
  const stem = stemOf(path);
  return widths.map((w) => ({
    width: w,
    src: `${BASE}/${stem}-${w}.webp`,
    srcSet: `${BASE}/${stem}-${w}.webp ${w}w`
  }));
}

export function sizesFor(path) {
  if (!path) return undefined;
  return DEFAULT_SIZES[dirOf(path)];
}

export { srcSetFor, hdSrcFor };

/* Convenience: everything a <picture> source needs in one call. Returns null
   when no WebP variants exist for that path. */
export default function responsiveImage(path) {
  const srcSet = srcSetFor(path);
  if (!srcSet) return null;
  return {
    srcSet,
    sizes: sizesFor(path)
  };
}
