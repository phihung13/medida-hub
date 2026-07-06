'use client';

import { FC, useEffect, useState } from 'react';
import { Anton } from 'next/font/google';

// ============================================================================
//  Brand showcase — panel intro màn đăng nhập (register: brand).
//  Hướng: Studio Freight — typography khổng lồ tiếng Việt, marquee chạy vô tận,
//  mock UI bay lơ lửng, huy hiệu xoay, glow xanh Việt Anh "thở" trên nền tối.
//  Toàn bộ chuyển động là CSS thuần (không lib) + tôn trọng reduced-motion.
// ============================================================================

// Display type: Anton — condensed poster grotesque, CÓ subset vietnamese
// (dấu tiếng Việt đầy đủ). Chữ phụ vẫn dùng Plus Jakarta Sans của app.
const anton = Anton({
  weight: '400',
  subsets: ['vietnamese', 'latin'],
  display: 'swap',
});

// Đồng hồ TP.HCM chạy thật — render sau mount để không lệch SSR/client.
const LiveClock: FC = () => {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh',
        })
      );
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      TP.HCM {now ?? '--:--:--'}
    </span>
  );
};

const MARQUEE_ITEMS = [
  'NHÓM ZALO',
  'AI VIẾT CAPTION',
  'CHỜ DUYỆT',
  'LÊN LỊCH',
  'FACEBOOK',
  'MỘT ĐỘI NGŨ',
  'MỌI NỀN TẢNG',
];

const MarqueeRow: FC = () => (
  <>
    {MARQUEE_ITEMS.map((m) => (
      <span key={m} className="flex items-center gap-[28px] shrink-0">
        <span>{m}</span>
        <span className="text-[#3f8dff]">✦</span>
      </span>
    ))}
  </>
);

export const BrandShowcase: FC = () => {
  return (
    <div className="flex-1 hidden lg:flex flex-col rounded-[12px] bg-[#0B0B0C] relative overflow-hidden select-none">
      <style>{`
        @keyframes va-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes va-drift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(9%, 14%) scale(1.18); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes va-drift2 {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-12%, -8%) scale(1.12); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes va-float-a {
          0%   { transform: rotate(-6deg) translateY(0); }
          50%  { transform: rotate(-4.5deg) translateY(-14px); }
          100% { transform: rotate(-6deg) translateY(0); }
        }
        @keyframes va-float-b {
          0%   { transform: rotate(4deg) translateY(0); }
          50%  { transform: rotate(5.5deg) translateY(-20px); }
          100% { transform: rotate(4deg) translateY(0); }
        }
        @keyframes va-float-c {
          0%   { transform: rotate(-2deg) translateY(0); }
          50%  { transform: rotate(-3deg) translateY(-10px); }
          100% { transform: rotate(-2deg) translateY(0); }
        }
        @keyframes va-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes va-grid {
          from { background-position: 0 0; }
          to   { background-position: 72px 72px; }
        }
        @keyframes va-scan {
          0%, 12%  { width: 0; opacity: 0.9; }
          46%, 55% { width: 100%; opacity: 0.9; }
          100%     { width: 100%; opacity: 0; }
        }
        .va-marquee-track { animation: va-marquee 26s linear infinite; }
        .va-orb-1 { animation: va-drift 16s ease-in-out infinite; }
        .va-orb-2 { animation: va-drift2 22s ease-in-out infinite; }
        .va-card-a { animation: va-float-a 9s ease-in-out infinite; }
        .va-card-b { animation: va-float-b 11s ease-in-out infinite; }
        .va-card-c { animation: va-float-c 8s ease-in-out infinite; }
        .va-badge-spin { animation: va-spin 24s linear infinite; transform-origin: 50% 50%; }
        .va-scanline { animation: va-scan 7s ease-in-out infinite; }
        .va-grid { animation: va-grid 5s linear infinite; }
        .va-outline {
          color: transparent;
          -webkit-text-stroke: 2px rgba(255, 255, 255, 0.92);
        }
        @media (prefers-reduced-motion: reduce) {
          .va-marquee-track, .va-orb-1, .va-orb-2,
          .va-card-a, .va-card-b, .va-card-c,
          .va-badge-spin, .va-scanline, .va-grid { animation: none !important; }
        }
      `}</style>

      {/* ===== Nền: lưới + 2 quầng sáng xanh trôi chậm ===== */}
      <div
        className="va-grid absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />
      <div
        className="va-orb-1 absolute -top-[220px] -end-[180px] w-[640px] h-[640px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(30,111,217,0.42) 0%, rgba(30,111,217,0.10) 45%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="va-orb-2 absolute -bottom-[260px] -start-[200px] w-[560px] h-[560px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(0,104,255,0.28) 0%, rgba(0,104,255,0.07) 45%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />

      {/* ===== Hàng utility trên cùng ===== */}
      <div className="relative flex items-center justify-between px-[36px] pt-[26px] text-[12px] font-[600] tracking-[0.14em] text-white/55">
        <span>SOCIAL HUB — MAJOR EDUCATION</span>
        <LiveClock />
      </div>

      {/* ===== Cụm mock UI bay lơ lửng — chỉ hiện khi panel đủ rộng, tránh đè chữ ===== */}
      <div className="absolute top-[92px] end-[44px] w-[280px] hidden wide:block pointer-events-none">
        <div className="va-card-b absolute top-0 end-0 w-[240px] rounded-[14px] bg-[#151517] border border-white/10 shadow-2xl overflow-hidden">
          <div className="h-[26px] bg-[#1e6fd9] flex items-center px-[10px] text-[10px] font-[700] text-white tracking-[0.08em]">
            ĐÃ LÊN LỊCH · 06:40
          </div>
          <div className="p-[12px] flex flex-col gap-[8px]">
            <div className="flex gap-[6px]">
              <div className="w-[52px] h-[52px] rounded-[8px] bg-white/10" />
              <div className="w-[52px] h-[52px] rounded-[8px] bg-white/[0.07]" />
              <div className="w-[52px] h-[52px] rounded-[8px] bg-white/10" />
            </div>
            <div className="h-[8px] w-[85%] rounded-full bg-white/15" />
            <div className="h-[8px] w-[60%] rounded-full bg-white/10" />
          </div>
        </div>
        <div className="va-card-a absolute top-[118px] end-[128px] w-[212px] rounded-[14px] bg-[#151517] border border-white/10 shadow-2xl overflow-hidden">
          <div className="h-[26px] bg-amber-400 flex items-center px-[10px] text-[10px] font-[700] text-black tracking-[0.08em]">
            ⏳ CHỜ DUYỆT · ZALO
          </div>
          <div className="p-[12px] flex flex-col gap-[8px]">
            <div className="h-[8px] w-[90%] rounded-full bg-white/15" />
            <div className="h-[8px] w-[72%] rounded-full bg-white/10" />
            <div className="h-[8px] w-[40%] rounded-full bg-white/10" />
          </div>
        </div>
        <div className="va-card-c absolute top-[236px] end-[10px] w-[196px] rounded-[14px] bg-[#151517] border border-white/10 shadow-2xl overflow-hidden">
          <div className="h-[26px] bg-[#d82d7e] flex items-center px-[10px] text-[10px] font-[700] text-white tracking-[0.08em]">
            🪄 AI VIẾT CAPTION
          </div>
          <div className="p-[12px] flex flex-col gap-[8px]">
            <div className="relative h-[8px] w-[88%] rounded-full bg-white/10 overflow-hidden">
              <div className="va-scanline absolute inset-y-0 start-0 rounded-full bg-[#3f8dff]/80" />
            </div>
            <div className="h-[8px] w-[65%] rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      {/* ===== Display type ===== */}
      <div className="relative flex-1 flex flex-col justify-center px-[36px] max-w-[760px]">
        <div
          className={anton.className}
          style={{ lineHeight: 0.98, letterSpacing: '0.005em' }}
        >
          <div className="va-outline text-[clamp(2.8rem,4.8vw,4.9rem)] uppercase">
            Một đội ngũ
          </div>
          <div className="text-white text-[clamp(2.8rem,4.8vw,4.9rem)] uppercase">
            Mọi nền tảng
          </div>
          <div className="text-[#3f8dff] text-[clamp(2.8rem,4.8vw,4.9rem)] uppercase">
            Kể chuyện Việt Anh
          </div>
        </div>
        <div className="mt-[26px] max-w-[46ch] text-[15px] leading-[1.75] text-white/72">
          All-in-one social command center — vận hành bởi team marketing
          Major Education.
        </div>
        <div className="mt-[30px] flex items-center gap-[14px] text-[12.5px] font-[600] tracking-[0.1em] text-white/45">
          <span className="w-[34px] h-[2px] bg-[#3f8dff] inline-block" />
          <span>MỘT SẢN PHẨM CỦA TRƯỜNG VIỆT ANH</span>
        </div>
      </div>

      {/* ===== Huy hiệu xoay ===== */}
      <div className="absolute bottom-[86px] end-[40px] w-[128px] h-[128px] hidden xl:flex items-center justify-center pointer-events-none">
        <svg viewBox="0 0 128 128" className="va-badge-spin absolute inset-0 w-full h-full">
          <defs>
            <path
              id="va-circle"
              d="M 64,64 m -46,0 a 46,46 0 1,1 92,0 a 46,46 0 1,1 -92,0"
            />
          </defs>
          <text
            fill="rgba(255,255,255,0.55)"
            style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.22em' }}
          >
            <textPath href="#va-circle">
              SOCIAL HUB ✦ MAJOR EDUCATION ✦ HCMC ✦
            </textPath>
          </text>
        </svg>
        <div
          className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center text-white text-[20px] font-[800]"
          style={{ background: 'linear-gradient(135deg, #1e6fd9 0%, #0d3f85 100%)' }}
        >
          VA
        </div>
      </div>

      {/* ===== Marquee vô tận dưới đáy ===== */}
      <div className="relative border-t border-white/10 py-[18px] overflow-hidden">
        <div
          className={
            anton.className +
            ' va-marquee-track flex w-max gap-[28px] text-[22px] uppercase text-white/60 whitespace-nowrap'
          }
        >
          <MarqueeRow />
          <MarqueeRow />
        </div>
      </div>
    </div>
  );
};

export default BrandShowcase;
