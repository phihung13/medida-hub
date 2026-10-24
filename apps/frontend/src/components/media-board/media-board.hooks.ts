'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { MediaCard, MediaConfig } from '@gitroom/frontend/components/media-board/logic';

// Thay SSE của bản gốc: SWR tự tải lại mỗi 10 giây + mutate() ngay sau mỗi lần ghi.
const REFRESH_MS = 10000;

export const useMediaBoardConfig = () => {
  const fetch = useFetch();
  return useSWR<Partial<MediaConfig>>(
    '/media-board/config',
    async (u: string) => (await fetch(u)).json(),
    { refreshInterval: REFRESH_MS }
  );
};

export const useMediaBoardVideos = () => {
  const fetch = useFetch();
  return useSWR<MediaCard[]>(
    '/media-board/videos',
    async (u: string) => {
      const r = await (await fetch(u)).json();
      return Array.isArray(r) ? r : [];
    },
    { refreshInterval: REFRESH_MS }
  );
};

const send = async (
  fetch: ReturnType<typeof useFetch>,
  url: string,
  method: string,
  body?: any
) => {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`media-board ${res.status}`);
  return res.json().catch(() => null);
};

export const useMediaBoardApi = () => {
  const fetch = useFetch();
  const createVideo = useCallback(
    (data: Partial<MediaCard>) => send(fetch, '/media-board/videos', 'POST', data),
    [fetch]
  );
  const setVideo = useCallback(
    (id: string, data: Partial<MediaCard>) =>
      send(fetch, `/media-board/videos/${encodeURIComponent(id)}`, 'PUT', data),
    [fetch]
  );
  const patchVideo = useCallback(
    (id: string, patch: Partial<MediaCard>) =>
      send(fetch, `/media-board/videos/${encodeURIComponent(id)}`, 'PATCH', patch),
    [fetch]
  );
  const deleteVideo = useCallback(
    (id: string) => send(fetch, `/media-board/videos/${encodeURIComponent(id)}`, 'DELETE'),
    [fetch]
  );
  const saveConfig = useCallback(
    (data: Partial<MediaConfig>) => send(fetch, '/media-board/config', 'PUT', data),
    [fetch]
  );
  return { createVideo, setVideo, patchVideo, deleteVideo, saveConfig };
};
