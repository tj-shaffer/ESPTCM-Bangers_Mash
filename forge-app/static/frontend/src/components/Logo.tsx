/**
 * Bangers & Mash brand mark (from the Intercompany Billing design): a blue-gradient
 * rounded tile with a white "spark" glyph and a warm-orange dot tucked into the
 * bottom-right corner. Fixed brand colours (a logo shouldn't invert in dark mode).
 */

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Bangers & Mash">
      <defs>
        <linearGradient id="bm-tile" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F9BD9" />
          <stop offset="1" stopColor="#2B6CA3" />
        </linearGradient>
        <clipPath id="bm-clip">
          <rect width="48" height="48" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#bm-clip)">
        <rect width="48" height="48" fill="url(#bm-tile)" />
        <circle cx="44" cy="44" r="14" fill="#F47B3F" opacity="0.95" />
        <g transform="translate(12 12)">
          <path
            d="M12 3c1.5 3.2 4.2 4.6 7 5-2 .8-3.4 2.2-4.2 4.2C13.9 18.4 12 21 12 21s-1.9-2.6-2.8-8.8C8.4 10.2 7 8.8 5 8c2.8-.4 5.5-1.8 7-5z"
            fill="#fff"
          />
        </g>
      </g>
    </svg>
  );
}
