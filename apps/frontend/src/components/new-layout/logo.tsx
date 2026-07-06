'use client';

// Logo Social Hub — huy hiệu "VA" (thay logo Social Hub gốc).
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 60 60"
      fill="none"
      className="mx-auto min-w-[60px] min-h-[60px]"
    >
      <defs>
        <linearGradient
          id="vaLogoGrad"
          x1="4"
          y1="4"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2E86FF" />
          <stop offset="1" stopColor="#1657AC" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="52" height="52" rx="15" fill="url(#vaLogoGrad)" />
      <text
        x="30"
        y="39"
        textAnchor="middle"
        fontFamily="'Segoe UI', Arial, sans-serif"
        fontSize="24"
        fontWeight="800"
        letterSpacing="0.5"
        fill="white"
      >
        VA
      </text>
    </svg>
  );
};
