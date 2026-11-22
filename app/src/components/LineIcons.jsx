/* ==========================================================================
   LineIcons — the small set of single-stroke icons the account pages need.
   --------------------------------------------------------------------------
   These replace emoji, which was the main reason the sign-in page read as
   machine-assembled: a coloured emoji cannot inherit the type colour, sits on
   a different baseline in every browser, and clashes with a serif wordmark.

   Rules: 24x24 viewBox, no fill, stroke follows `currentColor`, stroke-width
   1.7 so they sit at the same optical weight as 13px Jakarta Sans labels.
   Callers set size with `width`/`height`; colour comes from CSS.
   ========================================================================== */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false'
};

const Svg = ({ size = 16, children, ...rest }) => (
  <svg {...base} width={size} height={size} {...rest}>
    {children}
  </svg>
);

/* ---- people ---- */
export const IconUser = (p) => (
  <Svg {...p}>
    <path d="M20 21v-1.6A4.4 4.4 0 0 0 15.6 15H8.4A4.4 4.4 0 0 0 4 19.4V21" />
    <circle cx="12" cy="7.5" r="3.7" />
  </Svg>
);

/* a four-point craft star: the artisan mark, drawn rather than emoji */
export const IconSpark = (p) => (
  <Svg {...p}>
    <path d="M12 3.2l1.9 5.1a3 3 0 0 0 1.8 1.8l5.1 1.9-5.1 1.9a3 3 0 0 0-1.8 1.8L12 20.8l-1.9-5.1a3 3 0 0 0-1.8-1.8L3.2 12l5.1-1.9a3 3 0 0 0 1.8-1.8z" />
  </Svg>
);

export const IconLogin = (p) => (
  <Svg {...p}>
    <path d="M14.5 3.5h3.2A2.3 2.3 0 0 1 20 5.8v12.4a2.3 2.3 0 0 1-2.3 2.3h-3.2" />
    <path d="M9.5 16.5 14 12 9.5 7.5M14 12H3.5" />
  </Svg>
);

export const IconUserPlus = (p) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.6" />
    <path d="M2.8 20.5v-1.4A4.2 4.2 0 0 1 7 14.9h5a4.2 4.2 0 0 1 4.2 4.2v1.4" />
    <path d="M19 7.2v5M21.5 9.7h-5" />
  </Svg>
);

/* ---- the two verification marks ---- */
export const IconHandshake = (p) => (
  <Svg {...p}>
    <path d="m10.2 12.6 1.7 1.7a1.6 1.6 0 0 0 2.3-2.3l-3-3a2.4 2.4 0 0 0-3.4 0L6 10.8" />
    <path d="M2.5 9.5 6 6h4l2.2 2.2M21.5 9.5 18 6h-2.5" />
    <path d="m13.9 15.9 1.4 1.4M12.2 17.6l1.4 1.4" />
  </Svg>
);

export const IconBadgeCheck = (p) => (
  <Svg {...p}>
    <path d="M12 2.8l2.4 1.7 2.9-.3 1.2 2.7 2.5 1.5-1 2.8 1 2.8-2.5 1.5-1.2 2.7-2.9-.3L12 21.2l-2.4-1.7-2.9.3-1.2-2.7-2.5-1.5 1-2.8-1-2.8 2.5-1.5 1.2-2.7 2.9.3z" />
    <path d="m8.9 12.2 2 2 4.2-4.4" />
  </Svg>
);

export const IconSeedling = (p) => (
  <Svg {...p}>
    <path d="M12 21v-7.5" />
    <path d="M12 13.5C12 10 9.4 7.6 5.5 7.6c0 3.6 2.6 5.9 6.5 5.9z" />
    <path d="M12 13.5c0-3 2.2-5.2 5.6-5.2 0 3.1-2.2 5.2-5.6 5.2z" />
  </Svg>
);

/* ---- perk rail ---- */
export const IconTruck = (p) => (
  <Svg {...p}>
    <path d="M2.5 6.5h10.2v9.8H2.5zM12.7 10h4l3 3.2v3.1h-7z" />
    <circle cx="6.4" cy="18.4" r="1.7" />
    <circle cx="16.6" cy="18.4" r="1.7" />
  </Svg>
);

export const IconShield = (p) => (
  <Svg {...p}>
    <path d="M12 3.2 4.6 6v5.6c0 4.3 3 7.5 7.4 9.2 4.4-1.7 7.4-4.9 7.4-9.2V6z" />
    <path d="m9 11.9 2.1 2.1 4-4.1" />
  </Svg>
);

export const IconBookmark = (p) => (
  <Svg {...p}>
    <path d="M6 3.5h12v17l-6-4.2-6 4.2z" />
  </Svg>
);

export const IconArrowRight = (p) => (
  <Svg {...p}>
    <path d="M4.5 12h14.2M13 6.2l5.7 5.8-5.7 5.8" />
  </Svg>
);

export const IconCheck = ({ size = 11, ...p }) => (
  <svg {...base} width={size} height={size} strokeWidth={2.8} {...p}>
    <path d="m4.5 12.5 5 5 10-10" />
  </svg>
);

export const IconX = ({ size = 11, ...p }) => (
  <svg {...base} width={size} height={size} strokeWidth={2.6} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
