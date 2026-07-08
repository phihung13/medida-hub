import React from 'react';

// Wordmark Social Hub: huy hiệu "hub phát tỏa" + chữ (đồng bộ với Logo).
export const LogoTextComponent = () => {
  return (
    <svg
      width="150"
      height="33"
      viewBox="0 0 150 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="hubTextGrad"
          x1="2"
          y1="5"
          x2="26"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3B9CFF" />
          <stop offset="1" stopColor="#1657AC" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="24" height="24" rx="7" fill="url(#hubTextGrad)" />
      {/* Biểu tượng hub thu nhỏ, tâm huy hiệu tại (14,17) */}
      <g
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      >
        <line x1="14" y1="17" x2="14" y2="10.5" />
        <line x1="14" y1="17" x2="8.5" y2="21.5" />
        <line x1="14" y1="17" x2="19.5" y2="21.5" />
      </g>
      <circle cx="14" cy="10" r="2.1" fill="#fff" />
      <circle cx="8" cy="22" r="2.1" fill="#fff" />
      <circle cx="20" cy="22" r="2.1" fill="#fff" />
      <circle cx="14" cy="17" r="2.9" fill="#fff" />
      <circle cx="14" cy="17" r="1.3" fill="url(#hubTextGrad)" />
      <text
        x="33"
        y="22"
        fontFamily="'Segoe UI', Arial, sans-serif"
        fontSize="15"
        fontWeight="700"
        fill="currentColor"
      >
        Social Hub
      </text>
    </svg>
  );
};
