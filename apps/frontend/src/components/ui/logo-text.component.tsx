import React from 'react';

// Wordmark Social Hub: huy hiệu "VA" + chữ (thay wordmark "Social Hub").
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
          id="vaTextGrad"
          x1="2"
          y1="5"
          x2="26"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2E86FF" />
          <stop offset="1" stopColor="#1657AC" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="24" height="24" rx="7" fill="url(#vaTextGrad)" />
      <text
        x="14"
        y="22"
        textAnchor="middle"
        fontFamily="'Segoe UI', Arial, sans-serif"
        fontSize="12"
        fontWeight="800"
        fill="white"
      >
        VA
      </text>
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
