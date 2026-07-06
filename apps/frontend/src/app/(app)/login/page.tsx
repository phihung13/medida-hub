export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { Login } from '@gitroom/frontend/components/auth/login';
import { Register } from '@gitroom/frontend/components/auth/register';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Social Hub — Đăng nhập',
  description: '',
};

// Social Hub KHÔNG có đăng ký công khai — tài khoản do quản trị cấp.
// - Có cookie mời `org` (mở từ link mời của admin) → hiện form ĐẶT MẬT KHẨU.
// - Không có → màn đăng nhập.
export default async function Auth() {
  const invite = (await cookies()).get('org')?.value;
  if (invite) {
    return <Register />;
  }
  return <Login />;
}
