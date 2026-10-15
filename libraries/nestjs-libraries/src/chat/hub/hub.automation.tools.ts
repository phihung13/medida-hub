import { Injectable, ValidationPipe } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { BulkImportService } from '@gitroom/nestjs-libraries/database/prisma/content/bulk-import.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ThirdPartyManager } from '@gitroom/nestjs-libraries/3rdparties/thirdparty.manager';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  hubTool,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Tự động hoá": webhook (báo ra ngoài khi bài đăng xong), thử nguồn
//  RSS, xoá file Excel đã nhập, tích hợp bên thứ ba (HeyGen, Reel.Farm…) và
//  so sánh số liệu kênh giữa hai kỳ / hai kênh.
// ============================================================================

// Hàm của nhà cung cấp bên thứ ba KHÔNG cho gọi trực tiếp qua MCP:
// checkConnection (lưu khoá), sendData (luồng "submit" tương tác, tạo video
// tốn phí), importMedia (đã có công cụ riêng, kèm kiểm tra link).
const BLOCKED_FUNCTIONS = new Set([
  'constructor',
  'checkConnection',
  'sendData',
  'importMedia',
]);

const days = z
  .number()
  .int()
  .min(7)
  .max(90)
  .default(30)
  .describe('Số ngày của MỘT kỳ (7 / 30 / 90)');

type Metric = { label: string; data?: { total: string | number; date: string }[] };

const sumOf = (pts: { total: any }[]) =>
  pts.reduce((s, p) => s + (Number(p.total) || 0), 0);

const pct = (cur: number, prev: number) =>
  prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null;

const webhookView = (w: any) => ({
  id: w.id,
  ten: w.name,
  url: w.url,
  kenh: (w.integrations || []).map((i: any) => ({
    id: i.integration?.id,
    ten: i.integration?.name,
  })),
});

@Injectable()
export class HubAutomationTools implements HubToolGroup {
  private _storage = UploadFactory.createStorage();

  constructor(
    private _webhooksService: WebhooksService,
    private _autopostService: AutopostService,
    private _bulkImportService: BulkImportService,
    private _integrationService: IntegrationService,
    private _mediaService: MediaService,
    private _thirdPartyManager: ThirdPartyManager
  ) {}

  private async toWebhookDto(input: any) {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    });
    return (await pipe.transform(input, {
      type: 'body',
      metatype: WebhooksDto,
    })) as WebhooksDto;
  }

  private async assertOwnChannels(org: HubOrg, ids: string[]) {
    for (const id of ids) {
      const it = await this._integrationService.getIntegrationById(org.id, id);
      if (!it || (it as any).deletedAt) {
        throw new HubToolError(`Không tìm thấy kênh ${id}.`);
      }
    }
  }

  private async thirdParty(org: HubOrg, id: string) {
    const row = await this._thirdPartyManager.getIntegrationById(org.id, id);
    if (!row) throw new HubToolError('Không tìm thấy tích hợp bên thứ ba này.');
    let inst: any;
    try {
      inst = this._thirdPartyManager.getThirdPartyByName(row.identifier);
    } catch {
      inst = undefined;
    }
    if (!inst?.instance) throw new HubToolError('Nhà cung cấp không còn hỗ trợ.');
    return { row, inst };
  }

  private async metricTotals(org: HubOrg, channel: string, n: number) {
    const data = (await this._integrationService.checkAnalytics(
      org,
      channel,
      String(n)
    )) as Metric[];
    return Array.isArray(data) ? data : [];
  }

  tools(): HubToolMap {
    return {
      // ── WEBHOOK ──────────────────────────────────────────────────────────
      hub_webhook_danh_sach: hubTool({
        id: 'hub_webhook_danh_sach',
        title: 'Danh sách webhook',
        level: 'doc',
        description:
          'Webhook của tổ chức: tên, URL nhận, các kênh mà khi bài đăng xong sẽ gọi webhook.',
        input: z.object({}),
        run: async (_i, org) =>
          ((await this._webhooksService.getWebhooks(org.id)) as any[]).map(
            webhookView
          ),
      }),

      hub_webhook_luu: hubTool({
        id: 'hub_webhook_luu',
        title: 'Thêm / sửa webhook',
        level: 'dang',
        openWorld: true,
        description:
          'Thêm webhook mới (bỏ trống id) hoặc sửa webhook có sẵn (truyền id — THAY toàn bộ tên, URL và danh sách kênh). Mỗi khi bài của các kênh này đăng xong, Hub GỬI dữ liệu bài tới URL.',
        input: z.object({
          id: z.string().optional(),
          ten: z.string().min(1).max(200),
          url: z.string().url().describe('URL https công khai'),
          kenh: z.array(z.string()).min(1).describe('id kênh Media Hub'),
        }),
        run: async (input, org) => {
          if (input.id) {
            const own = ((await this._webhooksService.getWebhooks(org.id)) as any[]).some(
              (w) => w.id === input.id
            );
            if (!own) throw new HubToolError('Không tìm thấy webhook này.');
          }
          await this.assertOwnChannels(org, input.kenh);
          const dto = await this.toWebhookDto({
            ...(input.id ? { id: input.id } : {}),
            name: input.ten,
            url: input.url,
            integrations: input.kenh.map((id) => ({ id })),
          });
          if (input.id) dto.id = input.id;
          const res = await this._webhooksService.createWebhook(org.id, dto);
          return { ok: true, id: res.id };
        },
      }),

      hub_webhook_xoa: hubTool({
        id: 'hub_webhook_xoa',
        title: 'Xoá webhook',
        level: 'dang',
        destructive: true,
        description: 'Xoá một webhook (ngừng gửi dữ liệu bài tới URL đó).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const own = ((await this._webhooksService.getWebhooks(org.id)) as any[]).some(
            (w) => w.id === input.id
          );
          if (!own) throw new HubToolError('Không tìm thấy webhook này.');
          await this._webhooksService.deleteWebhook(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_webhook_thu: hubTool({
        id: 'hub_webhook_thu',
        title: 'Gửi thử webhook',
        level: 'dang',
        openWorld: true,
        description:
          'GỬI THẬT một gói dữ liệu MẪU (2 bài giả, đúng dạng Hub gửi khi bài đăng xong) tới một URL webhook để kiểm tra phía nhận.',
        input: z.object({ url: z.string().url().describe('URL https công khai') }),
        run: async (input) => {
          if (!(await isSafePublicHttpsUrl(input.url))) {
            throw new HubToolError(
              'URL phải là https công khai, không trỏ vào mạng nội bộ.'
            );
          }
          const sample = [1, 2].map((n) => ({
            id: `mau-${n}`,
            content: `Bài mẫu số ${n} (gửi thử từ Media Hub)`,
            publishDate: new Date().toISOString(),
            releaseURL: `https://example.com/bai-mau-${n}`,
            state: 'PUBLISHED',
            integration: {
              id: `kenh-mau-${n}`,
              name: `Kênh mẫu ${n}`,
              providerIdentifier: n === 1 ? 'instagram' : 'facebook',
              picture: '',
              type: 'social',
            },
          }));
          try {
            const res = await fetch(input.url, {
              method: 'POST',
              body: JSON.stringify(sample),
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(15_000),
              // undici: chặn DNS trỏ về IP nội bộ lúc kết nối
              ...({ dispatcher: getSsrfSafeDispatcher() } as any),
            });
            return { ok: true, da_gui: true, ma_phan_hoi: res.status };
          } catch (e: any) {
            return { ok: false, da_gui: false, loi_ket_noi: e?.message || String(e) };
          }
        },
      }),

      // ── AUTOPOST / EXCEL ─────────────────────────────────────────────────
      hub_autopost_thu: hubTool({
        id: 'hub_autopost_thu',
        title: 'Thử đọc nguồn RSS',
        level: 'doc',
        openWorld: true,
        description:
          'Đọc thử một link RSS (không lưu, không đăng): trả bài mới nhất (ngày, link, mô tả) để biết nguồn có dùng được cho autopost không.',
        input: z.object({ url: z.string().url() }),
        run: async (input) => {
          if (!(await isSafePublicHttpsUrl(input.url))) {
            throw new HubToolError(
              'URL phải là https công khai, không trỏ vào mạng nội bộ.'
            );
          }
          return this._autopostService.loadXML(input.url);
        },
      }),

      hub_excel_xoa_file: hubTool({
        id: 'hub_excel_xoa_file',
        title: 'Xoá file lịch đăng đã nhập',
        level: 'dang',
        destructive: true,
        description:
          'Xoá một file Excel/CSV khỏi lịch sử nhập (hub_excel_lich_su). Bài đã lên lịch từ file không bị xoá.',
        input: z.object({ fileId: z.string() }),
        run: async (input, org) => {
          const f = await this._bulkImportService.getFile(org.id, input.fileId);
          if (!f) throw new HubToolError('Không tìm thấy file.');
          await this._bulkImportService.deleteFile(org.id, input.fileId);
          return { ok: true };
        },
      }),

      // ── TÍCH HỢP BÊN THỨ BA ──────────────────────────────────────────────
      hub_ben_thu_ba: hubTool({
        id: 'hub_ben_thu_ba',
        title: 'Tích hợp bên thứ ba',
        level: 'doc',
        description:
          'Các tích hợp bên thứ ba tổ chức đã kết nối (HeyGen, Reel.Farm…) kèm các hàm gọi được qua hub_ben_thu_ba_goi, và danh mục nhà cung cấp có thể kết nối (kết nối khoá API làm trong app).',
        input: z.object({}),
        run: async (_i, org) => {
          const saved = await this._thirdPartyManager.getAllThirdPartiesByOrganization(
            org.id
          );
          return {
            da_ket_noi: saved.map((t: any) => {
              let p: any;
              try {
                p = this._thirdPartyManager.getThirdPartyByName(t.identifier);
              } catch {
                p = undefined;
              }
              const proto = p?.instance ? Object.getPrototypeOf(p.instance) : null;
              const ham = proto
                ? Object.getOwnPropertyNames(proto).filter(
                    (k) =>
                      !BLOCKED_FUNCTIONS.has(k) &&
                      !k.startsWith('_') &&
                      typeof p.instance[k] === 'function'
                  )
                : [];
              return {
                id: t.id,
                ten: t.name,
                nha_cung_cap: t.identifier,
                tieu_de: p?.title,
                vi_tri: p?.position,
                ham_goi_duoc: ham,
                nhap_vao_thu_vien: !!p?.instance?.importMedia,
              };
            }),
            danh_muc: this._thirdPartyManager.getAllThirdParties().map((p: any) => ({
              nha_cung_cap: p.identifier,
              tieu_de: p.title,
              mo_ta: p.description,
            })),
          };
        },
      }),

      hub_ben_thu_ba_goi: hubTool({
        id: 'hub_ben_thu_ba_goi',
        title: 'Gọi hàm tích hợp bên thứ ba',
        level: 'nhap',
        openWorld: true,
        description:
          'Gọi một hàm của tích hợp bên thứ ba (vd HeyGen: voices, avatars, generateVoice {text}; Reel.Farm: listMedia {page}). Tên hàm lấy từ hub_ben_thu_ba → ham_goi_duoc. Có thể tốn hạn mức của nhà cung cấp.',
        input: z.object({
          id: z.string().describe('id tích hợp (hub_ben_thu_ba → da_ket_noi)'),
          ham: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
          du_lieu: z.record(z.string(), z.any()).optional(),
        }),
        run: async (input, org) => {
          if (BLOCKED_FUNCTIONS.has(input.ham)) {
            throw new HubToolError('Hàm này không gọi được qua MCP.');
          }
          const { row, inst } = await this.thirdParty(org, input.id);
          const proto = Object.getPrototypeOf(inst.instance);
          if (
            !Object.getOwnPropertyNames(proto).includes(input.ham) ||
            typeof inst.instance[input.ham] !== 'function'
          ) {
            throw new HubToolError('Nhà cung cấp không có hàm này.');
          }
          return inst.instance[input.ham](
            AuthService.fixedDecryption(row.apiKey),
            input.du_lieu || {}
          );
        },
      }),

      hub_ben_thu_ba_nhap_media: hubTool({
        id: 'hub_ben_thu_ba_nhap_media',
        title: 'Nhập media bên thứ ba vào thư viện',
        level: 'nhap',
        openWorld: true,
        description:
          'Tải media (vd video Reel.Farm lấy từ hub_ben_thu_ba_goi ham=listMedia) vào Thư viện media của Hub. Trả các media đã lưu.',
        input: z.object({
          id: z.string().describe('id tích hợp'),
          muc: z
            .array(z.object({ url: z.string().url(), ten: z.string().min(1) }))
            .min(1)
            .max(20),
        }),
        run: async (input, org) => {
          for (const m of input.muc) {
            if (!(await isSafePublicHttpsUrl(m.url))) {
              throw new HubToolError(`Link không hợp lệ (phải https công khai): ${m.url}`);
            }
          }
          const { row, inst } = await this.thirdParty(org, input.id);
          if (typeof inst.instance.importMedia !== 'function') {
            throw new HubToolError('Nhà cung cấp này không hỗ trợ nhập media.');
          }
          const urls = await inst.instance.importMedia(
            AuthService.fixedDecryption(row.apiKey),
            input.muc.map((m) => ({ url: m.url, name: m.ten }))
          );
          if (!Array.isArray(urls)) {
            throw new HubToolError('Nhà cung cấp này không hỗ trợ nhập media.');
          }
          const saved: any[] = [];
          for (const item of urls) {
            if (!(await isSafePublicHttpsUrl(item?.url))) continue;
            const file = await this._storage.uploadSimple(item.url);
            const m: any = await this._mediaService.saveFile(
              org.id,
              item.name || file.split('/').pop(),
              file
            );
            saved.push({ id: m?.id, ten: m?.name, link: m?.path || file });
          }
          return { ok: true, da_luu: saved };
        },
      }),

      // ── SO SÁNH SỐ LIỆU ──────────────────────────────────────────────────
      hub_so_lieu_so_sanh: hubTool({
        id: 'hub_so_lieu_so_sanh',
        title: 'So sánh số liệu (hai kỳ / hai kênh)',
        level: 'doc',
        openWorld: true,
        description:
          'So sánh số liệu mạng xã hội theo từng chỉ số, chênh lệch tính bằng %. Chỉ truyền kenh: N ngày gần nhất so với N ngày liền trước của cùng kênh. Truyền thêm kenh_b: kênh B so với kênh A (kenh) trong cùng N ngày gần nhất. "tong" = cộng các ngày; "cuoi" = giá trị ngày cuối (hợp với chỉ số luỹ kế như người theo dõi).',
        input: z.object({
          kenh: z.string().describe('id kênh A'),
          kenh_b: z.string().optional().describe('id kênh B (so sánh hai kênh)'),
          so_ngay: days,
        }),
        run: async (input, org) => {
          const n = input.so_ngay;
          const last = (pts: any[]) =>
            pts.length ? Number(pts[pts.length - 1].total) || 0 : null;

          if (input.kenh_b) {
            const [a, b] = await Promise.all([
              this.metricTotals(org, input.kenh, n),
              this.metricTotals(org, input.kenh_b, n),
            ]);
            const labels = Array.from(
              new Set([...a, ...b].map((m) => m.label))
            );
            return {
              kieu: 'hai_kenh',
              so_ngay: n,
              kenh_a: input.kenh,
              kenh_b: input.kenh_b,
              chi_so: labels.map((label) => {
                const pa = a.find((m) => m.label === label)?.data || [];
                const pb = b.find((m) => m.label === label)?.data || [];
                const ta = sumOf(pa);
                const tb = sumOf(pb);
                return {
                  chi_so: label,
                  tong_a: pa.length ? ta : null,
                  tong_b: pb.length ? tb : null,
                  b_so_voi_a_phan_tram: pa.length && pb.length ? pct(tb, ta) : null,
                  cuoi_a: last(pa),
                  cuoi_b: last(pb),
                };
              }),
            };
          }

          const all = await this.metricTotals(org, input.kenh, n * 2);
          const cutoff = dayjs().subtract(n, 'day').startOf('day');
          let coKyTruoc = false;
          const chi_so = all.map((m) => {
            const pts = (m.data || [])
              .filter((p) => dayjs(p.date).isValid())
              .sort((x, y) => dayjs(x.date).valueOf() - dayjs(y.date).valueOf());
            const cur = pts.filter((p) => !dayjs(p.date).isBefore(cutoff));
            const prev = pts.filter((p) => dayjs(p.date).isBefore(cutoff));
            if (prev.length) coKyTruoc = true;
            const tc = sumOf(cur);
            const tp = sumOf(prev);
            return {
              chi_so: m.label,
              tong_ky_nay: tc,
              tong_ky_truoc: prev.length ? tp : null,
              chenh_lech_phan_tram: prev.length ? pct(tc, tp) : null,
              cuoi_ky_nay: last(cur),
              cuoi_ky_truoc: last(prev),
            };
          });
          return {
            kieu: 'hai_ky',
            kenh: input.kenh,
            ky_nay: `${cutoff.format('YYYY-MM-DD')} → nay (${n} ngày)`,
            ky_truoc: `${n} ngày trước đó`,
            ghi_chu: coKyTruoc
              ? undefined
              : 'Nền tảng không trả số liệu kỳ trước (giới hạn số ngày) — chỉ có kỳ này. Thử so_ngay nhỏ hơn.',
            chi_so,
          };
        },
      }),
    };
  }
}
