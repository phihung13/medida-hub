import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaBoardRepository } from '@gitroom/nestjs-libraries/database/prisma/media-board/media-board.repository';
import {
  Board,
  LONG_MIN,
  MediaCard,
  MediaConfig,
  MediaStream,
  SIDX,
  STATUSES,
  applyStreamDefaults,
  createBoard,
  cutPreset,
  fillByDeadline,
  mergeConfig,
  normalizeCard,
  normalizeCardInput,
  prepareCardSave,
  prepareMove,
  sanitizeConfig,
  sanitizeStream,
  siblingPreset,
} from '@gitroom/helpers/utils/media-board.logic';

// Thẻ video lưu nguyên khối trong cột Json `data`; `status` được nhân ra cột
// riêng để lọc. Client luôn nhận thẻ phẳng dạng {id, ...data}.
const DEFAULT_STATUS = 'kich-ban';

const clean = (body: Record<string, any>) => {
  const { id, organizationId, ...rest } = body || {};
  return rest;
};

const toCard = (row: { id: string; status: string; data: any }) => ({
  ...(row.data || {}),
  id: row.id,
  status: row.status,
});

// Đưa thẻ LẦN ĐẦU vào "Lên lịch phát" trở đi = duyệt (từ Chờ duyệt, hoặc nhảy
// cóc từ cột trước) — công cụ MCP đòi quyền "được đăng" cho bước này.
export const isApproval = (from: string | undefined, to: string) =>
  SIDX[to] >= SIDX['len-lich'] && (from === undefined || !(SIDX[from] >= SIDX['len-lich']));

const APPROVE_DENIED =
  'Đưa thẻ vào “Lên lịch phát”/“Đã phát hành” là bước DUYỆT — cần khoá MCP quyền "được đăng". Để thẻ ở “Chờ duyệt” cho người duyệt xử lý.';

export interface StreamUpsert extends Partial<MediaStream> {
  oldName?: string;
}

@Injectable()
export class MediaBoardService {
  constructor(private _repository: MediaBoardRepository) {}

  async getConfig(orgId: string) {
    const row = await this._repository.getConfig(orgId);
    return (row?.data as Record<string, any>) || {};
  }

  async saveConfig(orgId: string, data: Record<string, any>) {
    const row = await this._repository.saveConfig(orgId, clean(data));
    return row.data;
  }

  async listVideos(orgId: string) {
    return (await this._repository.listVideos(orgId)).map(toCard);
  }

  async createVideo(orgId: string, body: Record<string, any>) {
    const data = clean(body);
    const status = String(data.status || DEFAULT_STATUS);
    return toCard(
      await this._repository.createVideo(orgId, status, { ...data, status })
    );
  }

  // Thay cả thẻ (giống set() của bản gốc).
  async setVideo(orgId: string, id: string, body: Record<string, any>) {
    const data = clean(body);
    const status = String(data.status || DEFAULT_STATUS);
    if (!(await this._repository.updateVideo(orgId, id, status, { ...data, status }))) {
      throw new NotFoundException();
    }
    return { ...data, id, status };
  }

  // Gộp trường cấp 1 vào thẻ cũ (giống update() của bản gốc) — dùng khi kéo–thả.
  async patchVideo(orgId: string, id: string, patch: Record<string, any>) {
    const row = await this._repository.getVideo(orgId, id);
    if (!row) {
      throw new NotFoundException();
    }
    const data = { ...((row.data as Record<string, any>) || {}), ...clean(patch) };
    const status = String(data.status || row.status || DEFAULT_STATUS);
    if (!(await this._repository.updateVideo(orgId, id, status, { ...data, status }))) {
      throw new NotFoundException();
    }
    return { ...data, id, status };
  }

  async deleteVideo(orgId: string, id: string) {
    if (!(await this._repository.deleteVideo(orgId, id))) {
      throw new NotFoundException();
    }
    return { id };
  }

  /* ==========================================================================
   *  Thao tác mức cao cho công cụ MCP — đi qua ĐÚNG các luật của giao diện
   *  (logic dùng chung @gitroom/helpers/utils/media-board.logic).
   * ======================================================================== */

  async board(orgId: string): Promise<Board> {
    const [cards, config] = await Promise.all([
      this.listVideos(orgId),
      this.getConfig(orgId),
    ]);
    return createBoard(
      (cards as MediaCard[]).map(normalizeCard),
      mergeConfig(config as Partial<MediaConfig>)
    );
  }

  // Tìm thẻ theo id hoặc mã tập (không phân biệt hoa thường).
  findCard(board: Board, ref: string) {
    const key = String(ref || '').trim();
    const c =
      board.cards.find((x) => x.id === key) ||
      board.cards.find((x) => (x.episode || '').toUpperCase() === key.toUpperCase());
    if (!key || !c) {
      throw new NotFoundException(`Không tìm thấy thẻ “${key}” (truyền id hoặc mã tập).`);
    }
    return c;
  }

  // Thêm mới (ref = null) hoặc sửa một phần thẻ — như mở editor, đổi các ô
  // được truyền, bấm Lưu. Chọn luồng → điền ô trống theo luồng; gõ thời lượng
  // → tự chọn dài/ngắn; fillSchedule = nút "Điền lịch theo hạn".
  async saveCard(
    orgId: string,
    ref: string | null,
    changes: Partial<MediaCard>,
    opts: { fillSchedule?: boolean; canApprove?: boolean } = {}
  ) {
    const board = await this.board(orgId);
    const base = ref ? this.findCard(board, ref) : null;
    let d: Partial<MediaCard> = {
      ...(base || { format: 'dai', status: DEFAULT_STATUS }),
      ...changes,
    };
    if (changes.duration !== undefined && changes.format === undefined) {
      const n = parseFloat(String(changes.duration));
      if (!isNaN(n)) d.format = n > LONG_MIN ? 'dai' : 'ngan';
    }
    if (d.stream && d.stream !== base?.stream) {
      d = applyStreamDefaults(board, d);
    }
    if (opts.fillSchedule) {
      const r = fillByDeadline(board, d);
      if (!r) {
        throw new BadRequestException('Cần có ngày phát hành để điền lịch theo hạn.');
      }
      d = { ...d, ...r };
    }
    const r = prepareCardSave(board, base, normalizeCardInput(d));
    if (r.error) {
      throw new BadRequestException(r.error);
    }
    if (isApproval(base?.status, r.card.status as string) && !opts.canApprove) {
      throw new ForbiddenException(APPROVE_DENIED);
    }
    return base
      ? this.setVideo(orgId, base.id, r.card)
      : this.createVideo(orgId, r.card);
  }

  // Kéo thẻ sang cột khác. Không truyền status = bước kế tiếp (nút "→"),
  // riêng thẻ "Chờ duyệt" thì là duyệt (nút "Duyệt ✓").
  async moveCard(orgId: string, ref: string, status: string | undefined, canApprove: boolean) {
    const board = await this.board(orgId);
    const c = this.findCard(board, ref);
    let target = status;
    if (!target) {
      const i = SIDX[c.status];
      if (c.status === 'cho-duyet') target = 'len-lich';
      else if (i === undefined || i >= STATUSES.length - 1) {
        throw new BadRequestException('Thẻ đã ở bước cuối “Đã phát hành”.');
      } else target = STATUSES[i + 1].id;
    }
    if (SIDX[target] === undefined) {
      throw new BadRequestException(`Trạng thái “${target}” không có. Dùng: ${STATUSES.map((s) => s.id).join(', ')}.`);
    }
    if (target === c.status) {
      throw new BadRequestException(`Thẻ đang ở “${STATUSES[SIDX[target]].name}” rồi.`);
    }
    if (isApproval(c.status, target) && !canApprove) {
      throw new ForbiddenException(APPROVE_DENIED);
    }
    const r = prepareMove(board, c, target);
    if (r.error) {
      throw new BadRequestException(`${r.error} Bổ sung bằng media_board_sua_the rồi chuyển lại.`);
    }
    return this.patchVideo(orgId, c.id, r.patch);
  }

  // "+ Tạo bản cắt" rồi Lưu ngay (có thể ghi đè các ô của thẻ bản cắt).
  async makeCut(
    orgId: string,
    ref: string,
    channel: string | undefined,
    overrides: Partial<MediaCard>,
    canApprove: boolean
  ) {
    const board = await this.board(orgId);
    const base = this.findCard(board, ref);
    if (base.parentCode) {
      throw new BadRequestException('Thẻ này đã là bản cắt — chọn thẻ video gốc.');
    }
    const r = cutPreset(board, base, normalizeCardInput(base), channel);
    if (r.error) {
      throw new BadRequestException(r.error);
    }
    return this.saveCard(orgId, null, { ...r.preset, ...overrides }, { canApprove });
  }

  // "+ Tập khác cùng buổi quay" rồi Lưu ngay (cần tiêu đề + ngày phát hành).
  async makeSibling(orgId: string, ref: string, overrides: Partial<MediaCard>, canApprove: boolean) {
    const board = await this.board(orgId);
    const base = this.findCard(board, ref);
    const preset = siblingPreset(board, base, normalizeCardInput(base));
    return this.saveCard(orgId, null, { ...preset, ...overrides }, { canApprove });
  }

  // Sửa cài đặt từng phần: quy tắc, thành viên, thêm/sửa/đổi tên/xoá luồng.
  async updateConfig(
    orgId: string,
    patch: {
      rules?: Partial<MediaConfig>;
      people?: string[];
      upsertStreams?: StreamUpsert[];
      removeStreams?: string[];
    }
  ) {
    const cur = mergeConfig((await this.getConfig(orgId)) as Partial<MediaConfig>);
    const streams = [...cur.streams];
    const idx = (name: string) =>
      streams.findIndex((s) => s.name.toLowerCase() === String(name || '').trim().toLowerCase());
    for (const name of patch.removeStreams || []) {
      const i = idx(name);
      if (i < 0) throw new BadRequestException(`Không có luồng “${name}”.`);
      streams.splice(i, 1);
    }
    for (const s of patch.upsertStreams || []) {
      const { oldName, ...fields } = s;
      const i = idx(oldName || fields.name || '');
      if (oldName && i < 0) throw new BadRequestException(`Không có luồng “${oldName}” để sửa.`);
      const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const next = sanitizeStream(i >= 0 ? { ...streams[i], ...defined } : defined);
      if (!next.name) throw new BadRequestException('Luồng cần có tên.');
      if (i >= 0) streams[i] = next;
      else streams.push(next);
    }
    const names = streams.map((s) => s.name.toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) throw new BadRequestException(`Trùng tên luồng “${dup}”.`);
    const next = sanitizeConfig({
      ...cur,
      ...(patch.rules || {}),
      streams,
      people: patch.people ?? cur.people,
    });
    await this.saveConfig(orgId, next);
    return next;
  }
}
