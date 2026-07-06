'use client';

import { FC, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { usePostActions } from '@gitroom/frontend/components/launches/calendar';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';

// ============================================================================
//  Mở THẲNG trình soạn bài khi URL có ?openpost=<postId> — dùng cho nút
//  "Soạn & đăng ở Calendar" ở trang Zalo (bot đẩy draft sang Hub rồi điều
//  hướng về đây). Chờ integrations nạp xong rồi mở modal y hệt bấm một bài
//  trên calendar. Đọc window.location thay vì useSearchParams để khỏi phải
//  bọc Suspense khi build.
// ============================================================================

export const OpenPostFromQuery: FC = () => {
  const fetch = useFetch();
  const router = useRouter();
  const { integrations } = useCalendar();
  const { editPost } = usePostActions();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current || !integrations.length) return;
    const id = new URLSearchParams(window.location.search).get('openpost');
    if (!id) {
      opened.current = true;
      return;
    }
    opened.current = true;
    (async () => {
      try {
        const post = await (await fetch(`/posts/${id}`)).json();
        // Xoá query khỏi URL để refresh/back không mở lại modal.
        router.replace('/launches');
        if (post?.group) await editPost(post)();
      } catch {
        /* bài không còn (đã xoá trong Hub) — để nguyên calendar */
      }
    })();
  }, [integrations, editPost, fetch, router]);

  return null;
};
