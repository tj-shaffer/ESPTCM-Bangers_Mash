/**
 * Bangers & Mash mark: a sausage bent into a pass-check, resting on a scoop of
 * mash, in a brand-blue tile. Reads as "test passed" small, bangers & mash big.
 * Fixed brand colours (a logo shouldn't invert in dark mode).
 */

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Bangers & Mash">
      <rect width="48" height="48" rx="12" fill="#4F94BC" />
      <path d="M8 40c0-9 6-13 16-13s16 4 16 13z" fill="#EAD49A" />
      <ellipse cx="17" cy="31.5" rx="4.2" ry="3" fill="#F4E4BE" />
      <ellipse cx="27" cy="30" rx="4.6" ry="3.2" fill="#F4E4BE" />
      <ellipse cx="34" cy="33.5" rx="3.6" ry="2.6" fill="#F4E4BE" />
      <path
        d="M14.5 26.5l6.5 6.5L34 16.5"
        fill="none"
        stroke="#C25A2A"
        strokeWidth={6.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16.3 25.4l4.6 4.6" fill="none" stroke="#EC9760" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
