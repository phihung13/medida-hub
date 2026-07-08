'use client';

// Logo Social Hub — biểu tượng "hub phát tỏa": 1 node trung tâm nối ra nhiều
// kênh (ẩn dụ: soạn một chỗ, đăng ra nhiều nền tảng). Thay huy hiệu "VA" cũ.
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
          id="hubGrad"
          x1="4"
          y1="4"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3B9CFF" />
          <stop offset="1" stopColor="#1657AC" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="52" height="52" rx="16" fill="url(#hubGrad)" />
      {/* Tia nối từ tâm ra 3 node */}
      <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.9">
        <line x1="30" y1="30" x2="30" y2="17" />
        <line x1="30" y1="30" x2="18.5" y2="40" />
        <line x1="30" y1="30" x2="41.5" y2="40" />
      </g>
      {/* 3 node kênh */}
      <circle cx="30" cy="16" r="4.4" fill="#fff" />
      <circle cx="18" cy="41" r="4.4" fill="#fff" />
      <circle cx="42" cy="41" r="4.4" fill="#fff" />
      {/* Node trung tâm — nhấn bằng viền */}
      <circle cx="30" cy="30" r="6.2" fill="#fff" />
      <circle cx="30" cy="30" r="2.9" fill="url(#hubGrad)" />
    </svg>
  );
};
