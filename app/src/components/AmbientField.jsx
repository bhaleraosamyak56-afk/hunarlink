import React, { useEffect, useRef } from 'react';

/* ==========================================================================
   AmbientField — a slow fluid colour field behind the whole site
   --------------------------------------------------------------------------
   Five soft colour blobs drift across an extremely small canvas (160 x 100).
   The canvas is then stretched to fill the viewport by CSS, so the browser's
   own image smoothing does the blurring for free.

   Why not a real fluid simulation
   -------------------------------
   A Navier-Stokes solve at 60fps on a full-screen canvas costs real battery
   on a laptop and will stutter on a mid-range phone, which is a bad trade for
   something that is meant to be barely perceptible. Drawing 16,000 pixels per
   frame and letting the compositor upscale it gives the same impression for
   roughly a thousandth of the work.

   Three safety valves, all on by default:
   - `prefers-reduced-motion` draws a single static frame and stops;
   - the loop stops while the tab is hidden;
   - the frame rate is capped well below the display rate, because nothing
     here moves fast enough to justify 60fps.
   ========================================================================== */

const W = 220;
const H = 140;
const FRAME_MS = 1000 / 24;

/* Palette pulled from the design tokens so the field can never drift out of
   the site's own colours. */
const BLOBS = [
  /* Weighted towards cream, sage and pale gold. The first version leaned on
     the terracotta and forest tokens, which at soft-light strength read as
     brown stains across the page rather than as light moving behind it. */
  { rgb: [232, 214, 168], x: 0.2,  y: 0.28, r: 0.72, sx: 0.09, sy: 0.06, ax: 0.18, ay: 0.13 },
  { rgb: [176, 196, 170], x: 0.76, y: 0.2,  r: 0.66, sx: 0.07, sy: 0.09, ax: 0.2,  ay: 0.11 },
  { rgb: [226, 186, 140], x: 0.52, y: 0.7,  r: 0.62, sx: 0.11, sy: 0.05, ax: 0.19, ay: 0.15 },
  { rgb: [206, 214, 198], x: 0.3,  y: 0.86, r: 0.7,  sx: 0.06, sy: 0.08, ax: 0.13, ay: 0.17 },
  { rgb: [198, 158, 118], x: 0.88, y: 0.66, r: 0.56, sx: 0.1,  sy: 0.05, ax: 0.16, ay: 0.1  },
  { rgb: [240, 232, 210], x: 0.5,  y: 0.44, r: 0.8,  sx: 0.05, sy: 0.07, ax: 0.22, ay: 0.18 }
];

export default function AmbientField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    canvas.width = W;
    canvas.height = H;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    let raf = 0;
    let last = 0;
    let t = 0;

    const paint = () => {
      ctx.clearRect(0, 0, W, H);

      BLOBS.forEach((b, i) => {
        /* Each blob walks its own slow lissajous path. Two sine terms at
           different rates keep the loop from visibly repeating. */
        const x = b.x + Math.sin(t * b.sx + i) * b.ax + Math.sin(t * b.sx * 0.37) * 0.05;
        const y = b.y + Math.cos(t * b.sy + i * 1.7) * b.ay + Math.cos(t * b.sy * 0.43) * 0.04;
        const r = b.r * (0.82 + 0.18 * Math.sin(t * 0.19 + i * 2.1));

        const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W);
        const [rr, gg, bb] = b.rgb;
        g.addColorStop(0, `rgba(${rr}, ${gg}, ${bb}, 0.5)`);
        g.addColorStop(0.45, `rgba(${rr}, ${gg}, ${bb}, 0.22)`);
        g.addColorStop(1, `rgba(${rr}, ${gg}, ${bb}, 0)`);

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x * W, y * H, r * W, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      /* the elapsed time is accumulated rather than assumed, so a tab that was
         throttled in the background resumes where it left off instead of
         jumping the blobs to a new position */
      t += Math.min((now - last) / 1000, 0.12);
      last = now;
      paint();
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const apply = () => {
      if (reduce.matches) {
        stop();
        paint();
      } else if (!document.hidden) {
        start();
      }
    };

    const onVisibility = () => (document.hidden ? stop() : apply());

    apply();
    reduce.addEventListener('change', apply);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      reduce.removeEventListener('change', apply);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="ambient-field"
      aria-hidden="true"
      role="presentation"
    />
  );
}
