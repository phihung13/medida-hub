'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR from 'swr';
import clsx from 'clsx';

// ============================================================================
//  GĐ3 — "Agent Excel": upload file lịch đăng → bảng duyệt (sửa tại chỗ,
//  AI chuốt tiêu đề/mô tả) → bulk lên lịch → báo cáo từng dòng.
// ============================================================================

interface BulkRow {
  row: number;
  channel: string;
  integrationId: string | null;
  integrationName: string | null;
  platform: string | null;
  title: string;
  content: string;
  tags: string;
  mediaUrl: string;
  scheduledAt: string | null;
  errors: string[];
}

const useChannels = () => {
  const fetch = useFetch();
  return useSWR(
    '/integrations/list',
    async (u: string) => (await fetch(u)).json(),
    { revalidateOnFocus: false }
  );
};

const platformEmoji = (p: string | null) =>
  p === 'facebook' ? '📘' : p === 'instagram' ? '📸' : p === 'youtube' ? '▶️' : p === 'zalo' ? '💬' : '📄';

const fmtLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('vi-VN')} ${d.toTimeString().slice(0, 5)}`;
};

export const BulkComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState<Record<number, { ok: boolean; error?: string }>>({});
  const { data: channelsData } = useChannels();
  const channels = useMemo(
    () => channelsData?.integrations || [],
    [channelsData]
  );

  const onFile = useCallback(
    async (f: File | null) => {
      if (!f) return;
      setParsing(true);
      setRows([]);
      setResults({});
      setFileName(f.name);
      try {
        const form = new FormData();
        form.append('file', f);
        const res = await (
          await fetch('/bulk/parse', { method: 'POST', body: form })
        ).json();
        setRows(res?.rows || []);
      } finally {
        setParsing(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [fetch]
  );

  const updateRow = useCallback(
    (rowNum: number, patch: Partial<BulkRow>) => {
      setRows((rs) =>
        rs.map((r) => {
          if (r.row !== rowNum) return r;
          const next = { ...r, ...patch };
          // sửa xong thì tính lại lỗi cơ bản phía client
          const errors: string[] = [];
          if (!next.integrationId) errors.push('Chưa chọn kênh');
          if (!next.scheduledAt) errors.push('Thiếu ngày giờ');
          else if (new Date(next.scheduledAt) < new Date())
            errors.push('Giờ đăng trong quá khứ');
          if (!next.title && !next.content) errors.push('Thiếu nội dung');
          next.errors = errors;
          return next;
        })
      );
    },
    []
  );

  const doPolish = useCallback(async () => {
    setPolishing(true);
    try {
      const res = await (
        await fetch('/bulk/polish', {
          method: 'POST',
          body: JSON.stringify({ rows }),
        })
      ).json();
      const suggestions = res?.suggestions || {};
      setRows((rs) =>
        rs.map((r) =>
          suggestions[r.row]
            ? {
                ...r,
                title: suggestions[r.row].title || r.title,
                content: suggestions[r.row].content || r.content,
              }
            : r
        )
      );
    } finally {
      setPolishing(false);
    }
  }, [rows, fetch]);

  const validRows = useMemo(
    () => rows.filter((r) => !r.errors.length && !results[r.row]?.ok),
    [rows, results]
  );

  const doCommit = useCallback(async () => {
    if (!validRows.length) return;
    setCommitting(true);
    try {
      const res = await (
        await fetch('/bulk/commit', {
          method: 'POST',
          body: JSON.stringify({ rows: validRows }),
        })
      ).json();
      const map: Record<number, { ok: boolean; error?: string }> = {
        ...results,
      };
      for (const r of res?.results || []) {
        map[r.row] = { ok: r.ok, error: r.error };
      }
      setResults(map);
    } finally {
      setCommitting(false);
    }
  }, [validRows, results, fetch]);

  const doneCount = Object.values(results).filter((r) => r.ok).length;

  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div className="flex items-center gap-[12px] flex-wrap">
        <div className="flex flex-col">
          <div className="text-[20px] font-[650]">
            {t('bulk_title', 'Nhập lịch đăng từ Excel')}
          </div>
          <div className="text-[12px] text-newTableText/60">
            {t(
              'bulk_subtitle',
              'Cột hỗ trợ: Kênh | Tiêu đề | Nội dung | Tags | Link (Drive/URL) | Ngày giờ (DD/MM/YYYY HH:mm). Hàng lỗi sửa được tại chỗ.'
            )}
          </div>
        </div>
        <div className="ms-auto flex items-center gap-[8px]">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="bg-[#1e6fd9] hover:bg-[#1a5fc0] disabled:opacity-50 text-white text-[13px] font-[600] px-[14px] py-[8px] rounded-[8px] transition-all"
          >
            {parsing
              ? t('bulk_parsing', 'Đang đọc file…')
              : t('bulk_choose', '📄 Chọn file Excel/CSV')}
          </button>
        </div>
      </div>

      {!!rows.length && (
        <>
          <div className="flex items-center gap-[10px] flex-wrap text-[13px]">
            <span className="text-newTableText/70">
              {fileName} — {rows.length} {t('bulk_rows', 'dòng')},{' '}
              <b className="text-[#32d583]">{validRows.length}</b>{' '}
              {t('bulk_valid', 'hợp lệ')},{' '}
              <b className="text-[#f97066]">
                {rows.filter((r) => r.errors.length).length}
              </b>{' '}
              {t('bulk_invalid', 'lỗi')}
              {doneCount > 0 && (
                <>
                  , <b className="text-[#32d583]">{doneCount}</b>{' '}
                  {t('bulk_done', 'đã lên lịch')}
                </>
              )}
            </span>
            <div className="ms-auto flex gap-[8px]">
              <button
                onClick={doPolish}
                disabled={polishing || !rows.length}
                title={t(
                  'bulk_polish_tip',
                  'AI (Claude) viết lại tiêu đề + mô tả chuẩn SEO cho mọi dòng'
                )}
                className="border border-[#7f56d9] text-[#a78bfa] hover:bg-[#7f56d9]/10 disabled:opacity-50 text-[13px] font-[600] px-[14px] py-[7px] rounded-[8px] transition-all"
              >
                {polishing
                  ? t('bulk_polishing', 'AI đang viết…')
                  : t('bulk_polish', '✨ AI chuốt nội dung')}
              </button>
              <button
                onClick={doCommit}
                disabled={committing || !validRows.length}
                className="bg-[#32d583] hover:bg-[#2bb873] disabled:opacity-50 text-black text-[13px] font-[700] px-[14px] py-[7px] rounded-[8px] transition-all"
              >
                {committing
                  ? t('bulk_committing', 'Đang lên lịch…')
                  : `${t('bulk_commit', '🗓 Lên lịch')} ${validRows.length} ${t(
                      'bulk_posts',
                      'bài'
                    )}`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-newTableBorder rounded-[12px]">
            <table className="w-full text-[12.5px] min-w-[900px]">
              <thead>
                <tr className="bg-newTableHeader text-newTableText/70 text-start">
                  <th className="p-[8px] text-start w-[36px]">#</th>
                  <th className="p-[8px] text-start w-[160px]">
                    {t('bulk_col_channel', 'Kênh')}
                  </th>
                  <th className="p-[8px] text-start w-[200px]">
                    {t('bulk_col_title', 'Tiêu đề')}
                  </th>
                  <th className="p-[8px] text-start">
                    {t('bulk_col_content', 'Nội dung')}
                  </th>
                  <th className="p-[8px] text-start w-[130px]">
                    {t('bulk_col_media', 'Media')}
                  </th>
                  <th className="p-[8px] text-start w-[150px]">
                    {t('bulk_col_time', 'Giờ đăng')}
                  </th>
                  <th className="p-[8px] text-start w-[180px]">
                    {t('bulk_col_status', 'Trạng thái')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const result = results[r.row];
                  return (
                    <tr
                      key={r.row}
                      className={clsx(
                        'border-t border-newTableBorder align-top',
                        result?.ok && 'opacity-50'
                      )}
                    >
                      <td className="p-[8px] text-newTableText/50">{r.row}</td>
                      <td className="p-[8px]">
                        <select
                          value={r.integrationId || ''}
                          disabled={!!result?.ok}
                          onChange={(e) => {
                            const ch = channels.find(
                              (c: any) => c.id === e.target.value
                            );
                            updateRow(r.row, {
                              integrationId: ch?.id || null,
                              integrationName: ch?.name || null,
                              platform: ch?.identifier || null,
                            });
                          }}
                          className="bg-newBgColorInner border border-newTableBorder rounded-[6px] px-[6px] py-[4px] w-full text-[12px] outline-none"
                        >
                          <option value="">
                            {t('bulk_pick_channel', '— chọn kênh —')}
                          </option>
                          {channels.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {platformEmoji(c.identifier)} {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-[8px]">
                        <textarea
                          value={r.title}
                          disabled={!!result?.ok}
                          onChange={(e) =>
                            updateRow(r.row, { title: e.target.value })
                          }
                          rows={2}
                          className="bg-newBgColorInner border border-newTableBorder rounded-[6px] px-[6px] py-[4px] w-full text-[12px] outline-none resize-y"
                        />
                      </td>
                      <td className="p-[8px]">
                        <textarea
                          value={r.content}
                          disabled={!!result?.ok}
                          onChange={(e) =>
                            updateRow(r.row, { content: e.target.value })
                          }
                          rows={2}
                          className="bg-newBgColorInner border border-newTableBorder rounded-[6px] px-[6px] py-[4px] w-full text-[12px] outline-none resize-y"
                        />
                      </td>
                      <td className="p-[8px]">
                        {r.mediaUrl ? (
                          <a
                            href={r.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1e6fd9] hover:underline break-all text-[11.5px]"
                          >
                            {r.mediaUrl.includes('drive.google.com')
                              ? '📁 Drive'
                              : '🔗 Link'}
                          </a>
                        ) : (
                          <span className="text-newTableText/40 text-[11.5px]">
                            {t('bulk_no_media', '(không)')}
                          </span>
                        )}
                      </td>
                      <td className="p-[8px]">
                        <input
                          type="datetime-local"
                          disabled={!!result?.ok}
                          value={
                            r.scheduledAt
                              ? new Date(
                                  new Date(r.scheduledAt).getTime() -
                                    new Date().getTimezoneOffset() * 60000
                                )
                                  .toISOString()
                                  .slice(0, 16)
                              : ''
                          }
                          onChange={(e) =>
                            updateRow(r.row, {
                              scheduledAt: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            })
                          }
                          className="bg-newBgColorInner border border-newTableBorder rounded-[6px] px-[6px] py-[4px] w-full text-[12px] outline-none"
                        />
                      </td>
                      <td className="p-[8px]">
                        {result?.ok ? (
                          <span className="text-[#32d583] font-[600]">
                            ✓ {t('bulk_scheduled', 'Đã lên lịch')}{' '}
                            {fmtLocal(r.scheduledAt)}
                          </span>
                        ) : result && !result.ok ? (
                          <span className="text-[#f97066] text-[11.5px]">
                            ✗ {result.error}
                          </span>
                        ) : r.errors.length ? (
                          <div className="flex flex-col gap-[2px]">
                            {r.errors.map((e, i) => (
                              <span
                                key={i}
                                className="text-[#f97066] text-[11.5px]"
                              >
                                • {e}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#32d583]/80 text-[11.5px]">
                            {t('bulk_ready', 'Sẵn sàng')} —{' '}
                            {fmtLocal(r.scheduledAt)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {doneCount > 0 && (
            <div className="flex items-center gap-[10px] text-[13px] bg-newTableHeader border border-newTableBorder rounded-[10px] p-[12px]">
              <span>
                ✅{' '}
                {t(
                  'bulk_done_note',
                  `${doneCount} bài đã vào lịch — xem và chỉnh trên Calendar.`
                )}
              </span>
              <button
                onClick={() => router.push('/launches')}
                className="ms-auto text-[#1e6fd9] hover:underline font-[600]"
              >
                {t('bulk_open_calendar', 'Mở Calendar →')}
              </button>
            </div>
          )}
        </>
      )}

      {!rows.length && !parsing && (
        <div className="text-[13px] text-newTableText/60 bg-newTableHeader border border-dashed border-newTableBorder rounded-[12px] p-[28px] text-center">
          {t(
            'bulk_empty',
            'Chưa có file nào. Chọn file .xlsx hoặc .csv chứa lịch đăng — dòng đầu là tên cột.'
          )}
        </div>
      )}
    </div>
  );
};
