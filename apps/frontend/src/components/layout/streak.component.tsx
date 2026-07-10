'use client';

import { FC, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ============================================================================
//  STREAK LỬA kiểu Duolingo — chuỗi ngày VÀO APP (giờ VN, backend /user/streak).
//  - Ping 1 lần mỗi lần mở app: nối chuỗi → lửa bùng (burst); chạm cột mốc
//    (3/7/14/30/50/100/200/300/365/500/1000) → màn ăn mừng toàn màn hình.
//  - Lửa luôn lắc lư nhẹ (flicker) như Duolingo; đứt chuỗi → lửa xám.
// ============================================================================

const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 300, 365, 500, 1000];

// Ngọn lửa Duolingo: thân giọt lệ cong + lõi vàng, gradient cam→đỏ.
const Flame: FC<{ size?: number; dead?: boolean }> = ({ size = 26, dead }) => (
  <svg width={size} height={size} viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="flameBody" x1="12" y1="0" x2="12" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FF9600" />
        <stop offset="0.55" stopColor="#FF6D00" />
        <stop offset="1" stopColor="#FF4B00" />
      </linearGradient>
      <linearGradient id="flameCore" x1="12" y1="12" x2="12" y2="26" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FFE066" />
        <stop offset="1" stopColor="#FFB020" />
      </linearGradient>
    </defs>
    {/* thân lửa — nhọn lệch trái trên đỉnh, phình tròn dưới đáy (dáng Duolingo) */}
    <path
      d="M12.6 0.9C12.9 3.9 11.9 6.1 10.2 7.9C8.9 9.3 7.3 10.5 5.9 11.9C3 14.8 1.6 18 2.6 21.2C3.9 25.5 8 28 12.4 28C17.9 28 22.4 24.1 22.4 18.6C22.4 13.4 19 10.9 17.9 7.8C17.3 6.2 17.2 4.5 17.9 2.4C15.9 2.9 14.5 4 13.6 5.4C13.3 3.9 13 2.3 12.6 0.9Z"
      fill={dead ? '#8a8a8a' : 'url(#flameBody)'}
    />
    {/* lõi vàng */}
    <path
      d="M12.4 26C15.5 26 18 23.7 18 20.7C18 18.2 16.4 16.7 14.9 14.9C14.2 14 13.5 13 13.1 11.9C11.7 13.4 10.9 14.5 10 15.5C8.6 17.1 7.2 18.5 7.2 20.8C7.2 23.7 9.4 26 12.4 26Z"
      fill={dead ? '#b5b5b5' : 'url(#flameCore)'}
    />
  </svg>
);

export const StreakComponent: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const [streak, setStreak] = useState<{
    current: number;
    longest: number;
    nextMilestone: number | null;
  } | null>(null);
  const [burst, setBurst] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);
  const pinged = useRef(false);

  // Ping đúng 1 lần mỗi lần mở app — nối chuỗi + nhận tín hiệu ăn mừng.
  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    (async () => {
      try {
        const res = await fetch('/user/streak/ping', { method: 'POST' });
        if (!res.ok) throw new Error();
        const d = await res.json();
        setStreak({ current: d.current, longest: d.longest, nextMilestone: d.nextMilestone });
        if (d.increased) {
          setBurst(true);
          setTimeout(() => setBurst(false), 1600);
        }
        if (d.milestone) setMilestone(d.milestone);
      } catch {
        // ping lỗi — thử đọc streak hiện có, không chặn UI
        try {
          const r = await fetch('/user/streak');
          if (r.ok) setStreak(await r.json());
        } catch {
          /* thôi — ẩn streak lượt này */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!streak) return null;
  const dead = streak.current <= 0;
  const nextM = streak.nextMilestone;

  return (
    <>
      <div
        className="relative flex items-center gap-[5px] cursor-default select-none"
        data-tooltip-id="tooltip"
        data-tooltip-content={
          dead
            ? t('streak_tip_dead', 'Your streak is out — come back today to relight it!')
            : `${t('streak_tip_days', 'Day streak')}: ${streak.current} 🔥 · ${t('streak_tip_longest', 'Best')}: ${streak.longest}${nextM ? ` · ${t('streak_tip_next', 'Next milestone')}: ${nextM}` : ''}`
        }
      >
        <div className={burst ? 'streak-burst' : 'streak-flicker'}>
          <Flame dead={dead} />
        </div>
        {/* tia lửa bay lên khi nối chuỗi */}
        {burst && (
          <div className="absolute -top-[6px] start-[6px] pointer-events-none">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="streak-spark" style={{ animationDelay: `${i * 0.12}s`, insetInlineStart: `${i * 5 - 6}px` }} />
            ))}
          </div>
        )}
        <span className={`text-[14.5px] font-[800] tabular-nums ${dead ? 'text-textItemBlur' : 'text-[#FF7A00]'}`}>
          {streak.current}
        </span>
      </div>

      {/* MÀN ĂN MỪNG CỘT MỐC — overlay riêng, không phụ thuộc modal hệ thống */}
      {milestone && (
        <div
          className="fixed inset-0 z-[999] grid place-items-center bg-black/70 backdrop-blur-[3px]"
          onClick={() => setMilestone(null)}
        >
          <div className="relative flex flex-col items-center gap-[14px] px-[40px] py-[36px] rounded-[20px] bg-newBgColorInner border border-[#FF7A00]/40 shadow-[0_0_60px_rgba(255,122,0,0.35)] streak-pop">
            {/* pháo lửa */}
            {[...Array(10)].map((_, i) => (
              <span
                key={i}
                className="streak-confetti"
                style={{
                  animationDelay: `${(i % 5) * 0.15}s`,
                  insetInlineStart: `${8 + i * 9}%`,
                  background: ['#FF9600', '#FFC800', '#FF4B00', '#FFE066'][i % 4],
                }}
              />
            ))}
            <div className="streak-burst">
              <Flame size={88} />
            </div>
            <div className="text-[34px] font-[900] text-[#FF7A00] tabular-nums leading-none">
              {milestone} {t('streak_days', 'days')}
            </div>
            <div className="text-[15px] font-[700] text-center">
              🎉 {t('streak_milestone_title', 'Amazing streak! You showed up')} {milestone} {t('streak_milestone_tail', 'days in a row!')}
            </div>
            {nextM && (
              <div className="text-[12.5px] text-textItemBlur">
                {t('streak_next_target', 'Next milestone')}: 🔥 {nextM} {t('streak_days', 'days')}
              </div>
            )}
            <button
              onClick={() => setMilestone(null)}
              className="mt-[6px] px-[22px] py-[9px] rounded-[10px] bg-[#FF7A00] text-white text-[13.5px] font-[800] hover:bg-[#FF8E24]"
            >
              {t('streak_continue', 'Keep it burning!')} 🔥
            </button>
          </div>
        </div>
      )}

      {/* hiệu ứng lửa — gói trong component, không đụng SCSS toàn cục */}
      <style>{`
        .streak-flicker { animation: streakFlicker 2.6s ease-in-out infinite; transform-origin: 50% 88%; }
        @keyframes streakFlicker {
          0%, 100% { transform: scale(1) rotate(0deg); }
          20% { transform: scale(1.05, 0.97) rotate(-2.4deg); }
          40% { transform: scale(0.97, 1.05) rotate(1.8deg); }
          60% { transform: scale(1.04, 0.98) rotate(-1.2deg); }
          80% { transform: scale(0.99, 1.03) rotate(2.2deg); }
        }
        .streak-burst { animation: streakBurst 1.5s cubic-bezier(.2,1.6,.4,1); transform-origin: 50% 88%; filter: drop-shadow(0 0 10px rgba(255,140,0,.75)); }
        @keyframes streakBurst {
          0% { transform: scale(1); }
          35% { transform: scale(1.55) rotate(-4deg); }
          60% { transform: scale(1.2) rotate(3deg); }
          100% { transform: scale(1); }
        }
        .streak-spark { position: absolute; width: 5px; height: 5px; border-radius: 999px; background: #FFB020; opacity: 0; animation: streakSpark 1.1s ease-out forwards; }
        @keyframes streakSpark {
          0% { transform: translateY(2px) scale(1); opacity: 1; }
          100% { transform: translateY(-26px) scale(.3); opacity: 0; }
        }
        .streak-pop { animation: streakPop .45s cubic-bezier(.2,1.6,.4,1); }
        @keyframes streakPop { 0% { transform: scale(.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .streak-confetti { position: absolute; top: -8px; width: 8px; height: 12px; border-radius: 2px; opacity: 0; animation: streakConfetti 1.6s ease-in infinite; }
        @keyframes streakConfetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(300px) rotate(340deg); opacity: 0; }
        }
      `}</style>
    </>
  );
};
