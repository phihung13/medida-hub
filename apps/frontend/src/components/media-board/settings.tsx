'use client';

import { FC, FormEvent, useId, useState } from 'react';
import {
  Board,
  DEFAULT_GOALS,
  MediaConfig,
  sanitizeConfig,
  splitList,
} from '@gitroom/frontend/components/media-board/logic';
import { Field, Fieldset, Sheet, btnCls, inputCls } from '@gitroom/frontend/components/media-board/ui';

type Row = Record<
  'name' | 'code' | 'group' | 'owner' | 'reviewer' | 'goal' | 'channel' | 'subChannels' | 'pubLong' | 'pubShort' | 'shootPerWeek' | 'subseries',
  string
>;

const s = (v: any) => (v === undefined || v === null ? '' : String(v));

export const SettingsSheet: FC<{
  board: Board;
  onClose: () => void;
  onSave: (next: MediaConfig) => Promise<void>;
}> = ({ board, onClose, onSave }) => {
  const uid = useId();
  const { config } = board;
  const [rows, setRows] = useState<Row[]>(() =>
    config.streams.map((x) => ({
      name: s(x.name),
      code: s(x.code),
      group: s(x.group),
      owner: s(x.owner),
      reviewer: s(x.reviewer),
      goal: s(x.goal),
      channel: s(x.channel),
      subChannels: splitList(x.subChannels).join(', '),
      pubLong: s(x.pubLong),
      pubShort: s(x.pubShort),
      shootPerWeek: s(x.shootPerWeek),
      subseries: (x.subseries || []).join(', '),
    }))
  );
  const [rules, setRules] = useState({
    max: s(config.maxLongPerSlot || 2),
    scope: config.limitScope === 'team' ? 'team' : 'nguoi',
    warn: s(config.scheduleWarnDays ?? 3),
    backlog: s(config.maxBacklogPerPerson ?? 20),
    elead: s(config.editLeadDays ?? 2),
    slead: s(config.shootLeadDays ?? 4),
    review: s(config.reviewHours || 24),
    people: (config.people || []).join(', '),
  });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, k: keyof Row, v: string) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setRule = (k: keyof typeof rules) => (e: { target: { value: string } }) => setRules((p) => ({ ...p, [k]: e.target.value }));
  const add = () =>
    setRows((p) => [
      ...p,
      { name: '', code: '', group: '', owner: '', reviewer: '', goal: '', channel: '', subChannels: '', pubLong: '', pubShort: '', shootPerWeek: '', subseries: '' },
    ]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = sanitizeConfig({
      streams: rows,
      people: rules.people,
      maxLongPerSlot: rules.max,
      limitScope: rules.scope,
      scheduleWarnDays: rules.warn,
      maxBacklogPerPerson: rules.backlog,
      reviewHours: rules.review,
      editLeadDays: rules.elead,
      shootLeadDays: rules.slead,
    });
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      setSaving(false);
      setErr('Chưa lưu được, thử lại sau ít giây.');
    }
  };

  const L = { people: `${uid}-people`, goals: `${uid}-goals` };
  const goals = [...new Set([...DEFAULT_GOALS, ...config.streams.map((x) => x.goal).filter(Boolean)])] as string[];
  const F = (i: number, k: keyof Row, lab: string, ph = '', type = 'text', list = '') => (
    <Field label={lab} htmlFor={`${uid}-${i}-${k}`}>
      <input
        id={`${uid}-${i}-${k}`}
        type={type}
        {...(type === 'number' ? { min: '0', step: '0.5' } : {})}
        list={list || undefined}
        className={inputCls}
        value={rows[i][k]}
        placeholder={ph}
        onChange={(e) => setRow(i, k, e.target.value)}
      />
    </Field>
  );

  return (
    <Sheet onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="flex flex-col gap-[14px]">
        <h2 className="m-0 text-[17px] font-[800]">Cài đặt luồng &amp; quy tắc</h2>
        <Fieldset legend="Luồng nội dung">
          <div className="flex flex-col gap-[10px]">
            {rows.map((r, i) => (
              <div key={i} className="border border-newBgLineColor rounded-[8px] p-[10px] flex flex-col gap-[8px]">
                <div className="flex gap-[8px] items-center">
                  <input
                    aria-label="Tên luồng"
                    className={`${inputCls} flex-1`}
                    value={r.name}
                    placeholder="Tên luồng"
                    onChange={(e) => setRow(i, 'name', e.target.value)}
                  />
                  <button
                    type="button"
                    className={btnCls()}
                    aria-label="Xoá luồng"
                    onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                  >
                    Xoá
                  </button>
                </div>
                <div className="grid grid-cols-3 max-[520px]:grid-cols-1 gap-[12px]">
                  {F(i, 'code', 'Mã luồng', 'VD: 66N')}
                  <Field label="Nhóm kênh" htmlFor={`${uid}-${i}-group`}>
                    <select id={`${uid}-${i}-group`} className={inputCls} value={r.group} onChange={(e) => setRow(i, 'group', e.target.value)}>
                      <option value="">—</option>
                      <option value="Founder">Founder</option>
                      <option value="Official">Official</option>
                    </select>
                  </Field>
                  {F(i, 'owner', 'Chủ luồng', '', 'text', L.people)}
                  {F(i, 'reviewer', 'Người duyệt', '', 'text', L.people)}
                  {F(i, 'goal', 'Mục tiêu', '', 'text', L.goals)}
                  {F(i, 'channel', 'Kênh phát hành chính')}
                  {F(i, 'subChannels', 'Kênh phụ cắt ra (cách nhau dấu phẩy)', 'VD: Facebook Reels, TikTok')}
                  {F(i, 'pubLong', 'Phát dài/tuần', '0.5 = 1 video/2 tuần', 'number')}
                  {F(i, 'pubShort', 'Phát ngắn/tuần', '', 'number')}
                  {F(i, 'shootPerWeek', 'Quay/tuần', '', 'number')}
                </div>
                {F(i, 'subseries', 'Chuyên mục (cách nhau dấu phẩy)', 'VD: Một ngày của học sinh, Bữa ăn, CLB')}
              </div>
            ))}
          </div>
          <div>
            <button type="button" className={btnCls()} onClick={add}>
              + Thêm luồng
            </button>
          </div>
        </Fieldset>

        <Fieldset legend="Quy tắc">
          <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Tối đa video dài/buổi" htmlFor={`${uid}-max`}>
              <input id={`${uid}-max`} type="number" min="1" max="4" className={inputCls} value={rules.max} onChange={setRule('max')} />
            </Field>
            <Field label="Giới hạn tính cho" htmlFor={`${uid}-scope`}>
              <select id={`${uid}-scope`} className={inputCls} value={rules.scope} onChange={setRule('scope')}>
                <option value="nguoi">Mỗi người dựng</option>
                <option value="team">Cả team Media</option>
              </select>
            </Field>
            <Field label="Nhắc xếp lịch dựng khi còn (ngày) đến hạn dựng xong" htmlFor={`${uid}-warn`}>
              <input id={`${uid}-warn`} type="number" min="0" max="14" className={inputCls} value={rules.warn} onChange={setRule('warn')} />
            </Field>
            <Field label="Cảnh báo tồn kho đã quay chưa dựng / người (0 = không giới hạn)" htmlFor={`${uid}-backlog`}>
              <input id={`${uid}-backlog`} type="number" min="0" max="200" className={inputCls} value={rules.backlog} onChange={setRule('backlog')} />
            </Field>
            <Field label="Dựng xong trước ngày phát (ngày)" htmlFor={`${uid}-elead`}>
              <input id={`${uid}-elead`} type="number" min="0" max="14" className={inputCls} value={rules.elead} onChange={setRule('elead')} />
            </Field>
            <Field label="Quay trước ngày phát (ngày)" htmlFor={`${uid}-slead`}>
              <input id={`${uid}-slead`} type="number" min="0" max="30" className={inputCls} value={rules.slead} onChange={setRule('slead')} />
            </Field>
            <Field label="Hạn duyệt (giờ)" htmlFor={`${uid}-review`}>
              <input id={`${uid}-review`} type="number" min="1" max="96" className={inputCls} value={rules.review} onChange={setRule('review')} />
            </Field>
            <Field label="Thành viên team (cách nhau dấu phẩy)" htmlFor={`${uid}-people`}>
              <input id={`${uid}-people`} className={inputCls} value={rules.people} onChange={setRule('people')} />
            </Field>
          </div>
        </Fieldset>

        {err && <div className="bg-[#FF5A52]/15 text-[#FF5A52] rounded-[6px] px-[11px] py-[9px] text-[13px] font-[600]">{err}</div>}
        <div className="flex flex-wrap gap-[8px] justify-end">
          <button type="button" className={btnCls()} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnCls('primary')} disabled={saving}>
            Lưu cài đặt
          </button>
        </div>
      </form>
      <datalist id={L.people}>
        {board.peopleList().map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id={L.goals}>
        {goals.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </Sheet>
  );
};
