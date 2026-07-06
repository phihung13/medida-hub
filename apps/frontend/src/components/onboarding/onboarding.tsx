'use client';

import { FC, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppTour } from '@gitroom/frontend/components/onboarding/app.tour';

// Member mới đăng ký xong được chuyển tới /launches?onboarding=true →
// hiện tour giới thiệu từng mục (thay cho modal Connect Channels + video cũ).
export const Onboarding: FC = () => {
  const query = useSearchParams();
  const router = useRouter();

  const handleClose = useCallback(() => {
    router.push('/launches');
  }, [router]);

  if (!query.get('onboarding')) {
    return null;
  }

  return <AppTour onClose={handleClose} />;
};
