/* Gallery construction for the product page, ported from renderPdpThumbnails()
   in the static build. The rules matter: never repeat the hero shot in the
   strip, never reuse a tile twice, and always end on the GI certificate. */

const CERT = 'assets/products/thumb_cert.jpg';

export function buildThumbnails(product, catalogue) {
  const { id, guild, image } = product;
  const pool = (exclude) =>
    catalogue
      .filter((x) => x.guild === guild && x.id !== exclude && x.image !== image)
      .map((x) => x.image);

  if (id === 'hl-waln-001') {
    return [
      { label: 'Editorial View', img: 'assets/products/walnut_01.jpg' },
      { label: 'Carving Detail', img: 'assets/products/thumb_detail.jpg' },
      { label: 'Workshop', img: 'assets/products/thumb_workshop.jpg' },
      { label: 'Artisan', img: 'assets/products/thumb_artisan.jpg' },
      { label: 'Certificate', img: CERT }
    ];
  }

  if (guild === 'pashmina') {
    return [
      { label: 'Draped Look', img: image },
      { label: 'Weave Detail', img: 'assets/products/pashmina_detail.jpg' },
      { label: 'Full Styling', img: 'assets/products/pashmina_02.jpg' },
      { label: 'Kani Border', img: 'assets/products/kani_03.jpg' },
      { label: 'GI Certificate', img: CERT }
    ];
  }

  if (guild === 'kani' || guild === 'sozni') {
    return [
      { label: 'Model View', img: 'assets/products/kani_01.jpg' },
      { label: 'Draped Style', img: 'assets/products/kani_02.jpg' },
      { label: 'Weave Detail', img: 'assets/products/kani_03.jpg' },
      { label: 'Border Detail', img: 'assets/products/kani_04.jpg' },
      { label: 'Full Spread', img: 'assets/products/kani_05.jpg' }
    ];
  }

  if (guild === 'papier-mache') {
    /* Pull from the piece's own guild so twenty listings do not show the same
       four vessels. */
    const picked = [];
    for (const cand of catalogue) {
      if (picked.length >= 3) break;
      if (cand.guild !== guild || cand.id === id) continue;
      if (cand.image === image || picked.includes(cand.image)) continue;
      picked.push(cand.image);
    }
    return [
      { label: 'Craft View', img: image },
      { label: 'Guild Study I', img: picked[0] || image },
      { label: 'Guild Study II', img: picked[1] || image },
      { label: 'Gold Leaf Art', img: picked[2] || 'assets/products/papier_05.jpg' },
      { label: 'GI Certificate', img: CERT }
    ];
  }

  /* Fallback: borrow from the same guild rather than repeating the hero image
     in two of five tiles, which read as a rendering fault. */
  const p = pool(id);
  const walnut = guild === 'walnut';
  return [
    { label: walnut ? 'Editorial View' : 'Full View', img: image },
    {
      label: walnut ? 'Carving Detail' : guild === 'silk-rugs' ? 'Knot Detail' : 'Craft Detail',
      img: p[0] || image
    },
    { label: 'Styling View', img: p[1] || 'assets/image_1.jpg' },
    { label: 'Heritage Look', img: p[2] || 'assets/image_6.jpg' },
    { label: 'GI Certificate', img: CERT }
  ];
}

/* Technique and specification strings, likewise lifted from initPDP(). */
export function techniqueTag(guild) {
  if (guild === 'walnut') return 'HAND-CARVED';
  if (guild === 'silk-rugs') return 'HAND-KNOTTED';
  if (guild === 'papier-mache') return 'NAQASH-LACQUERED';
  return 'HAND-WOVEN';
}

export function techniqueSpec(guild, purityMetric) {
  if (guild === 'walnut') return 'Deep Relief & Openwork Jali / Pinjrakari';
  if (guild === 'pashmina') return '100% Hand-Spun Loom Weave';
  return purityMetric;
}
