'use client';

import { FC, Fragment } from 'react';
import clsx from 'clsx';
import {
  Board,
  MediaCard,
  SLOT_NAME,
  addDays,
  fmt,
  parse,
  today,
} from '@gitroom/frontend/components/media-board/logic';

const Open: FC<{ id: string; onOpen: (id: string) => void; children: string }> = ({ id, onOpen, children }) => (
  <span onClick={() => onOpen(id)} className="cursor-pointer underline decoration-dotted">
    {children}
  </span>
);

const joinOpen = (items: MediaCard[], onOpen: (id: string) => void, label: (c: MediaCard) => string) =>
  items.map((c, i) => (
    <Fragment key={c.id}>
      {i > 0 && ', '}
      <Open id={c.id} onOpen={onOpen}>
        {label(c)}
      </Open>
    </Fragment>
  ));

// Lịch dựng 14 ngày: mỗi ô = 1 ngày × 1 người dựng (hoặc cả team), chia buổi
// sáng/chiều theo buổi HOÀN THÀNH dựng của video dài.
export const CalendarView: FC<{
  board: Board;
  list: MediaCard[];
  onOpen: (id: string) => void;
  onNew: (preset: Partial<MediaCard>) => void;
}> = ({ board, list, onOpen, onNew }) => {
  const { config } = board;
  const t = today(),
    days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
  const team = config.limitScope === 'team';
  const editors = team
    ? ['Cả team']
    : (() => {
        const s = new Set(list.filter((c) => c.editEnd).map((c) => c.assignee || '(chưa gán)'));
        (config.people || []).forEach((p) => s.add(p));
        return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
      })();
  const max = config.maxLongPerSlot || 2;
  const backlog = list.filter((c) => c.status === 'da-quay' && !c.editEnd);
  const td = 'border-b border-e border-newBgLineColor p-[8px] align-top text-start';

  return (
    <div className="overflow-x-auto pt-[8px] pb-[32px]">
      {backlog.length > 0 && (
        <div className="bg-[#E8A33D]/15 text-[#D08A22] px-[12px] py-[10px] rounded-[8px] text-[13px] mt-[12px] mb-[16px]">
          Có {backlog.length} video đã quay nhưng chưa xếp lịch dựng:{' '}
          {joinOpen(backlog, onOpen, (c) => c.episode || c.title || '')}. Mở thẻ để xếp, hoặc bấm ô trống bên dưới.
        </div>
      )}
      <table className="border-separate border-spacing-0 min-w-[640px] w-full bg-newBgColorInner border border-newBgLineColor rounded-[10px] overflow-hidden">
        <thead>
          <tr>
            <th className={`${td} bg-newBgColor text-[12px] font-[700]`}>Ngày</th>
            {editors.map((p) => (
              <th key={p} className={`${td} bg-newBgColor text-[12px] font-[700]`}>
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const wd = parse(d).getDay();
            return (
              <tr key={d}>
                <td
                  className={clsx(
                    td,
                    'whitespace-nowrap font-mono text-[12px] w-[96px]',
                    (wd === 0 || wd === 6) && 'text-textItemBlur',
                    d === t && 'text-btnPrimary font-[600]'
                  )}
                >
                  {fmt(d)}
                  {d === t && (
                    <>
                      <br />
                      hôm nay
                    </>
                  )}
                </td>
                {editors.map((p) => {
                  const mine = list.filter((c) => c.editEnd === d && (team || (c.assignee || '(chưa gán)') === p));
                  const longs = mine.filter((c) => c.format === 'dai'),
                    shorts = mine.filter((c) => c.format !== 'dai');
                  const slot = (k: 'sang' | 'chieu') => {
                    const xs = longs.filter((c) => c.editSlot === k);
                    return (
                      <div className="flex gap-[6px] items-start mb-[6px]">
                        <span className="font-mono text-[10.5px] text-textItemBlur w-[42px] flex-none pt-[2px]">
                          {SLOT_NAME[k]}
                          <br />
                          <span
                            className={clsx(
                              xs.length > max ? 'text-[#FF5A52]' : xs.length === max ? 'text-[#D08A22]' : 'text-textItemBlur'
                            )}
                          >
                            {xs.length}/{max}
                          </span>
                        </span>
                        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                          {xs.map((c) => (
                            <span
                              key={c.id}
                              onClick={() => onOpen(c.id)}
                              className={clsx(
                                'rounded-[4px] px-[6px] py-[2px] cursor-pointer break-words text-[12px]',
                                xs.length > max ? 'bg-[#FF5A52]/15 text-[#FF5A52]' : 'bg-btnPrimary/15 text-textColor'
                              )}
                            >
                              {c.episode ? c.episode + ' · ' : ''}
                              {c.title}
                              {team && c.assignee ? ` (${c.assignee})` : ''}
                            </span>
                          ))}
                          {xs.length < max && (
                            <span
                              onClick={() =>
                                onNew({
                                  format: 'dai',
                                  editStart: d,
                                  editEnd: d,
                                  editSlot: k,
                                  assignee: team ? '' : p,
                                  status: 'da-quay',
                                })
                              }
                              className="rounded-[4px] px-[6px] py-[2px] cursor-pointer text-[12px] border border-dashed border-newBgLineColor text-textItemBlur hover:border-btnPrimary"
                            >
                              + xếp video ({max - xs.length} chỗ trống)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  };
                  const noSlot = longs.filter((c) => !c.editSlot);
                  const ongoing = list.filter(
                    (c) =>
                      c.editStart &&
                      c.editEnd &&
                      c.editStart <= d &&
                      d < c.editEnd &&
                      (team || (c.assignee || '(chưa gán)') === p)
                  );
                  return (
                    <td key={p} className={td}>
                      {slot('sang')}
                      {slot('chieu')}
                      {noSlot.map((c) => (
                        <span
                          key={c.id}
                          onClick={() => onOpen(c.id)}
                          className="block rounded-[4px] px-[6px] py-[2px] cursor-pointer text-[12px] bg-[#FF5A52]/15 text-[#FF5A52]"
                        >
                          {c.title} (chưa chọn buổi)
                        </span>
                      ))}
                      {ongoing.length > 0 && (
                        <div className="text-[11.5px] text-textItemBlur mt-[2px]">
                          Đang dựng dở:{' '}
                          {joinOpen(ongoing, onOpen, (c) => `${c.episode || c.title} (xong ${fmt(c.editEnd)})`)}
                        </div>
                      )}
                      {shorts.length > 0 && (
                        <div className="text-[11.5px] text-textItemBlur mt-[2px]">
                          + {shorts.length} video ngắn: {joinOpen(shorts, onOpen, (c) => c.episode || c.title || '')}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
