import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  hubTool,
  requireLevel,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Kênh": xem trạng thái kênh, bật/tắt, đổi tên, gán khách hàng, khung
//  giờ đăng, cài đặt thêm, plugs. KHÔNG có xoá kênh / kết nối OAuth (chỉ làm
//  trong app). Không bao giờ trả token kênh.
// ============================================================================

// Khung giờ đăng lưu dạng số PHÚT tính từ 00:00 UTC (findFreeDateTime cộng
// thẳng vào đầu ngày UTC). Hub dùng giờ Việt Nam (UTC+7) khi hiển thị.
const VN_OFFSET = 7 * 60;
const pad = (n: number) => String(n).padStart(2, '0');
const minToHHmm = (m: number) =>
  `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad(
    (((m % 1440) + 1440) % 1440) % 60
  )}`;
const utcMinToVn = (m: number) => minToHHmm(m + VN_OFFSET);
const vnHHmmToUtcMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) {
    throw new HubToolError(`Giờ "${s}" không hợp lệ — dùng HH:mm (vd 19:30).`);
  }
  return (((+m[1] * 60 + +m[2] - VN_OFFSET) % 1440) + 1440) % 1440;
};

const parseJson = <T>(s: any, fallback: T): T => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

@Injectable()
export class HubChannelsTools implements HubToolGroup {
  constructor(
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}

  private async loadChannel(org: HubOrg, id: string) {
    const ch: any = await this._integrationService.getIntegrationById(
      org.id,
      id
    );
    if (!ch || ch.deletedAt) {
      throw new HubToolError(
        `Không tìm thấy kênh ${id} (lấy id từ hub_kenh_danh_sach).`
      );
    }
    return ch;
  }

  private times(ch: any) {
    const list = parseJson<{ time: number }[]>(ch.postingTimes, []);
    return list.map((t) => ({
      phut_utc: t.time,
      gio_vn: utcMinToVn(t.time),
    }));
  }

  tools(): HubToolMap {
    return {
      hub_kenh_danh_sach: hubTool({
        id: 'hub_kenh_danh_sach',
        title: 'Danh sách kênh & trạng thái',
        level: 'doc',
        description:
          'Mọi kênh đã kết nối: nền tảng, tên, bật/tắt, MẤT KẾT NỐI (cần kết nối lại trong app), đang dở bước kết nối, khách hàng, khung giờ đăng (giờ VN + phút UTC), chân bài, cài đặt thêm, khả năng đổi tên. Kênh cần xử lý được gom ở can_xu_ly.',
        input: z.object({
          nen_tang: z.string().optional().describe('Lọc theo nền tảng, vd facebook'),
          khach_hang: z.string().optional().describe('Lọc theo id khách hàng'),
        }),
        run: async (input, org) => {
          const list = (await this._integrationService.getIntegrationsList(org.id))
            .filter((c: any) =>
              input.nen_tang
                ? c.providerIdentifier.startsWith(input.nen_tang.toLowerCase())
                : true
            )
            .filter((c: any) =>
              input.khach_hang ? c.customerId === input.khach_hang : true
            );
          const kenh = list.map((c: any) => {
            const provider = this._integrationManager.getSocialIntegration(
              c.providerIdentifier
            );
            const mat = !!c.refreshNeeded;
            return {
              id: c.id,
              ten: c.name,
              nen_tang: c.providerIdentifier,
              loai: c.type,
              id_noi_bo: c.internalId,
              ho_so: c.profile || undefined,
              tat: c.disabled,
              mat_ket_noi: mat,
              dang_do_buoc_ket_noi: !!c.inBetweenSteps,
              can_ket_noi_lai: mat || !!c.inBetweenSteps,
              khach_hang: c.customer
                ? { id: c.customer.id, ten: c.customer.name }
                : undefined,
              khung_gio: this.times(c),
              chan_bai: c.postFooter || undefined,
              cai_dat_them: parseJson<any[]>(c.additionalSettings, []).map(
                (s: any) => ({ ten: s.title, loai: s.type, gia_tri: s.value })
              ),
              doi_ten_duoc: !!provider?.changeNickname,
              doi_anh_duoc: !!provider?.changeProfilePicture,
            };
          });
          return {
            so_kenh: kenh.length,
            can_xu_ly: kenh
              .filter((k) => k.can_ket_noi_lai || k.tat)
              .map((k) => ({
                id: k.id,
                ten: k.ten,
                nen_tang: k.nen_tang,
                van_de: k.can_ket_noi_lai
                  ? 'Mất kết nối — vào app Hub bấm "Kết nối lại" (Preferences → Reconnect).'
                  : 'Đang tắt.',
              })),
            kenh,
          };
        },
      }),

      hub_kenh_bat_tat: hubTool({
        id: 'hub_kenh_bat_tat',
        title: 'Bật / tắt kênh',
        level: 'dang',
        description:
          'Bật hoặc tắt một kênh. Kênh tắt không đăng bài và không tính vào giới hạn gói; bật lại bị chặn nếu đã chạm số kênh tối đa của gói.',
        input: z.object({
          kenh: z.string(),
          bat: z.boolean().describe('true = bật, false = tắt'),
        }),
        run: async (input, org) => {
          const ch = await this.loadChannel(org, input.kenh);
          if (input.bat) {
            if (!ch.disabled) return { ok: true, kenh: ch.id, ghi_chu: 'Kênh đang bật sẵn.' };
            await this._integrationService
              .enableChannel(
                org.id,
                (org as any)?.subscription?.totalChannels || pricing.FREE.channel,
                ch.id
              )
              .catch((e: any) => {
                throw new HubToolError(
                  /maximum number of channels/i.test(e?.message || '')
                    ? 'Đã chạm số kênh tối đa của gói — tắt kênh khác hoặc nâng gói.'
                    : e?.message || 'Không bật được kênh.'
                );
              });
          } else {
            await this._integrationService.disableChannel(org.id, ch.id);
          }
          return { ok: true, kenh: ch.id, ten: ch.name, tat: !input.bat };
        },
      }),

      hub_kenh_doi_ten: hubTool({
        id: 'hub_kenh_doi_ten',
        title: 'Đổi tên hiển thị kênh',
        level: 'nhap',
        openWorld: true,
        description:
          'Đổi nickname (và ảnh đại diện, nếu truyền anh) của kênh NGAY TRÊN nền tảng — chỉ kênh có doi_ten_duoc / doi_anh_duoc = true trong hub_kenh_danh_sach (vd Discord, Slack). Nền tảng khác không đổi được qua Hub.',
        input: z.object({
          kenh: z.string(),
          ten: z.string().min(1).max(100).optional(),
          anh: z.string().url().optional().describe('Link ảnh đại diện mới'),
        }),
        run: async (input, org) => {
          if (!input.ten && !input.anh) throw new HubToolError('Cần ten hoặc anh.');
          const ch = await this.loadChannel(org, input.kenh);
          const manager = this._integrationManager.getSocialIntegration(
            ch.providerIdentifier
          );
          if (input.ten && !manager?.changeNickname) {
            throw new HubToolError(`${ch.providerIdentifier} không hỗ trợ đổi tên qua Hub.`);
          }
          if (input.anh && !manager?.changeProfilePicture) {
            throw new HubToolError(`${ch.providerIdentifier} không hỗ trợ đổi ảnh qua Hub.`);
          }
          const { url } =
            input.anh && manager.changeProfilePicture
              ? await manager.changeProfilePicture(ch.internalId, ch.token, input.anh)
              : { url: '' };
          const { name } =
            input.ten && manager.changeNickname
              ? await manager.changeNickname(ch.internalId, ch.token, input.ten)
              : { name: '' };
          await this._integrationService.updateNameAndUrl(ch.id, name, url);
          return { ok: true, kenh: ch.id, ten: name || ch.name, anh: url || undefined };
        },
      }),

      hub_kenh_nhom: hubTool({
        id: 'hub_kenh_nhom',
        title: 'Gán kênh cho khách hàng',
        level: 'nhap',
        description:
          'Gán kênh vào một khách hàng (nhóm kênh, dùng lọc lịch). Truyền khach_hang_id (id có sẵn — hub_khach_hang) HOẶC ten_khach_hang (tạo mới nếu chưa có). Truyền cả hai rỗng ("") để bỏ gán.',
        input: z.object({
          kenh: z.string(),
          khach_hang_id: z.string().optional(),
          ten_khach_hang: z.string().max(100).optional(),
        }),
        run: async (input, org) => {
          const ch = await this.loadChannel(org, input.kenh);
          if (input.khach_hang_id === undefined && input.ten_khach_hang === undefined) {
            throw new HubToolError('Cần khach_hang_id hoặc ten_khach_hang.');
          }
          if (input.khach_hang_id) {
            const customers = await this._integrationService.customers(org.id);
            if (!customers.some((c: any) => c.id === input.khach_hang_id)) {
              throw new HubToolError('Không tìm thấy khách hàng (xem hub_khach_hang).');
            }
            await this._integrationService.updateIntegrationGroup(
              org.id,
              ch.id,
              input.khach_hang_id
            );
          } else if (input.ten_khach_hang) {
            await this._integrationService.updateOnCustomerName(
              org.id,
              ch.id,
              input.ten_khach_hang.trim()
            );
          } else {
            await this._integrationService.updateIntegrationGroup(org.id, ch.id, '');
          }
          const after = await this.loadChannel(org, ch.id);
          return { ok: true, kenh: ch.id, khach_hang_id: after.customerId || null };
        },
      }),

      hub_kenh_gio_dang: hubTool({
        id: 'hub_kenh_gio_dang',
        title: 'Khung giờ đăng mặc định của kênh',
        level: 'doc',
        writes: true,
        description: `Xem hoặc đặt khung giờ đăng mặc định của kênh (dùng khi tìm "giờ trống" để xếp bài).
Hệ thống lưu mỗi giờ là số PHÚT tính từ 00:00 UTC (vd 720 = 12:00 UTC = 19:00 giờ VN). Tool nhận gio_vn dạng "HH:mm" giờ Việt Nam (UTC+7) và tự đổi; hoặc truyền phut_utc trực tiếp.
Bỏ trống cả hai = chỉ xem (khoá "chỉ đọc"); đặt giờ (thay TOÀN BỘ khung giờ) cần khoá "được đăng".`,
        input: z.object({
          kenh: z.string(),
          gio_vn: z.array(z.string()).max(48).optional().describe('vd ["07:30","12:00","19:30"]'),
          phut_utc: z.array(z.number().int().min(0).max(1439)).max(48).optional(),
        }),
        run: async (input, org) => {
          const ch = await this.loadChannel(org, input.kenh);
          if (!input.gio_vn && !input.phut_utc) {
            return { kenh: ch.id, ten: ch.name, khung_gio: this.times(ch) };
          }
          requireLevel(org, 'dang', 'đổi khung giờ đăng');
          const mins = [
            ...(input.gio_vn || []).map(vnHHmmToUtcMin),
            ...(input.phut_utc || []),
          ];
          const uniq = [...new Set(mins)].sort((a, b) => a - b);
          if (!uniq.length) throw new HubToolError('Cần ít nhất 1 giờ.');
          await this._integrationService.setTimes(org.id, ch.id, {
            time: uniq.map((time) => ({ time })),
          });
          return {
            ok: true,
            kenh: ch.id,
            khung_gio: uniq.map((m) => ({ phut_utc: m, gio_vn: utcMinToVn(m) })),
          };
        },
      }),

      hub_kenh_cai_dat: hubTool({
        id: 'hub_kenh_cai_dat',
        title: 'Cài đặt thêm của kênh',
        level: 'doc',
        writes: true,
        description:
          'Xem hoặc sửa "cài đặt thêm" của kênh (các mục do nền tảng định nghĩa — vd tài khoản X Premium cho bài dài). Bỏ trống gia_tri = chỉ xem (khoá "chỉ đọc"). Truyền gia_tri [{ten, gia_tri}] để GỘP vào (chỉ sửa mục đã có, theo tên) — khoá "được đăng".',
        input: z.object({
          kenh: z.string(),
          gia_tri: z
            .array(z.object({ ten: z.string(), gia_tri: z.any() }))
            .optional(),
        }),
        run: async (input, org) => {
          const ch = await this.loadChannel(org, input.kenh);
          const list = parseJson<any[]>(ch.additionalSettings, []);
          const view = (l: any[]) =>
            l.map((s) => ({
              ten: s.title,
              mo_ta: s.description,
              loai: s.type,
              gia_tri: s.value,
            }));
          if (!input.gia_tri?.length) return { kenh: ch.id, cai_dat: view(list) };
          requireLevel(org, 'dang', 'đổi cài đặt kênh');
          for (const g of input.gia_tri) {
            const item = list.find(
              (s) => String(s.title).toLowerCase() === g.ten.toLowerCase()
            );
            if (!item) {
              throw new HubToolError(
                `Kênh không có mục "${g.ten}". Có: ${list.map((s) => s.title).join(', ') || '(trống)'}`
              );
            }
            item.value = item.type === 'checkbox' ? !!g.gia_tri : g.gia_tri;
          }
          await this._integrationService.updateProviderSettings(
            org.id,
            ch.id,
            JSON.stringify(list)
          );
          return { ok: true, kenh: ch.id, cai_dat: view(list) };
        },
      }),

      hub_kenh_plugs: hubTool({
        id: 'hub_kenh_plugs',
        title: 'Plugs của kênh',
        level: 'doc',
        writes: true,
        description: `Plugs = hành động tự động sau khi đăng (vd tự repost / tự comment khi bài đạt N lượt thích).
- "danh_sach" (mặc định, khoá "chỉ đọc"): plug nền tảng hỗ trợ + plug đã cài trên kenh (nếu truyền kenh).
- "luu": kenh + ham (methodName của plug) + truong [{name, value}] — tạo/cập nhật (tạo mới thì tự bật) — khoá "được đăng".
- "bat_tat": plug_id + bat — khoá "được đăng".`,
        input: z.object({
          hanh_dong: z.enum(['danh_sach', 'luu', 'bat_tat']).default('danh_sach'),
          kenh: z.string().optional(),
          ham: z.string().optional(),
          truong: z
            .array(z.object({ name: z.string(), value: z.string() }))
            .optional(),
          plug_id: z.string().optional(),
          bat: z.boolean().optional(),
        }),
        run: async (input, org) => {
          if (input.hanh_dong === 'danh_sach') {
            const all = this._integrationManager.getAllPlugs();
            if (!input.kenh) return { plugs_ho_tro: all };
            const ch = await this.loadChannel(org, input.kenh);
            const installed = await this._integrationService.getPlugsByIntegrationId(
              org.id,
              ch.id
            );
            return {
              kenh: ch.id,
              plugs_ho_tro:
                all.find((p: any) => p.identifier === ch.providerIdentifier)?.plugs || [],
              da_cai: installed.map((p: any) => ({
                id: p.id,
                ham: p.plugFunction,
                bat: p.activated,
                truong: parseJson<any[]>(p.data, []),
              })),
            };
          }
          requireLevel(org, 'dang', 'cấu hình plug');
          if (input.hanh_dong === 'luu') {
            if (!input.kenh || !input.ham || !input.truong) {
              throw new HubToolError('"luu" cần kenh, ham, truong.');
            }
            const ch = await this.loadChannel(org, input.kenh);
            const supported =
              this._integrationManager
                .getAllPlugs()
                .find((p: any) => p.identifier === ch.providerIdentifier)?.plugs || [];
            if (!supported.some((p: any) => p.methodName === input.ham)) {
              throw new HubToolError(
                `Nền tảng ${ch.providerIdentifier} không có plug "${input.ham}". Có: ${
                  supported.map((p: any) => p.methodName).join(', ') || '(không có)'
                }`
              );
            }
            const r = await this._integrationService.createOrUpdatePlug(org.id, ch.id, {
              func: input.ham,
              fields: (input.truong || []).map((f) => ({
                name: String(f.name ?? ''),
                value: String(f.value ?? ''),
              })),
            });
            return { ok: true, kenh: ch.id, ham: input.ham, bat: r.activated };
          }
          if (!input.plug_id || input.bat === undefined) {
            throw new HubToolError('"bat_tat" cần plug_id và bat.');
          }
          await this._integrationService
            .changePlugActivation(org.id, input.plug_id, input.bat)
            .catch(() => {
              throw new HubToolError('Không tìm thấy plug.');
            });
          return { ok: true, plug_id: input.plug_id, bat: input.bat };
        },
      }),
    };
  }
}
