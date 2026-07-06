import { Metadata } from 'next';
import { ZaloComponent } from '@gitroom/frontend/components/zalo/zalo.component';

export const metadata: Metadata = {
  title: 'Social Hub · Zalo',
};

// Trang Zalo native trong Postiz — cấu hình cầu nối bot Zalo ↔ Media Hub
// (giao diện đồng bộ, gọi API bot trực tiếp, không iframe).
export default function ZaloPage() {
  return <ZaloComponent />;
}
