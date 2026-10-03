'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  bot,
  Card,
  PrimaryButton,
  SimpleButton,
} from '@gitroom/frontend/components/zalo/zalo.shared';
import {
  trackFeature,
  trackFeatureError,
} from '@gitroom/frontend/components/usage/usage.tracker';

// Lấy lại ảnh gửi vào nhóm trong lúc bot mất phiên Zalo (lỡ đăng xuất, mất
// kết nối). Bot đọc lại lịch sử nhóm, chia đợt ảnh y như lúc nhận trực tiếp,
// rồi tạo bản nháp qua đúng luồng cũ. Zalo chỉ trả các tin GẦN NHẤT của nhóm,
// nên lấy lại càng sớm càng đủ.

type Session = {
  id: string;
  start: number;
  end: number;
  images: number;
  videos: number;
  senders: string[];
  // Đoạn chữ đầu của bài (caption người gửi) — để nhận ra bài nào là bài nào.
  text?: string;
  thumb: string;
  seenLive: boolean;
  recovered: boolean;
  // Trùng khung thời gian một đợt bot đã xử lý (có thể đã có bản nháp).
  maybeDup?: boolean;
  dupAt?: number | null;
};
type Group = {
  threadId: string;
  label: string;
  error?: string;
  complete?: boolean;
  fetched?: number;
  sessions: Session[];
};

const pad = (n: number) => String(n).padStart(2, '0');
const toInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = (ms: number) =>
  new Date(ms).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export const ZaloRecoverCard: FC<{
  // Mở từ banner "Bot mất phiên …" ở Tổng quan: điền sẵn khoảng mất phiên và
  // tự xem trước luôn.
  initialFrom?: number;
  initialTo?: number;
  autoPreview?: boolean;
  onDone?: () => void;
}> = ({ initialFrom, initialTo, autoPreview, onDone }) => {
  const t = useT();
  const toaster = useToaster();
  const [from, setFrom] = useState(() => toInput(initialFrom ?? Date.now() - 24 * 3600 * 1000));
  const [to, setTo] = useState(() => toInput(initialTo ?? Date.now()));
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'' | 'preview' | 'run'>('');

  const range = useMemo(
    () => ({ from: new Date(from).getTime(), to: new Date(to).getTime() }),
    [from, to]
  );

  const preview = useCallback(async () => {
    setBusy('preview');
    try {
      const r = await bot(
        '/api/zalo/recover/preview',
        { method: 'POST', body: JSON.stringify(range) },
        180000
      );
      if (!r?.ok) throw new Error(r?.error || 'Không đọc được lịch sử nhóm');
      const list: Group[] = r.groups || [];
      trackFeature('zalo.xem-tin-bi-lo', {
        extra: {
          tu_dong: !!autoPreview,
          so_dot: list.reduce((n, g) => n + g.sessions.length, 0),
        },
      });
      setGroups(list);
      // Mặc định chỉ chọn các đợt bot CHẮC CHẮN chưa có: chưa nhận trực
      // tiếp, chưa lấy lại, không trùng khung giờ một đợt đã xử lý.
      setPicked(
        new Set(
          list
            .flatMap((g) => g.sessions)
            .filter((s) => !s.seenLive && !s.recovered && !s.maybeDup)
            .map((s) => s.id)
        )
      );
    } catch (e: any) {
      trackFeatureError('zalo.xem-tin-bi-lo');
      toaster.show(e?.message || 'Không đọc được lịch sử nhóm', 'warning');
    } finally {
      setBusy('');
    }
  }, [range, toaster, autoPreview]);

  const autoRan = useRef(false);
  useEffect(() => {
    if (autoPreview && !autoRan.current) {
      autoRan.current = true;
      preview();
    }
  }, [autoPreview, preview]);

  const run = useCallback(async () => {
    setBusy('run');
    try {
      const r = await bot(
        '/api/zalo/recover/run',
        { method: 'POST', body: JSON.stringify({ ...range, ids: [...picked] }) },
        180000
      );
      if (!r?.ok) throw new Error(r?.error || 'Không tạo được bản nháp');
      trackFeature('zalo.lay-lai-tin', {
        extra: { so_dot: Number(r.started) || 0 },
      });
      toaster.show(
        t(
          'zalo_recover_started',
          'Đang xử lý {{n}} đợt ảnh — bản nháp sẽ hiện ở Lịch sau ít phút.'
        ).replace('{{n}}', String(r.started)),
        'success'
      );
      setGroups(null);
      setPicked(new Set());
      onDone?.();
    } catch (e: any) {
      trackFeatureError('zalo.lay-lai-tin');
      toaster.show(e?.message || 'Không tạo được bản nháp', 'warning');
    } finally {
      setBusy('');
    }
  }, [range, picked, toaster, t, onDone]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = groups ? groups.reduce((n, g) => n + g.sessions.length, 0) : 0;
  const input =
    'h-[36px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[10px] text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary';

  return (
    <Card title={t('zalo_recover_title', 'Lấy lại tin bị lỡ')}>
      <div className="text-[13px] text-textItemBlur leading-[1.55]">
        {t(
          'zalo_recover_hint',
          'Ảnh gửi vào nhóm lúc bot mất phiên Zalo sẽ không tới bot. Chọn khoảng thời gian bị lỡ — bot đọc lại lịch sử nhóm, tách mỗi người gửi / mỗi đợt ảnh thành một bài riêng, bỏ tin chat không liên quan, rồi tạo bản nháp. Zalo chỉ giữ các tin gần nhất, nên làm càng sớm càng đủ.'
        )}
      </div>

      <div className="flex flex-wrap items-end gap-[10px]">
        <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">
          {t('zalo_recover_from', 'Từ')}
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-[4px] text-[12px] text-textItemBlur">
          {t('zalo_recover_to', 'Đến')}
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={input}
          />
        </label>
        <SimpleButton
          className="!h-[36px] text-[13px]"
          onClick={preview}
          disabled={!!busy || !(range.to > range.from)}
        >
          {busy === 'preview'
            ? t('zalo_recover_reading', 'Đang đọc lịch sử…')
            : t('zalo_recover_preview', 'Xem trước')}
        </SimpleButton>
      </div>

      {groups && (
        <div className="flex flex-col gap-[12px]">
          {!total && !groups.some((g) => g.error) && (
            <div className="text-[13px] text-textItemBlur">
              {t('zalo_recover_none', 'Không có ảnh nào trong khoảng thời gian này.')}
            </div>
          )}
          {groups
            .filter((g) => g.error || g.sessions.length || g.complete === false)
            .map((g) => (
              <div key={g.threadId} className="flex flex-col gap-[6px]">
                <div className="text-[13px] font-[600]">{g.label}</div>
                {g.error && (
                  <div className="text-[12.5px] text-red-400">{g.error}</div>
                )}
                {g.complete === false && (
                  <div className="text-[12px] text-amber-500">
                    {t(
                      'zalo_recover_incomplete',
                      'Zalo chỉ trả {{n}} tin gần nhất — ảnh cũ hơn có thể đã trôi mất.'
                    ).replace('{{n}}', String(g.fetched || 0))}
                  </div>
                )}
                {g.sessions.map((s) => {
                  const locked = s.recovered;
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-[10px] rounded-[8px] border border-newTableBorder px-[10px] py-[8px] cursor-pointer hover:bg-boxHover has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(s.id)}
                        disabled={locked}
                        onChange={() => toggle(s.id)}
                        className="w-[16px] h-[16px] accent-btnPrimary"
                      />
                      {s.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.thumb}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-[40px] h-[40px] rounded-[6px] object-cover bg-newBgColorInner shrink-0"
                        />
                      ) : (
                        <div className="w-[40px] h-[40px] rounded-[6px] bg-newBgColorInner shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 text-[13px]">
                        <div className="tabular-nums">
                          {fmt(s.start)}
                          {s.end - s.start > 60000 ? `–${fmtTime(s.end)}` : ''}
                        </div>
                        {!!s.text && (
                          <div className="text-[12.5px] truncate">{s.text}</div>
                        )}
                        <div className="text-[12px] text-textItemBlur truncate">
                          {[
                            s.images ? `${s.images} ảnh` : '',
                            s.videos ? `${s.videos} video` : '',
                            s.senders.join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      {(s.recovered || s.seenLive || s.maybeDup) && (
                        <span className="text-[11.5px] text-textItemBlur shrink-0 text-end">
                          {s.recovered
                            ? t('zalo_recover_done', 'Đã lấy lại')
                            : s.seenLive
                            ? t('zalo_recover_seen', 'Bot đã nhận')
                            : `${t('zalo_recover_maybe_dup', 'Có thể đã có')}${
                                s.dupAt ? ` · ${fmtTime(s.dupAt)}` : ''
                              }`}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            ))}
          {!!total && (
            <div>
              <PrimaryButton
                className="!h-[36px] text-[13px]"
                onClick={run}
                disabled={!!busy || !picked.size}
              >
                {busy === 'run'
                  ? t('zalo_recover_running', 'Đang gửi…')
                  : t('zalo_recover_run', 'Tạo bản nháp ({{n}})').replace(
                      '{{n}}',
                      String(picked.size)
                    )}
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
