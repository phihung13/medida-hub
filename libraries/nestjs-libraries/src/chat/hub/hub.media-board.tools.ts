import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MediaBoardService } from '@gitroom/nestjs-libraries/database/prisma/media-board/media-board.service';
import {
  HubToolGroup,
  HubToolMap,
  hasLevel,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';
import {
  Board,
  MediaCard,
  SIDX,
  STATUSES,
  boardSummary,
  buildCsv,
  cadText,
  calendarData,
  checkStage,
  codeSort,
  fillByDeadline,
  filterCards,
  fmt,
  rulesText,
  sevOf,
  splitList,
  today,
} from '@gitroom/helpers/utils/media-board.logic';

// ============================================================================
//  Nhóm "Bảng sản xuất Media" (/media-board): Kịch bản → Chờ quay → Đã quay →
//  Đang dựng → Chờ duyệt → Lên lịch phát → Đã phát hành.
//  Mọi thao tác ghi đi qua ĐÚNG luật của giao diện (hạn quay/dựng tính ngược
//  từ ngày phát, tối đa N video dài/buổi, điều kiện từng cột, tự suy trạng
//  thái) nhờ logic dùng chung. Không có gì ra ngoài mạng xã hội: bảng chỉ
//  theo dõi sản xuất. Riêng bước DUYỆT (đưa thẻ vào Lên lịch phát) cần "dang".
// ============================================================================

const STATUS_IDS = STATUSES.map((s) => s.id) as [string, ...string[]];
const DATE = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Ngày dạng YYYY-MM-DD (chuỗi rỗng để xoá)');

// Tên trường cho agent (tiếng Việt) ↔ trường của thẻ.
const FIELDS: [string, keyof MediaCard][] = [
  ['tieu_de', 'title'],
  ['luong', 'stream'],
  ['chuyen_muc', 'subseries'],
  ['ma_tap', 'episode'],
  ['cat_tu_ma_tap', 'parentCode'],
  ['thoi_luong_phut', 'duration'],
  ['dinh_dang', 'format'],
  ['kenh_chinh', 'channel'],
  ['kenh_phu', 'subChannels'],
  ['nguoi_phu_trach', 'assignee'],
  ['chu_luong', 'streamOwner'],
  ['nguoi_duyet', 'reviewer'],
  ['muc_tieu', 'goal'],
  ['trang_thai', 'status'],
  ['ngay_phat_hanh', 'publishDate'],
  ['url_bai_dang', 'publishUrl'],
  ['ngay_quay', 'shootDate'],
  ['gio_quay', 'shootTime'],
  ['link_kich_ban', 'scriptUrl'],
  ['bat_dau_dung', 'editStart'],
  ['xong_dung', 'editEnd'],
  ['buoi_xong_dung', 'editSlot'],
  ['link_file_dung', 'editedUrl'],
  ['ghi_chu', 'notes'],
];

const cardFields = {
  tieu_de: z.string().optional().describe('Tiêu đề video'),
  luong: z
    .string()
    .optional()
    .describe(
      'Tên luồng nội dung (xem media_board_cau_hinh). Chọn luồng → Hub điền chủ luồng, người duyệt, mục tiêu, kênh chính, kênh phụ còn trống và đánh mã tập kế tiếp nếu chưa có mã'
    ),
  chuyen_muc: z.string().optional().describe('Chuyên mục trong luồng'),
  ma_tap: z.string().optional().describe('Mã tập (vd 66N-012), không trùng. Bỏ trống để Hub tự đánh theo mã luồng'),
  cat_tu_ma_tap: z.string().optional().describe('Mã tập của video gốc nếu đây là bản cắt Shorts/Reels'),
  thoi_luong_phut: z
    .union([z.number(), z.string()])
    .optional()
    .describe('Thời lượng dự kiến (phút). Trên 5 phút tự tính là video dài nếu không truyền dinh_dang'),
  dinh_dang: z.enum(['dai', 'ngan']).optional().describe('dai = video dài (trên 5 phút), ngan = Shorts/Reels'),
  kenh_chinh: z.string().optional().describe('Kênh phát hành chính (kênh đăng bản gốc)'),
  kenh_phu: z
    .array(z.string())
    .optional()
    .describe('Kế hoạch kênh phụ (bản cắt) — mỗi kênh cần một thẻ bản cắt riêng (media_board_tao_ban_cat)'),
  nguoi_phu_trach: z.string().optional().describe('Người quay/dựng'),
  chu_luong: z.string().optional().describe('Người chủ luồng; bỏ trống = theo luồng'),
  nguoi_duyet: z.string().optional().describe('Người duyệt; bỏ trống = theo luồng'),
  muc_tieu: z.string().optional().describe('Mục tiêu (vd Qlead, Đăng ký kênh, Đặt lịch tham quan…)'),
  trang_thai: z
    .enum(STATUS_IDS)
    .optional()
    .describe(
      'kich-ban | cho-quay | da-quay | dang-dung | cho-duyet | len-lich | da-phat. Hub tự chuyển tới khi đủ dữ liệu (link kịch bản + ngày quay → cho-quay; link file dựng → cho-duyet; URL bài đăng → da-phat)'
    ),
  ngay_phat_hanh: DATE.optional().describe(
    'YYYY-MM-DD. BẮT BUỘC (trừ thẻ đã phát hành) — hạn quay và hạn dựng xong tính ngược từ ngày này'
  ),
  url_bai_dang: z.string().optional().describe('https://… bài đã đăng (có link thì thẻ tự sang Đã phát hành)'),
  ngay_quay: DATE.optional().describe('YYYY-MM-DD'),
  gio_quay: z
    .string()
    .regex(/^(\d{2}:\d{2})?$/, 'Giờ dạng HH:mm')
    .optional()
    .describe('HH:mm'),
  link_kich_ban: z.string().optional().describe('https://… link kịch bản'),
  bat_dau_dung: DATE.optional().describe('YYYY-MM-DD ngày bắt đầu dựng'),
  xong_dung: DATE.optional().describe('YYYY-MM-DD ngày hoàn thành dựng'),
  buoi_xong_dung: z
    .enum(['sang', 'chieu', ''])
    .optional()
    .describe('Buổi hoàn thành dựng — BẮT BUỘC với video dài; mỗi buổi chỉ nhận tối đa N video dài/người (xem quy tắc)'),
  link_file_dung: z.string().optional().describe('https://… link file đã dựng (folder Edited) — có link thì thẻ tự sang Chờ duyệt'),
  ghi_chu: z.string().optional().describe('Ghi chú'),
};

const toCardFields = (input: Record<string, any>) => {
  const out: Partial<MediaCard> = {};
  for (const [vi, k] of FIELDS) {
    if (input[vi] !== undefined) (out as any)[k] = input[vi] === null ? '' : input[vi];
  }
  return out;
};

const REF = z.string().describe('id hoặc mã tập của thẻ');
const statusName = (id: string) => STATUSES[SIDX[id] ?? 0]?.name || id;
const brief = (c: MediaCard) => ({ id: c.id, ma_tap: c.episode || null, tieu_de: c.title || '' });

// Thẻ trả cho agent: dữ liệu + các giá trị Hub tính (hạn, cảnh báo, bản cắt).
const cardOut = (b: Board, c: MediaCard, full = false) => {
  const a = b.alertsFor(c);
  const dl = b.deadlines(c);
  const subs = b.subChannelsOf(c);
  return {
    id: c.id,
    ma_tap: c.episode || null,
    tieu_de: c.title || '',
    luong: c.stream || null,
    chuyen_muc: c.subseries || null,
    dinh_dang: c.format === 'dai' ? 'dai' : 'ngan',
    thoi_luong_phut: c.duration || null,
    trang_thai: c.status,
    ten_trang_thai: statusName(c.status),
    nguoi_phu_trach: c.assignee || null,
    nguoi_duyet: b.reviewerOf(c) || null,
    chu_luong: b.ownerOf(c) || null,
    muc_tieu: c.goal || null,
    ngay_phat_hanh: c.publishDate || null,
    kenh_chinh: c.channel || null,
    ngay_quay: c.shootDate || null,
    gio_quay: c.shootTime || null,
    bat_dau_dung: c.editStart || null,
    xong_dung: c.editEnd || null,
    buoi_xong_dung: c.editSlot || null,
    han_quay: dl.shootBy || null,
    han_dung_xong: dl.editBy || null,
    link_kich_ban: c.scriptUrl || null,
    link_file_dung: c.editedUrl || null,
    url_bai_dang: c.publishUrl || null,
    cat_tu_ma_tap: c.parentCode || null,
    ban_cat: subs.length
      ? { kenh_phu: subs, da_co: subs.length - b.missingCuts(c).length, thieu: b.missingCuts(c) }
      : undefined,
    muc_canh_bao: sevOf(a) === 'red' ? 'do' : sevOf(a) === 'amber' ? 'vang' : 'ok',
    canh_bao: a.map(([m, t]) => `${m === 'red' ? '[đỏ]' : '[vàng]'} ${t}`),
    ...(full
      ? {
          ghi_chu: c.notes || null,
          nguoi_duyet_rieng: c.reviewer || null,
          chu_luong_rieng: c.streamOwner || null,
          vao_cho_duyet_luc: c.stageAt?.['cho-duyet'] || null,
          duyet_luc: c.approvedAt || null,
          tao_luc: c.createdAt || null,
          cap_nhat_luc: c.updatedAt || null,
        }
      : {}),
  };
};

const filterInput = {
  tim: z.string().optional().describe('Tìm trong mã tập, tiêu đề, ghi chú, mục tiêu, luồng, chuyên mục'),
  luong: z.string().optional().describe('Lọc theo tên luồng'),
  chuyen_muc: z.string().optional(),
  nguoi: z.string().optional().describe('Người phụ trách / chủ luồng / người duyệt'),
  dinh_dang: z.enum(['dai', 'ngan']).optional(),
  loc: z
    .enum(['do', 'ton_kho', 'cho_duyet', 'tre_phat'])
    .optional()
    .describe('Như các chip đầu trang: do = thẻ có cảnh báo đỏ, ton_kho = đã quay chưa dựng, cho_duyet, tre_phat = trễ phát hành'),
};
const LOC: Record<string, string> = { do: 'red', ton_kho: 'backlog', cho_duyet: 'review', tre_phat: 'late-pub' };
const applyFilter = (b: Board, input: Record<string, any>) =>
  filterCards(b, b.cards, {
    q: input.tim,
    stream: input.luong,
    subseries: input.chuyen_muc,
    person: input.nguoi,
    format: input.dinh_dang,
    alert: input.loc ? LOC[input.loc] : '',
  });

@Injectable()
export class HubMediaBoardTools implements HubToolGroup {
  constructor(private _board: MediaBoardService) {}

  tools(): HubToolMap {
    const svc = this._board;
    return {
      media_board_tong_quan: hubTool({
        id: 'media_board_tong_quan',
        title: 'Bảng sản xuất Media — tổng quan',
        level: 'doc',
        description:
          'Tổng quan Bảng sản xuất video (như dải chip đầu trang /media-board): số thẻ theo cột, thẻ có cảnh báo đỏ, đã quay chưa dựng (+ tồn lâu nhất), chờ duyệt, trễ phát hành, đã phát 7 ngày qua, luồng lệch nhịp, quy tắc đang áp dụng và danh sách việc gấp (thẻ cảnh báo đỏ).',
        input: z.object({}),
        run: async (_input, org) => {
          const b = await svc.board(org.id);
          const s = boardSummary(b);
          const urgent = b.cards
            .filter((c) => sevOf(b.alertsFor(c)) === 'red')
            .sort(codeSort)
            .slice(0, 30)
            .map((c) => ({
              ...brief(c),
              trang_thai: statusName(c.status),
              nguoi_phu_trach: c.assignee || null,
              canh_bao_do: b.alertsFor(c).filter((x) => x[0] === 'red').map((x) => x[1]),
            }));
          return {
            hom_nay: today(),
            tong_the: b.cards.length,
            theo_cot: STATUSES.map((x) => ({
              trang_thai: x.id,
              ten: x.name,
              so_the: b.cards.filter((c) => c.status === x.id).length,
            })),
            the_canh_bao_do: s.red,
            da_quay_chua_dung: s.backlog,
            ton_kho_lau_nhat_ngay: s.oldest,
            cho_duyet: s.review,
            tre_phat_hanh: s.latePub,
            da_phat_7_ngay_qua: s.week,
            luong_lech_nhip: s.brk,
            quy_tac: rulesText(b.config),
            viec_gap: urgent,
          };
        },
      }),

      media_board_danh_sach: hubTool({
        id: 'media_board_danh_sach',
        title: 'Bảng sản xuất Media — danh sách thẻ',
        level: 'doc',
        description:
          'Danh sách thẻ video kèm hạn quay / hạn dựng xong (tính ngược từ ngày phát), cảnh báo đỏ/vàng, tiến độ bản cắt. Lọc như thanh lọc trên trang. Mặc định bỏ thẻ "Đã phát hành" (gom_da_phat=true để lấy cả).',
        input: z.object({
          ...filterInput,
          trang_thai: z.array(z.enum(STATUS_IDS)).optional().describe('Chỉ lấy các cột này'),
          gom_da_phat: z.boolean().optional(),
          sap_xep: z
            .enum(['ma_tap', 'ngay_phat', 'cap_nhat'])
            .optional()
            .describe('Mặc định ma_tap; ngay_phat = ngày phát gần nhất trước; cap_nhat = vừa sửa trước'),
          gioi_han: z.number().int().min(1).max(200).optional().describe('Mặc định 50'),
        }),
        run: async (input, org) => {
          const b = await svc.board(org.id);
          let rows = applyFilter(b, input);
          if (input.trang_thai?.length) rows = rows.filter((c) => input.trang_thai!.includes(c.status));
          else if (!input.gom_da_phat) rows = rows.filter((c) => c.status !== 'da-phat');
          if (input.sap_xep === 'ngay_phat')
            rows.sort((x, y) => (x.publishDate || '9999').localeCompare(y.publishDate || '9999') || codeSort(x, y));
          else if (input.sap_xep === 'cap_nhat')
            rows.sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
          else rows.sort(codeSort);
          const lim = input.gioi_han || 50;
          return {
            tong: rows.length,
            the: rows.slice(0, lim).map((c) => cardOut(b, c)),
            ...(rows.length > lim ? { con_nua: rows.length - lim } : {}),
          };
        },
      }),

      media_board_xem_the: hubTool({
        id: 'media_board_xem_the',
        title: 'Bảng sản xuất Media — xem một thẻ',
        level: 'doc',
        description:
          'Toàn bộ một thẻ: dữ liệu, hạn quay/dựng, cảnh báo, bản cắt đã có / còn thiếu, sức chứa buổi dựng của ngày xong dựng, gợi ý "Điền lịch theo hạn", và bước kế tiếp đang bị chặn bởi điều kiện gì.',
        input: z.object({ the: REF }),
        run: async (input, org) => {
          const b = await svc.board(org.id);
          const c = svc.findCard(b, input.the);
          const i = SIDX[c.status];
          const next = c.status === 'cho-duyet' ? 'len-lich' : i < STATUSES.length - 1 ? STATUSES[i + 1].id : null;
          const max = b.config.maxLongPerSlot || 2;
          const fill = fillByDeadline(b, c);
          return {
            the: cardOut(b, c, true),
            ban_cat_da_co: b.childrenOf(c).map((k) => ({ ...brief(k), kenh: k.channel || null, trang_thai: statusName(k.status) })),
            suc_chua_ngay_xong_dung:
              c.format === 'dai' && c.editEnd
                ? {
                    ngay: c.editEnd,
                    tinh_cho: b.config.limitScope === 'team' ? 'cả team' : c.assignee || '(chưa gán)',
                    sang: `${b.longEditsOn(c.editEnd, c.assignee, c.id, 'sang').length}/${max}`,
                    chieu: `${b.longEditsOn(c.editEnd, c.assignee, c.id, 'chieu').length}/${max}`,
                  }
                : undefined,
            goi_y_dien_lich_theo_han:
              fill && (!c.shootDate || !c.editStart || !c.editEnd)
                ? { ngay_quay: fill.shootDate, bat_dau_dung: fill.editStart, xong_dung: fill.editEnd }
                : undefined,
            buoc_ke_tiep: next
              ? {
                  trang_thai: next,
                  ten: statusName(next),
                  chan_boi: checkStage(c, next) || (next === 'dang-dung' ? b.checkCapacity(c) : '') || null,
                }
              : null,
          };
        },
      }),

      media_board_lich_dung: hubTool({
        id: 'media_board_lich_dung',
        title: 'Bảng sản xuất Media — lịch dựng',
        level: 'doc',
        description:
          'Lịch dựng theo ngày × người dựng (hoặc cả team) × buổi sáng/chiều, tính theo NGÀY + BUỔI HOÀN THÀNH dựng của video dài: số đã xếp / tối đa, chỗ trống, video chưa chọn buổi, đang dựng dở, video ngắn; kèm video đã quay nhưng chưa xếp lịch dựng. Muốn xếp: media_board_sua_the với xong_dung + buoi_xong_dung.',
        input: z.object({
          tu_ngay: DATE.optional().describe('Mặc định hôm nay'),
          so_ngay: z.number().int().min(1).max(31).optional().describe('Mặc định 14'),
          nguoi: z.string().optional().describe('Chỉ xem một người dựng'),
          luong: filterInput.luong,
          dinh_dang: filterInput.dinh_dang,
        }),
        run: async (input, org) => {
          const b = await svc.board(org.id);
          const list = applyFilter(b, { luong: input.luong, dinh_dang: input.dinh_dang, nguoi: input.nguoi });
          const cal = calendarData(b, list, input.tu_ngay || today(), input.so_ngay || 14);
          const slot = (xs: MediaCard[]) => ({
            da_xep: xs.length,
            toi_da: cal.max,
            con_trong: Math.max(0, cal.max - xs.length),
            ...(xs.length > cal.max ? { vuot: true } : {}),
            video: xs.map(brief),
          });
          return {
            tinh_cho: cal.team ? 'cả team' : 'từng người dựng',
            toi_da_video_dai_moi_buoi: cal.max,
            nguoi_dung: cal.editors,
            ngay: cal.days.map((d) => ({
              ngay: d.date,
              thu: fmt(d.date),
              ...(d.isToday ? { hom_nay: true } : {}),
              o: d.cells
                .filter((cell) => !input.nguoi || cell.editor === input.nguoi || cal.team)
                .map((cell) => ({
                  nguoi: cell.editor,
                  sang: slot(cell.slots.sang),
                  chieu: slot(cell.slots.chieu),
                  ...(cell.noSlot.length ? { video_dai_chua_chon_buoi: cell.noSlot.map(brief) } : {}),
                  ...(cell.ongoing.length
                    ? { dang_dung_do: cell.ongoing.map((c) => ({ ...brief(c), xong_dung: c.editEnd })) }
                    : {}),
                  ...(cell.shorts.length ? { video_ngan: cell.shorts.map(brief) } : {}),
                })),
            })),
            da_quay_chua_xep_lich_dung: cal.backlog.map((c) => ({ ...brief(c), nguoi_phu_trach: c.assignee || null, han_dung_xong: b.deadlines(c).editBy || null })),
          };
        },
      }),

      media_board_luong: hubTool({
        id: 'media_board_luong',
        title: 'Bảng sản xuất Media — sức khoẻ từng luồng',
        level: 'doc',
        description:
          'Từng luồng nội dung: mã, nhóm kênh, chủ luồng, người duyệt, mục tiêu, kênh chính/phụ, nhịp cam kết và kiểm nhịp (số video đã lên lịch trong cửa sổ tới so với cam kết), phát gần nhất / kế tiếp, số tập theo cột, cảnh báo. Kèm luồng có trên thẻ mà chưa khai báo trong cài đặt.',
        input: z.object({}),
        run: async (_input, org) => {
          const b = await svc.board(org.id);
          const loose = [...new Set(b.cards.map((c) => c.stream).filter((n): n is string => !!n && !b.streamOf(n)))];
          return {
            luong: b.streamHealth().map((s) => ({
              ten: s.name,
              ma: s.code || null,
              nhom_kenh: s.group || null,
              chu_luong: s.owner || null,
              nguoi_duyet: s.reviewer || null,
              muc_tieu: s.goal || null,
              kenh_chinh: s.channel || null,
              kenh_phu: splitList(s.subChannels),
              chuyen_muc: s.subseries || [],
              nhip_cam_ket: cadText(s),
              kiem_nhip: s.checks.map((k) => ({
                viec: k.label,
                can: k.need,
                da_len_lich: k.got,
                trong_so_ngay_toi: k.windowDays,
                dat: k.ok,
              })),
              phat_gan_nhat: s.lastPub || null,
              phat_ke_tiep: s.upcoming[0]
                ? { ngay: s.upcoming[0].publishDate, ...brief(s.upcoming[0]) }
                : null,
              tong_tap: s.mine.length,
              theo_cot: Object.fromEntries(STATUSES.map((x) => [x.id, s.counts[x.id]])),
              canh_bao: [
                ...s.issues.map(([m, t]) => `${m === 'red' ? '[đỏ]' : '[vàng]'} ${t}`),
                ...(s.counts['da-quay'] ? [`[vàng] ${s.counts['da-quay']} video đã quay đang chờ dựng`] : []),
              ],
            })),
            luong_chua_khai_bao: loose,
          };
        },
      }),

      media_board_xuat_csv: hubTool({
        id: 'media_board_xuat_csv',
        title: 'Bảng sản xuất Media — xuất CSV',
        level: 'doc',
        description:
          'Xuất CSV như nút "Tải CSV" (mọi cột, cùng bộ lọc). Trả từng trang các dòng CSV (dòng đầu là tiêu đề cột ở trang 1); ghép các trang theo thứ tự để có file đầy đủ.',
        input: z.object({
          ...filterInput,
          trang: z.number().int().min(1).optional().describe('Mặc định 1; mỗi trang 90 dòng'),
        }),
        run: async (input, org) => {
          const b = await svc.board(org.id);
          const lines = buildCsv(b, applyFilter(b, input)).slice(1).split('\n'); // bỏ ký tự BOM đầu file CSV
          const per = 90;
          const pages = Math.max(1, Math.ceil(lines.length / per));
          const p = Math.min(input.trang || 1, pages);
          return {
            ten_file: `bang-san-xuat-media-${today()}.csv`,
            tong_dong: lines.length,
            trang: p,
            so_trang: pages,
            dong: lines.slice((p - 1) * per, p * per),
          };
        },
      }),

      media_board_tao_the: hubTool({
        id: 'media_board_tao_the',
        title: 'Bảng sản xuất Media — thêm video',
        level: 'nhap',
        description:
          'Thêm thẻ video như nút "+ Thêm video". Bắt buộc tieu_de và ngay_phat_hanh. Hub kiểm như khi bấm Lưu: thứ tự ngày, link https, mã tập không trùng, điều kiện cột (vd Chờ quay cần ngày quay), tối đa video dài/buổi; tự đánh mã tập theo luồng. dien_lich_theo_han=true điền ngày quay/dựng còn trống theo hạn. Tạo thẳng vào "Lên lịch phát"/"Đã phát hành" cần quyền "được đăng".',
        input: z.object({
          ...cardFields,
          dien_lich_theo_han: z.boolean().optional().describe('Nút "Điền lịch theo hạn": điền ngày quay / bắt đầu dựng / xong dựng còn trống'),
        }),
        run: async (input, org) => {
          const saved = await svc.saveCard(org.id, null, toCardFields(input), {
            fillSchedule: input.dien_lich_theo_han,
            canApprove: hasLevel(org, 'dang'),
          });
          const b = await svc.board(org.id);
          return { ok: true, the: cardOut(b, svc.findCard(b, saved.id), true) };
        },
      }),

      media_board_sua_the: hubTool({
        id: 'media_board_sua_the',
        title: 'Bảng sản xuất Media — sửa thẻ',
        level: 'nhap',
        description:
          'Sửa một thẻ: chỉ truyền các ô cần đổi (chuỗi rỗng để xoá ô). Kiểm như khi bấm Lưu trong editor; trạng thái tự chuyển tới khi đủ dữ liệu. Xếp lịch dựng: xong_dung + buoi_xong_dung. Đưa thẻ vào "Lên lịch phát"/"Đã phát hành" lần đầu = duyệt → cần quyền "được đăng".',
        input: z.object({
          the: REF,
          ...cardFields,
          dien_lich_theo_han: z.boolean().optional().describe('Điền ngày quay / bắt đầu dựng / xong dựng còn trống theo hạn'),
        }),
        run: async (input, org) => {
          const { the, dien_lich_theo_han, ...rest } = input;
          const changes = toCardFields(rest);
          if (!Object.keys(changes).length && !dien_lich_theo_han) {
            return { loi: 'Chưa có ô nào để sửa.' };
          }
          const saved = await svc.saveCard(org.id, the, changes, {
            fillSchedule: dien_lich_theo_han,
            canApprove: hasLevel(org, 'dang'),
          });
          const b = await svc.board(org.id);
          return { ok: true, the: cardOut(b, svc.findCard(b, saved.id), true) };
        },
      }),

      media_board_chuyen_trang_thai: hubTool({
        id: 'media_board_chuyen_trang_thai',
        title: 'Bảng sản xuất Media — chuyển cột',
        level: 'nhap',
        description:
          'Chuyển thẻ sang cột khác như kéo–thả. Bỏ trống trang_thai = bước kế tiếp (nút "→"). Đi tới bị chặn nếu thiếu điều kiện cột đích (Chờ quay cần ngày quay; Đang dựng cần ngày bắt đầu + xong dựng và còn chỗ trong buổi; Chờ duyệt cần link file dựng; Lên lịch phát cần ngày phát; Đã phát hành cần URL bài đăng). Sang "Lên lịch phát"/"Đã phát hành" lần đầu = duyệt → cần quyền "được đăng".',
        input: z.object({
          the: REF,
          trang_thai: z.enum(STATUS_IDS).optional().describe('Cột đích; bỏ trống = bước kế tiếp'),
        }),
        run: async (input, org) => {
          await svc.moveCard(org.id, input.the, input.trang_thai, hasLevel(org, 'dang'));
          const b = await svc.board(org.id);
          return { ok: true, the: cardOut(b, svc.findCard(b, input.the)) };
        },
      }),

      media_board_duyet: hubTool({
        id: 'media_board_duyet',
        title: 'Bảng sản xuất Media — duyệt video',
        level: 'dang',
        description:
          'Nút "Duyệt ✓": chuyển thẻ đang "Chờ duyệt" sang "Lên lịch phát" và ghi thời điểm duyệt. Không đăng gì ra ngoài.',
        input: z.object({ the: REF }),
        run: async (input, org) => {
          const b0 = await svc.board(org.id);
          const c = svc.findCard(b0, input.the);
          if (c.status !== 'cho-duyet') {
            return { loi: `Thẻ đang ở “${statusName(c.status)}”, không ở “Chờ duyệt”.` };
          }
          await svc.moveCard(org.id, c.id, 'len-lich', true);
          const b = await svc.board(org.id);
          return { ok: true, the: cardOut(b, svc.findCard(b, c.id)) };
        },
      }),

      media_board_tao_ban_cat: hubTool({
        id: 'media_board_tao_ban_cat',
        title: 'Bảng sản xuất Media — tạo bản cắt',
        level: 'nhap',
        description:
          'Nút "+ Tạo bản cắt": từ video gốc (cần có mã tập) tạo thẻ Shorts/Reels cho một kênh phụ — mặc định kênh phụ đầu tiên còn thiếu; mã <mã gốc>-C<n>, phát sau bản gốc 1 ngày, kế thừa người/luồng/ngày quay. Truyền thêm ô nào để ghi đè ô đó.',
        input: z.object({
          the: REF.describe('id hoặc mã tập của video GỐC'),
          kenh: z.string().optional().describe('Kênh phụ của bản cắt; bỏ trống = kênh đầu tiên còn thiếu'),
          ...cardFields,
        }),
        run: async (input, org) => {
          const { the, kenh, ...rest } = input;
          const saved = await svc.makeCut(org.id, the, kenh, toCardFields(rest), hasLevel(org, 'dang'));
          const b = await svc.board(org.id);
          return { ok: true, the: cardOut(b, svc.findCard(b, saved.id), true) };
        },
      }),

      media_board_tao_tap_cung_buoi: hubTool({
        id: 'media_board_tao_tap_cung_buoi',
        title: 'Bảng sản xuất Media — tập khác cùng buổi quay',
        level: 'nhap',
        description:
          'Nút "+ Tập khác cùng buổi quay": tạo tập mới cùng luồng, người, ngày/giờ quay với thẻ đã chọn, mã tập kế tiếp của luồng. Cần tieu_de và ngay_phat_hanh.',
        input: z.object({ the: REF, ...cardFields }),
        run: async (input, org) => {
          const { the, ...rest } = input;
          const saved = await svc.makeSibling(org.id, the, toCardFields(rest), hasLevel(org, 'dang'));
          const b = await svc.board(org.id);
          return { ok: true, the: cardOut(b, svc.findCard(b, saved.id), true) };
        },
      }),

      media_board_xoa_the: hubTool({
        id: 'media_board_xoa_the',
        title: 'Bảng sản xuất Media — xoá thẻ',
        level: 'dang',
        destructive: true,
        description: 'Xoá hẳn một thẻ video khỏi bảng (không khôi phục được). Bản cắt của nó không bị xoá theo.',
        input: z.object({ the: REF }),
        run: async (input, org) => {
          const b = await svc.board(org.id);
          const c = svc.findCard(b, input.the);
          await svc.deleteVideo(org.id, c.id);
          return { ok: true, da_xoa: brief(c) };
        },
      }),

      media_board_cau_hinh: hubTool({
        id: 'media_board_cau_hinh',
        title: 'Bảng sản xuất Media — cài đặt',
        level: 'doc',
        description:
          'Cài đặt luồng & quy tắc: các luồng nội dung (tên, mã, nhóm kênh, chủ luồng, người duyệt, mục tiêu, kênh chính/phụ, nhịp phát/quay mỗi tuần, chuyên mục), thành viên team và các quy tắc (tối đa video dài/buổi, tính cho người hay cả team, số ngày dựng xong/quay trước ngày phát, nhắc xếp lịch, ngưỡng tồn kho, hạn duyệt).',
        input: z.object({}),
        run: async (_input, org) => {
          const b = await svc.board(org.id);
          const c = b.config;
          return {
            luong: c.streams.map((s) => ({
              ten: s.name,
              ma: s.code || null,
              nhom_kenh: s.group || null,
              chu_luong: s.owner || null,
              nguoi_duyet: s.reviewer || null,
              muc_tieu: s.goal || null,
              kenh_chinh: s.channel || null,
              kenh_phu: splitList(s.subChannels),
              phat_dai_moi_tuan: s.pubLong ?? null,
              phat_ngan_moi_tuan: s.pubShort ?? null,
              quay_moi_tuan: s.shootPerWeek ?? null,
              chuyen_muc: s.subseries || [],
            })),
            thanh_vien: c.people,
            moi_nguoi_tren_bang: b.peopleList(),
            toi_da_video_dai_moi_buoi: c.maxLongPerSlot,
            gioi_han_tinh_cho: c.limitScope === 'team' ? 'team' : 'nguoi',
            dung_xong_truoc_ngay_phat: c.editLeadDays,
            quay_truoc_ngay_phat: c.shootLeadDays,
            nhac_xep_lich_dung_khi_con_ngay: c.scheduleWarnDays,
            canh_bao_ton_kho_moi_nguoi: c.maxBacklogPerPerson,
            han_duyet_gio: c.reviewHours,
            quy_tac: rulesText(c),
          };
        },
      }),

      media_board_cau_hinh_sua: hubTool({
        id: 'media_board_cau_hinh_sua',
        title: 'Bảng sản xuất Media — sửa cài đặt',
        level: 'dang',
        description:
          'Sửa cài đặt luồng & quy tắc: chỉ truyền phần cần đổi. luong_luu thêm luồng mới hoặc sửa luồng có cùng tên (ten_cu để đổi tên — thẻ đang gắn tên cũ KHÔNG tự đổi theo). luong_xoa xoá luồng theo tên. thanh_vien thay cả danh sách.',
        input: z.object({
          luong_luu: z
            .array(
              z.object({
                ten: z.string().describe('Tên luồng'),
                ten_cu: z.string().optional().describe('Tên hiện tại nếu muốn đổi tên'),
                ma: z.string().optional().describe('Mã luồng dùng đánh mã tập, vd 66N'),
                nhom_kenh: z.enum(['Founder', 'Official', '']).optional(),
                chu_luong: z.string().optional(),
                nguoi_duyet: z.string().optional(),
                muc_tieu: z.string().optional(),
                kenh_chinh: z.string().optional(),
                kenh_phu: z.array(z.string()).optional(),
                phat_dai_moi_tuan: z.number().min(0).nullable().optional().describe('0.5 = 1 video dài/2 tuần'),
                phat_ngan_moi_tuan: z.number().min(0).nullable().optional(),
                quay_moi_tuan: z.number().min(0).nullable().optional(),
                chuyen_muc: z.array(z.string()).optional(),
              })
            )
            .optional(),
          luong_xoa: z.array(z.string()).optional().describe('Tên các luồng cần xoá'),
          thanh_vien: z.array(z.string()).optional().describe('Thay cả danh sách thành viên team'),
          toi_da_video_dai_moi_buoi: z.number().int().min(1).max(4).optional(),
          gioi_han_tinh_cho: z.enum(['nguoi', 'team']).optional(),
          dung_xong_truoc_ngay_phat: z.number().int().min(0).max(14).optional(),
          quay_truoc_ngay_phat: z.number().int().min(0).max(30).optional(),
          nhac_xep_lich_dung_khi_con_ngay: z.number().int().min(0).max(14).optional(),
          canh_bao_ton_kho_moi_nguoi: z.number().int().min(0).max(200).optional().describe('0 = không giới hạn'),
          han_duyet_gio: z.number().int().min(1).max(96).optional(),
        }),
        run: async (input, org) => {
          const rules: Record<string, any> = {};
          const map: [string, string][] = [
            ['toi_da_video_dai_moi_buoi', 'maxLongPerSlot'],
            ['gioi_han_tinh_cho', 'limitScope'],
            ['dung_xong_truoc_ngay_phat', 'editLeadDays'],
            ['quay_truoc_ngay_phat', 'shootLeadDays'],
            ['nhac_xep_lich_dung_khi_con_ngay', 'scheduleWarnDays'],
            ['canh_bao_ton_kho_moi_nguoi', 'maxBacklogPerPerson'],
            ['han_duyet_gio', 'reviewHours'],
          ];
          for (const [vi, k] of map) if ((input as any)[vi] !== undefined) rules[k] = (input as any)[vi];
          const next = await svc.updateConfig(org.id, {
            rules,
            people: input.thanh_vien,
            removeStreams: input.luong_xoa,
            upsertStreams: (input.luong_luu || []).map((s) => ({
              oldName: s.ten_cu,
              name: s.ten,
              code: s.ma,
              group: s.nhom_kenh,
              owner: s.chu_luong,
              reviewer: s.nguoi_duyet,
              goal: s.muc_tieu,
              channel: s.kenh_chinh,
              subChannels: s.kenh_phu,
              pubLong: s.phat_dai_moi_tuan,
              pubShort: s.phat_ngan_moi_tuan,
              shootPerWeek: s.quay_moi_tuan,
              subseries: s.chuyen_muc,
            })),
          });
          return {
            ok: true,
            luong: next.streams.map((s) => s.name),
            thanh_vien: next.people,
            quy_tac: rulesText(next),
          };
        },
      }),
    };
  }
}
