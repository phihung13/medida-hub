'use client';

import { FC, Fragment } from 'react';
import {
  Alert,
  Board,
  STATUSES,
  cadText,
  fmt,
  splitList,
} from '@gitroom/frontend/components/media-board/logic';
import { AlertList, btnCls } from '@gitroom/frontend/components/media-board/ui';

export const StreamsView: FC<{
  board: Board;
  loaded: boolean;
  onShowList: (stream: string) => void;
}> = ({ board, loaded, onShowList }) => {
  const hs = board.streamHealth();
  const loose = [...new Set(board.cards.map((c) => c.stream).filter((n): n is string => !!n && !board.streamOf(n)))];
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[12px] pt-[8px] pb-[32px]">
      {hs.map((s) => {
        const total = s.mine.length || 1;
        const backlog: Alert[] = s.counts['da-quay'] ? [['amber', `${s.counts['da-quay']} video đã quay đang chờ dựng`]] : [];
        const warn = s.issues.concat(backlog);
        const kv: [string, string][] = [
          ['Mã luồng', s.code || '—'],
          ['Nhóm kênh', s.group || '—'],
          ['Chủ luồng', s.owner || '—'],
          ['Người duyệt', s.reviewer || '—'],
          ['Mục tiêu', s.goal || '—'],
          ['Kênh phát hành chính', s.channel || '—'],
          ['Kênh phụ cắt ra', splitList(s.subChannels).join(', ') || '—'],
          ['Nhịp cam kết', cadText(s)],
          ['Chuyên mục', (s.subseries || []).join(', ') || '—'],
          ['Phát gần nhất', fmt(s.lastPub)],
          [
            'Phát kế tiếp',
            s.upcoming[0] ? fmt(s.upcoming[0].publishDate) + ' · ' + (s.upcoming[0].episode || s.upcoming[0].title) : '—',
          ],
          ['Tổng tập', String(s.mine.length)],
        ];
        return (
          <article
            key={s.name}
            className="bg-newBgColorInner border border-newBgLineColor rounded-[10px] p-[14px] flex flex-col gap-[8px] min-w-0"
          >
            <h3 className="m-0 text-[15px] font-[700]">{s.name}</h3>
            <div className="grid grid-cols-[120px_1fr] gap-x-[10px] gap-y-[4px] text-[12.5px]">
              {kv.map(([k, v]) => (
                <Fragment key={k}>
                  <span className="text-textItemBlur">{k}</span>
                  <span className="min-w-0 break-words">{v}</span>
                </Fragment>
              ))}
            </div>
            <div className="flex h-[8px] rounded-[4px] overflow-hidden bg-newBgColor" aria-hidden="true">
              {STATUSES.map((x) =>
                s.counts[x.id] ? (
                  <i
                    key={x.id}
                    className="block h-full"
                    style={{ width: `${(s.counts[x.id] / total) * 100}%`, background: x.color }}
                    title={`${x.name}: ${s.counts[x.id]}`}
                  />
                ) : null
              )}
            </div>
            <AlertList alerts={warn} />
            <div>
              <button type="button" className={btnCls()} onClick={() => onShowList(s.name)}>
                Xem danh sách tập
              </button>
            </div>
          </article>
        );
      })}
      {loose.length > 0 && (
        <article className="bg-newBgColorInner border border-newBgLineColor rounded-[10px] p-[14px] flex flex-col gap-[8px] min-w-0">
          <h3 className="m-0 text-[15px] font-[700]">Luồng chưa khai báo</h3>
          <div className="text-[12.5px] text-textItemBlur">
            Có thẻ gắn luồng chưa có trong Cài đặt luồng: {loose.join(', ')}.
          </div>
        </article>
      )}
      {!board.config.streams.length && (
        <div className="text-[12px] text-textItemBlur py-[12px] text-center">
          {loaded ? 'Chưa khai báo luồng nội dung nào. Bấm “Cài đặt luồng”.' : 'Đang tải…'}
        </div>
      )}
    </div>
  );
};
