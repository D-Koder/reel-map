import React from 'react';

// The tour's little guide.
export default function Lantern({ size = 38 }) {
  return (
    <svg className="tour-lantern" viewBox="0 0 40 48" width={size} height={Math.round(size * 1.2)} aria-hidden="true" focusable="false">
      <path d="M14 9c0-4 2-6 6-6s6 2 6 6" fill="none" stroke="#1a1a18" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="11" y="8" width="18" height="5" rx="2" fill="#1a1a18" />
      <path d="M10 14h20l3 20c.5 4-2.5 8-6 8H13c-3.5 0-6.5-4-6-8z" fill="#ffd23f" stroke="#1a1a18" strokeWidth="2.5" />
      <circle cx="16" cy="27" r="2" fill="#1a1a18" />
      <circle cx="24" cy="27" r="2" fill="#1a1a18" />
      <path d="M16 32q4 3 8 0" stroke="#1a1a18" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="12" y="42" width="16" height="4" rx="2" fill="#1a1a18" />
    </svg>
  );
}
