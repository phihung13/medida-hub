'use client';

import { FC, Fragment } from 'react';
import clsx from 'clsx';
import {
  Board,
  MediaCard,
  SLOT_NAME,
  Slot,
  calendarData,
  fmt,
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
// sáng/chiều theo buổi HOÀN THÀNH dựng của video dài. Dữ liệu từ calendarData
// (dùng chung với công cụ MCP media_board_lich_dung).
export const CalendarView: FC<{
  board: Board;
  list: MediaCard[];
  onOpen: (id: string) => void;
  onNew: (preset: Partial<MediaCard>) => void;
}> = ({ board, list, onOpen, onNew }) => {
  const { team, editors, max, days, backlog } = calendarData(board, list);
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
          {days.map((day) => (
            <tr key={day.date}>
              <td
                className={clsx(
                  td,
                  'whitespace-nowrap font-mono text-[12px] w-[96px]',
                  day.weekend && 'text-textItemBlur',
                  day.isToday && 'text-btnPrimary font-[600]'
                )}
              >
                {fmt(day.date)}
                {day.isToday && (
                  <>
                    <br />
                    hôm nay
                  </>
                )}
              </td>
              {day.cells.map((cell) => {
                const slot = (k: Slot) => {
                  const xs = cell.slots[k];
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
                                editStart: day.date,
                                editEnd: day.date,
                                editSlot: k,
                                assignee: team ? '' : cell.editor,
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
                return (
                  <td key={cell.editor} className={td}>
                    {slot('sang')}
                    {slot('chieu')}
                    {cell.noSlot.map((c) => (
                      <span
                        key={c.id}
                        onClick={() => onOpen(c.id)}
                        className="block rounded-[4px] px-[6px] py-[2px] cursor-pointer text-[12px] bg-[#FF5A52]/15 text-[#FF5A52]"
                      >
                        {c.title} (chưa chọn buổi)
                      </span>
                    ))}
                    {cell.ongoing.length > 0 && (
                      <div className="text-[11.5px] text-textItemBlur mt-[2px]">
                        Đang dựng dở: {joinOpen(cell.ongoing, onOpen, (c) => `${c.episode || c.title} (xong ${fmt(c.editEnd)})`)}
                      </div>
                    )}
                    {cell.shorts.length > 0 && (
                      <div className="text-[11.5px] text-textItemBlur mt-[2px]">
                        + {cell.shorts.length} video ngắn: {joinOpen(cell.shorts, onOpen, (c) => c.episode || c.title || '')}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
