import { MediaBoardComponent } from '@gitroom/frontend/components/media-board/media-board.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Social Hub — Bảng sản xuất Media',
  description: '',
};
export default async function Page() {
  return <MediaBoardComponent />;
}
