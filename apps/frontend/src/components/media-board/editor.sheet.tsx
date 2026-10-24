'use client';

import { FC, FormEvent, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Board,
  COMMON_CHANNELS,
  DEFAULT_GOALS,
  LONG_MIN,
  MediaCard,
  SIDX,
  STATUSES,
  checkDates,
  codeSort,
  cutPreset,
  fillByDeadline,
  fmt,
  inferStatus,
  normalizeCardInput,
  prepareCardSave,
  siblingPreset,
  splitList,
  today,
} from '@gitroom/frontend/components/media-board/logic';
import { Field, Fieldset, Sheet, btnCls, inputCls } from '@gitroom/frontend/components/media-board/ui';

type Form = {
  title: string;
  stream: string;
  subseries: string;
  episode: string;
  parentCode: string;
  duration: string;
  format: string;
  channel: string;
  subch: string;
  publishDate: string;
  publishUrl: string;
  assignee: string;
  streamOwner: string;
  reviewer: string;
  goal: string;
  shootDate: string;
  shootTime: string;
  scriptUrl: string;
  editStart: string;
  editEnd: string;
  editSlot: string;
  editedUrl: string;
  status: string;
  notes: string;
};

const s = (v: any) => (v === undefined || v === null ? '' : String(v));

export const EditorSheet: FC<{
  board: Board;
  id: string | null;
  preset?: Partial<MediaCard>;
  errMsg?: string;
  onClose: () => void;
  onReopen: (preset: Partial<MediaCard>) => void;
  onCreate: (body: Partial<MediaCard>) => Promise<void>;
  onSet: (id: string, body: Partial<MediaCard>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ board, id, preset = {}, errMsg = '', onClose, onReopen, onCreate, onSet, onDelete }) => {
  const uid = useId();
  const base = id ? board.cards.find((c) => c.id === id) || null : null;
  // Khởi tạo form đúng 1 lần khi mở sheet (sheet được mount lại cho mỗi thẻ).
  const [f, setF] = useState<Form>(() => {
    const c: Partial<MediaCard> = { format: 'dai', status: 'kich-ban', ...(base || {}), ...preset };
    return {
      title: s(c.title),
      stream: s(c.stream),
      subseries: s(c.subseries),
      episode: s(c.episode),
      parentCode: s(c.parentCode),
      duration: s(c.duration),
      format: s(c.format),
      channel: s(c.channel),
      subch: board.subChannelsOf(c).join(', '),
      publishDate: s(c.publishDate),
      publishUrl: s(c.publishUrl),
      assignee: s(c.assignee),
      streamOwner: s(c.streamOwner),
      reviewer: s(c.reviewer),
      goal: s(c.goal),
      shootDate: s(c.shootDate),
      shootTime: s(c.shootTime),
      scriptUrl: s(c.scriptUrl),
      editStart: s(c.editStart),
      editEnd: s(c.editEnd),
      editSlot: s(c.editSlot),
      editedUrl: s(c.editedUrl),
      status: s(c.status),
      notes: s(c.notes),
    };
  });
  const [err, setErr] = useState(errMsg);
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const read = (): Partial<MediaCard> => {
    const { subch, ...rest } = f;
    return normalizeCardInput({ ...rest, subChannels: subch });
  };
  const fail = (m: string) => {
    setErr(m);
    setTimeout(() => errRef.current?.scrollIntoView({ block: 'nearest' }), 0);
  };

  /* ---- gợi ý tính trực tiếp từ dữ liệu đang nhập (refresh() của bản gốc) ---- */
  const d = read();
  const { config } = board;
  const max = config.maxLongPerSlot || 2;
  const capHint =
    d.format === 'dai' && d.editEnd
      ? `${config.limitScope === 'team' ? 'Cả team' : d.assignee || 'Người này'} ngày ${fmt(d.editEnd)}: buổi sáng ${
          board.longEditsOn(d.editEnd, d.assignee, id, 'sang').length
        }/${max}, buổi chiều ${board.longEditsOn(d.editEnd, d.assignee, id, 'chieu').length}/${max} video dài.`
      : '';
  const ns = inferStatus(d);
  const autoHint = ns !== d.status ? `Khi lưu, thẻ sẽ tự chuyển sang “${STATUSES[SIDX[ns]].name}” theo dữ liệu đã nhập.` : '';
  const dl = board.deadlines(d);
  const t = today();
  const dlWarn: string[] = [];
  if (d.publishDate) {
    if (dl.shootBy < t && SIDX[d.status as string] <= SIDX['cho-quay']) dlWarn.push('hạn quay đã qua — nên lùi ngày phát');
    if (d.shootDate && d.shootDate > dl.shootBy) dlWarn.push('ngày quay đang muộn hơn hạn');
    if (d.editEnd && d.editEnd > dl.editBy) dlWarn.push('ngày hoàn thành dựng đang muộn hơn hạn');
    const bad = checkDates(d);
    if (bad) dlWarn.push(bad.toLowerCase().replace(/\.$/, ''));
  }
  const fillSchedule = () => {
    const r = fillByDeadline(board, d, t);
    if (r) setF((p) => ({ ...p, ...r }));
  };

  let cutHint = f.parentCode
    ? 'Thẻ này là bản cắt, không có kênh phụ riêng.'
    : 'Mỗi kênh phụ là một thẻ bản cắt riêng. Bảng cảnh báo nếu bản gốc đã duyệt mà kênh nào còn thiếu thẻ.';
  if (base && !base.parentCode && base.episode) {
    const kids = board.childrenOf(base),
      miss = board.missingCuts(base);
    if (kids.length || miss.length)
      cutHint = `Đã có ${kids.length} bản cắt${
        kids.length ? ': ' + kids.map((k) => `${k.episode || k.title} (${k.channel || 'chưa ghi kênh'})`).join(', ') : ''
      }${miss.length ? ` · Còn thiếu: ${miss.join(', ')}` : ' · Đủ kênh phụ'}.`;
  }

  /* ---- sự kiện ---- */
  const onDuration = (v: string) => {
    const n = parseFloat(v);
    setF((p) => ({ ...p, duration: v, ...(!isNaN(n) ? { format: n > LONG_MIN ? 'dai' : 'ngan' } : {}) }));
  };
  const onStream = (v: string) => {
    const st = board.streamOf(v);
    setF((p) => {
      const n = { ...p, stream: v };
      if (st) {
        if (!n.streamOwner) n.streamOwner = st.owner || '';
        if (!n.reviewer) n.reviewer = st.reviewer || '';
        if (!n.goal) n.goal = st.goal || '';
        if (!n.channel) n.channel = (st.channel || '').split(/[,;]/)[0].trim();
        if (!n.subch && !n.parentCode.trim()) n.subch = splitList(st.subChannels).join(', ');
        if (!base || !n.episode) n.episode = board.nextCode(st.name);
      }
      return n;
    });
  };
  const makeCut = () => {
    if (!base) return;
    const r = cutPreset(board, base, read());
    if (r.error) return fail(r.error);
    onReopen(r.preset);
  };
  const makeSibling = () => {
    if (!base) return;
    onReopen(siblingPreset(board, base, read()));
  };
  const remove = async () => {
    if (!base) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    await onDelete(base.id);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = prepareCardSave(board, base, read());
    if (r.error) return fail(r.error);
    setSaving(true);
    try {
      if (base) await onSet(base.id, r.card);
      else await onCreate(r.card);
    } catch {
      setSaving(false);
      fail('Chưa lưu được, thử lại sau ít giây.');
    }
  };

  /* ---- datalist ---- */
  const L = {
    people: `${uid}-people`,
    goals: `${uid}-goals`,
    channels: `${uid}-channels`,
    subs: `${uid}-subs`,
    codes: `${uid}-codes`,
  };
  const goals = [...new Set([...DEFAULT_GOALS, ...config.streams.map((x) => x.goal).filter(Boolean)])] as string[];
  const channels = [
    ...new Set(
      config.streams
        .flatMap((x) => splitList(x.channel).concat(splitList(x.subChannels)))
        .concat(board.cards.map((c) => c.channel as string), COMMON_CHANNELS)
        .filter(Boolean)
    ),
  ];
  const fid = (k: string) => `${uid}-${k}`;

  return (
    <Sheet onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-[14px]">
        <h2 className="m-0 text-[17px] font-[800]">{base ? 'Sửa video' : 'Thêm video'}</h2>
        <div ref={errRef}>
          {err && <div className="bg-[#FF5A52]/15 text-[#FF5A52] rounded-[6px] px-[11px] py-[9px] text-[13px] font-[600]">{err}</div>}
        </div>

        <Fieldset legend="Tập">
          <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Luồng nội dung" htmlFor={fid('stream')}>
              <select id={fid('stream')} className={inputCls} value={f.stream} onChange={(e) => onStream(e.target.value)}>
                <option value="">— chọn luồng —</option>
                {config.streams.map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.name}
                  </option>
                ))}
                {f.stream && !board.streamOf(f.stream) && <option value={f.stream}>{f.stream}</option>}
              </select>
            </Field>
            <Field label="Chuyên mục trong luồng" htmlFor={fid('sub')}>
              <input id={fid('sub')} list={L.subs} className={inputCls} value={f.subseries} onChange={set('subseries')} placeholder="VD: Một ngày của học sinh" />
            </Field>
            <Field label="Mã tập" htmlFor={fid('code')} help="Dùng mã này đặt tên file trên Drive và ghi vào mô tả bài đăng.">
              <input id={fid('code')} className={inputCls} value={f.episode} onChange={set('episode')} placeholder="Tự đánh khi chọn luồng" />
            </Field>
            <Field label="Cắt từ video gốc (mã tập)" htmlFor={fid('parent')}>
              <input id={fid('parent')} list={L.codes} className={inputCls} value={f.parentCode} onChange={set('parentCode')} placeholder="Chỉ cho Shorts/Reels" />
            </Field>
          </div>
          <Field label="Tiêu đề video" htmlFor={fid('title')}>
            <input id={fid('title')} autoFocus required className={inputCls} value={f.title} onChange={set('title')} placeholder="VD: Ngày 12 — Khen đúng cách" />
          </Field>
          <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Thời lượng dự kiến (phút)" htmlFor={fid('dur')} help={`Trên ${LONG_MIN} phút tự tính là video dài.`}>
              <input id={fid('dur')} type="number" min="0" step="0.5" className={inputCls} value={f.duration} onChange={(e) => onDuration(e.target.value)} />
            </Field>
            <Field label="Định dạng" htmlFor={fid('format')}>
              <select id={fid('format')} className={inputCls} value={f.format === 'dai' ? 'dai' : 'ngan'} onChange={set('format')}>
                <option value="dai">Video dài (trên {LONG_MIN} phút)</option>
                <option value="ngan">Video ngắn (Shorts/Reels)</option>
              </select>
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Phát hành · điền trước để tính ngược lịch">
          <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Ngày phát hành" htmlFor={fid('pub')}>
              <input id={fid('pub')} type="date" required className={inputCls} value={f.publishDate} onChange={set('publishDate')} />
            </Field>
            <Field label="Kênh phát hành chính" htmlFor={fid('channel')} help="Kênh đăng bản gốc.">
              <input id={fid('channel')} list={L.channels} className={inputCls} value={f.channel} onChange={set('channel')} />
            </Field>
            <Field label="Kế hoạch kênh phụ (bản cắt)" htmlFor={fid('subch')} help={cutHint} className="col-span-full">
              <input
                id={fid('subch')}
                className={inputCls}
                value={f.subch}
                onChange={set('subch')}
                placeholder="VD: Facebook Reels, YouTube Shorts, TikTok"
                disabled={!!f.parentCode}
              />
            </Field>
          </div>
          <div className="bg-btnPrimary/10 rounded-[6px] px-[11px] py-[9px] text-[12.5px]">
            {!d.publishDate ? (
              'Chọn ngày phát hành để bảng tính hạn quay và hạn dựng xong.'
            ) : (
              <>
                Hạn quay: <strong>{fmt(dl.shootBy)}</strong> · Hạn dựng xong: <strong>{fmt(dl.editBy)}</strong> · Phát:{' '}
                <strong>{fmt(d.publishDate)}</strong>
                {dlWarn.length > 0 && (
                  <>
                    <br />
                    <span className="text-[#FF5A52] font-[600]">{dlWarn.join('; ')}</span>
                  </>
                )}{' '}
                <button type="button" className={clsx(btnCls('default', true), 'ms-[6px]')} onClick={fillSchedule}>
                  Điền lịch theo hạn
                </button>
              </>
            )}
          </div>
          <Field label="URL bài đã đăng" htmlFor={fid('puburl')}>
            <input id={fid('puburl')} type="url" className={inputCls} value={f.publishUrl} onChange={set('publishUrl')} placeholder="Điền sau khi đăng: https://www.youtube.com/…" />
          </Field>
        </Fieldset>

        <Fieldset legend="Người & mục tiêu">
          <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Người phụ trách (quay/dựng)" htmlFor={fid('assignee')}>
              <input id={fid('assignee')} list={L.people} className={inputCls} value={f.assignee} onChange={set('assignee')} />
            </Field>
            <Field label="Người chủ luồng" htmlFor={fid('owner')}>
              <input id={fid('owner')} list={L.people} className={inputCls} value={f.streamOwner} onChange={set('streamOwner')} placeholder="Theo luồng nếu để trống" />
            </Field>
            <Field label="Người duyệt" htmlFor={fid('rev')}>
              <input id={fid('rev')} list={L.people} className={inputCls} value={f.reviewer} onChange={set('reviewer')} placeholder="Theo luồng nếu để trống" />
            </Field>
            <Field label="Mục tiêu" htmlFor={fid('goal')}>
              <input id={fid('goal')} list={L.goals} className={inputCls} value={f.goal} onChange={set('goal')} />
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Quay">
          <div className="grid grid-cols-3 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Ngày quay" htmlFor={fid('shoot')}>
              <input id={fid('shoot')} type="date" className={inputCls} value={f.shootDate} onChange={set('shootDate')} />
            </Field>
            <Field label="Giờ quay" htmlFor={fid('shoottime')}>
              <input id={fid('shoottime')} type="time" className={inputCls} value={f.shootTime} onChange={set('shootTime')} />
            </Field>
            <Field label="Link kịch bản" htmlFor={fid('script')}>
              <input id={fid('script')} type="url" className={inputCls} value={f.scriptUrl} onChange={set('scriptUrl')} placeholder="https://docs.google.com/…" />
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Dựng">
          <div className="grid grid-cols-3 max-[520px]:grid-cols-1 gap-[12px]">
            <Field label="Ngày bắt đầu dựng" htmlFor={fid('estart')}>
              <input id={fid('estart')} type="date" className={inputCls} value={f.editStart} onChange={set('editStart')} />
            </Field>
            <Field label="Ngày hoàn thành" htmlFor={fid('edit')}>
              <input id={fid('edit')} type="date" className={inputCls} value={f.editEnd} onChange={set('editEnd')} />
            </Field>
            <Field label="Buổi hoàn thành" htmlFor={fid('slot')}>
              <select id={fid('slot')} className={inputCls} value={f.editSlot} onChange={set('editSlot')}>
                <option value="">—</option>
                <option value="sang">Sáng</option>
                <option value="chieu">Chiều</option>
              </select>
            </Field>
          </div>
          <span className="text-[11.5px] text-textItemBlur">
            Giới hạn {max} video dài/buổi tính theo buổi hoàn thành dựng. Bắt buộc chọn buổi với video dài.
          </span>
          <Field label="Link file đã dựng (folder Edited)" htmlFor={fid('edited')}>
            <input id={fid('edited')} type="url" className={inputCls} value={f.editedUrl} onChange={set('editedUrl')} placeholder="https://drive.google.com/…" />
          </Field>
          {capHint && <span className="text-[11.5px] text-textItemBlur">{capHint}</span>}
        </Fieldset>

        <div className="grid grid-cols-2 max-[520px]:grid-cols-1 gap-[12px]">
          <Field label="Trạng thái" htmlFor={fid('status')}>
            <select id={fid('status')} className={inputCls} value={f.status} onChange={set('status')}>
              {STATUSES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {autoHint && <div className="bg-btnPrimary/10 rounded-[6px] px-[11px] py-[9px] text-[12.5px]">{autoHint}</div>}
        <Field label="Ghi chú" htmlFor={fid('notes')}>
          <textarea id={fid('notes')} rows={4} className={clsx(inputCls, 'h-auto py-[7px]')} value={f.notes} onChange={set('notes')} />
        </Field>

        <div className="flex flex-wrap gap-[8px] justify-end">
          {base && (
            <>
              <button type="button" className={btnCls('danger')} onClick={remove}>
                {armed ? 'Bấm lần nữa để xoá' : 'Xoá thẻ'}
              </button>
              <button type="button" className={btnCls()} onClick={makeSibling}>
                + Tập khác cùng buổi quay
              </button>
              {!base.parentCode && (
                <button type="button" className={btnCls()} onClick={makeCut}>
                  + Tạo bản cắt
                </button>
              )}
            </>
          )}
          <span className="flex-1" />
          <button type="button" className={btnCls()} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnCls('primary')} disabled={saving}>
            {base ? 'Lưu thay đổi' : 'Tạo thẻ'}
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
      <datalist id={L.channels}>
        {channels.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id={L.subs}>
        {(board.streamOf(f.stream)?.subseries || []).map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id={L.codes}>
        {board.cards
          .filter((c) => c.episode)
          .sort(codeSort)
          .map((c) => (
            <option key={c.id} value={c.episode}>
              {c.title}
            </option>
          ))}
      </datalist>
    </Sheet>
  );
};
