export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { BrandShowcase } from '@gitroom/frontend/components/auth/brand.showcase';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));

// Màn đăng nhập/đăng ký — trái: form; phải: brand showcase kiểu Studio Freight
// (typography lớn tiếng Việt + marquee + mock UI bay) — xem brand.showcase.tsx.
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-dvh lg:h-dvh lg:overflow-hidden w-full text-white">
      <ReturnUrlComponent />
      <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919] lg:overflow-y-auto">
        <div className="w-full max-w-[440px] mx-auto justify-center gap-[8px] h-full flex flex-col text-white">
          <LogoTextComponent />
          <div className="text-[12px] tracking-[0.08em] text-white/40">
            MỘT SẢN PHẨM CỦA TRƯỜNG VIỆT ANH
          </div>
          <div className="flex mt-[12px]">{children}</div>
        </div>
      </div>
      <BrandShowcase />
    </div>
  );
}
