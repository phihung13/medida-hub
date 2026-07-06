import { ViralComponent } from '@gitroom/frontend/components/viral/viral.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Social Hub — Lò Bài Thắng',
  description: '',
};
export default async function Page() {
  return <ViralComponent />;
}
