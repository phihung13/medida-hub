import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ViralService } from '@gitroom/nestjs-libraries/database/prisma/viral/viral.service';
import {
  GROUP_POST_KINDS,
  ViralGroupService,
} from '@gitroom/nestjs-libraries/database/prisma/viral/viral-group.service';
import {
  HubToolError,
  HubToolGroup,
  HubToolMap,
  hubTool,
  requireLevel,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Viral": cào nguồn → chủ đề (nhiều nguồn cùng nói) → duyệt → "Bài của
//  mình" (AI viết lại) / sản xuất blog · infographic · podcast → đưa lên Lịch
//  thành BẢN NHÁP. Không công cụ nào ở đây tự đăng ra ngoài.
// ============================================================================

const ids = z.array(z.string()).min(1).max(300);
const LIST_LIMIT = 50;

@Injectable()
export class HubViralTools implements HubToolGroup {
  constructor(
    private _viralService: ViralService,
    private _groupService: ViralGroupService
  ) {}

  tools(): HubToolMap {
    return {
      hub_viral_chu_de: hubTool({
        id: 'hub_viral_chu_de',
        title: 'Chủ đề viral',
        level: 'doc',
        description:
          'Chủ đề viral (cụm nhiều nguồn cùng nói về một chuyện) kèm điểm, số nguồn, trạng thái duyệt. Đơn vị chính để chọn content.',
        input: z.object({
          trang_thai: z
            .enum(['pending', 'approved', 'archive'])
            .optional()
            .describe('Bỏ trống = mọi chủ đề đang hoạt động; archive = đã bỏ qua / đã xoá'),
          sap_xep: z
            .enum(['new', 'score'])
            .optional()
            .describe('Bỏ trống = nhiều bài chung nhất trước'),
        }),
        run: async (input, org) => {
          const [topics, counts] = await Promise.all([
            this._viralService.listTopics(org.id, {
              status: input.trang_thai,
              sort: input.sap_xep,
            }),
            this._viralService.topicStatusCounts(org.id),
          ]);
          return {
            dem_theo_trang_thai: counts,
            chu_de: (topics as any[]).slice(0, LIST_LIMIT),
            con_nua: Math.max(0, (topics as any[]).length - LIST_LIMIT),
          };
        },
      }),

      hub_viral_chu_de_chi_tiet: hubTool({
        id: 'hub_viral_chu_de_chi_tiet',
        title: 'Chi tiết chủ đề viral',
        level: 'doc',
        description: 'Toàn bộ bài nguồn của một chủ đề + sản phẩm đã làm từ chủ đề đó.',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const res = await this._viralService.topicDetail(org.id, input.id);
          if (!res) throw new HubToolError('Không tìm thấy chủ đề.');
          return res;
        },
      }),

      hub_viral_chu_de_duyet: hubTool({
        id: 'hub_viral_chu_de_duyet',
        title: 'Duyệt / bỏ qua chủ đề',
        level: 'nhap',
        description:
          'Đổi trạng thái hàng loạt chủ đề: approve (duyệt — Hub tự sản xuất định dạng đề xuất nếu bật trong Cài đặt), skip, pending, delete (xoá mềm, cần khoá "được đăng").',
        input: z.object({
          ids,
          hanh_dong: z.enum(['approve', 'skip', 'pending', 'delete']),
        }),
        run: async (input, org) => {
          if (input.hanh_dong === 'delete') requireLevel(org, 'dang', 'xoá chủ đề');
          const map = {
            approve: 'approved',
            skip: 'skipped',
            pending: 'pending',
            delete: 'delete',
          } as const;
          await this._viralService.bulkTopicStatus(
            org.id,
            input.ids,
            map[input.hanh_dong]
          );
          return { ok: true };
        },
      }),

      hub_viral_chu_de_viet_lai: hubTool({
        id: 'hub_viral_chu_de_viet_lai',
        title: 'Viết chủ đề thành "Bài của mình"',
        level: 'nhap',
        openWorld: true,
        description:
          'AI tổng hợp các nguồn của chủ đề, viết thành một "Bài của mình" theo giọng Việt Anh (vào hàng Chờ đăng, chưa lên Lịch).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const res = await this._viralService.cloneTopic(org.id, input.id);
          if (!res) throw new HubToolError('Không viết lại được — thử lại.');
          return res;
        },
      }),

      hub_viral_bai: hubTool({
        id: 'hub_viral_bai',
        title: 'Bài viral đã cào',
        level: 'doc',
        description: 'Từng bài viral đã cào/thu thập, kèm điểm AI và trạng thái duyệt.',
        input: z.object({
          trang_thai: z
            .enum(['pending', 'approved', 'skipped', 'archive'])
            .optional()
            .describe('Bỏ trống = mọi bài đang hoạt động'),
          nen_tang: z.string().optional().describe('facebook | tiktok | youtube | news …'),
          muc: z.string().optional().describe('Mức viral (lọc)'),
          sap_xep: z
            .enum(['new', 'score'])
            .optional()
            .describe('Bỏ trống = nhiều chia sẻ nhất trước'),
        }),
        run: async (input, org) => {
          const [items, counts] = await Promise.all([
            this._viralService.list(org.id, {
              status: input.trang_thai,
              platform: input.nen_tang,
              level: input.muc,
              sort: input.sap_xep,
            }),
            this._viralService.statusCounts(org.id),
          ]);
          return {
            dem_theo_trang_thai: counts,
            bai: (items as any[]).slice(0, LIST_LIMIT),
            con_nua: Math.max(0, (items as any[]).length - LIST_LIMIT),
          };
        },
      }),

      hub_viral_bai_duyet: hubTool({
        id: 'hub_viral_bai_duyet',
        title: 'Duyệt / bỏ qua bài viral',
        level: 'nhap',
        description:
          'Hàng loạt: approve, skip, pending, clone (AI viết lại thành "Bài của mình"), delete (xoá mềm — cần khoá "được đăng").',
        input: z.object({
          ids,
          hanh_dong: z.enum(['approve', 'skip', 'pending', 'clone', 'delete']),
        }),
        run: async (input, org) => {
          switch (input.hanh_dong) {
            case 'delete':
              requireLevel(org, 'dang', 'xoá bài viral');
              await this._viralService.bulkSoftDelete(org.id, input.ids);
              return { ok: true };
            case 'clone':
              return this._viralService.bulkCloneToMine(org.id, input.ids);
            default:
              await this._viralService.bulkStatus(
                org.id,
                input.ids,
                ({ approve: 'approved', skip: 'skipped', pending: 'pending' } as const)[
                  input.hanh_dong
                ]
              );
              return { ok: true };
          }
        },
      }),

      hub_viral_them: hubTool({
        id: 'hub_viral_them',
        title: 'Thêm bài viral bằng tay',
        level: 'nhap',
        openWorld: true,
        description:
          'Đưa một bài viral vào kho bằng link hoặc đoạn chữ — AI tự phân tích và chấm điểm.',
        input: z.object({
          link: z.string().url().optional(),
          noi_dung: z.string().optional(),
          nen_tang: z.string().optional(),
        }),
        run: async (input, org) => {
          if (!input.link && !input.noi_dung) {
            throw new HubToolError('Cần link hoặc nội dung.');
          }
          return this._viralService.capture(org.id, {
            url: input.link,
            text: input.noi_dung,
            platform: input.nen_tang,
          });
        },
      }),

      hub_viral_nhan_ban: hubTool({
        id: 'hub_viral_nhan_ban',
        title: 'Nhân bản bài viral thành nháp',
        level: 'nhap',
        openWorld: true,
        description:
          'AI mổ công thức bài viral rồi viết bài mới cùng công thức cho kênh đích → BẢN NHÁP trên Lịch.',
        input: z.object({ id: z.string(), kenh: z.string() }),
        run: async (input, org) => {
          const res = await this._viralService.clone(org.id, input.id, input.kenh);
          if (!res) throw new HubToolError('Không nhân bản được — thử lại.');
          return res;
        },
      }),

      hub_viral_cao_ngay: hubTool({
        id: 'hub_viral_cao_ngay',
        title: 'Cào nguồn ngay',
        level: 'nhap',
        openWorld: true,
        description:
          'Quét TẤT CẢ nguồn đang theo dõi để lấy bài mới (chạy nền vài phút). Gọi hub_viral_chu_de sau đó để xem kết quả.',
        input: z.object({}),
        run: async (_i, org) => {
          this._viralService.crawlAll(org.id, true).catch(() => undefined);
          return { ok: true, ghi_chu: 'Đã bắt đầu cào nền — xem lại sau vài phút.' };
        },
      }),

      hub_viral_bai_cua_minh: hubTool({
        id: 'hub_viral_bai_cua_minh',
        title: '"Bài của mình" chờ đăng',
        level: 'doc',
        description: 'Các bài AI đã viết lại từ viral, đang chờ đưa lên Lịch.',
        input: z.object({}),
        run: async (_i, org) => {
          const items = (await this._viralService.listClones(org.id)) as any[];
          return {
            bai: items.slice(0, LIST_LIMIT),
            con_nua: Math.max(0, items.length - LIST_LIMIT),
          };
        },
      }),

      hub_viral_bai_cua_minh_len_lich: hubTool({
        id: 'hub_viral_bai_cua_minh_len_lich',
        title: 'Đưa "Bài của mình" lên Lịch (nháp / đăng ngay)',
        level: 'nhap',
        description:
          'Tạo BẢN NHÁP trên Lịch cho kênh đích từ một "Bài của mình". dang_ngay=true thì ĐĂNG THẬT ngay (cần khoá "được đăng", chỉ khi người dùng nói rõ).',
        input: z.object({
          id: z.string(),
          kenh: z.string(),
          dang_ngay: z.boolean().optional(),
        }),
        run: async (input, org) => {
          if (input.dang_ngay) requireLevel(org, 'dang', 'đăng ngay');
          const res = await this._viralService.postClone(
            org.id,
            input.id,
            input.kenh,
            input.dang_ngay ? 'now' : 'draft'
          );
          if (!res) throw new HubToolError('Không đưa lên Lịch được — thử lại.');
          return res;
        },
      }),

      hub_viral_bai_cua_minh_viet_lai: hubTool({
        id: 'hub_viral_bai_cua_minh_viet_lai',
        title: 'Viết lại "Bài của mình"',
        level: 'nhap',
        openWorld: true,
        description: 'AI viết lại một "Bài của mình" cho tốt hơn và chấm điểm lại.',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const res = await this._viralService.regenerateClone(org.id, input.id);
          if (!res) throw new HubToolError('Không viết lại được — thử lại.');
          return { ok: true };
        },
      }),

      hub_viral_bai_cua_minh_xoa: hubTool({
        id: 'hub_viral_bai_cua_minh_xoa',
        title: 'Xoá "Bài của mình"',
        level: 'dang',
        destructive: true,
        description: 'Xoá hẳn một "Bài của mình".',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._viralService.deleteClone(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_viral_san_xuat: hubTool({
        id: 'hub_viral_san_xuat',
        title: 'Sản xuất blog / infographic / podcast',
        level: 'nhap',
        openWorld: true,
        description:
          'Xếp hàng sản xuất (chạy nền) từ tối đa 20 bài viral / chủ đề / "Bài của mình". Theo dõi bằng hub_viral_san_pham.',
        input: z.object({
          ids: z.array(z.string()).min(1).max(20),
          nguon: z.enum(['post', 'topic', 'clone']).describe('Loại id truyền vào'),
          dinh_dang: z.array(z.enum(['blog', 'infographic', 'podcast'])).min(1),
          nhac_nen: z.boolean().optional().describe('Podcast: chèn nhạc nền'),
        }),
        run: async (input, org) => {
          const res = await this._viralService.produce(org.id, {
            ids: input.ids,
            source: input.nguon,
            formats: input.dinh_dang,
            bgm: input.nhac_nen,
          });
          if (!res.queued) throw new HubToolError('Chưa có bài hoặc định dạng hợp lệ.');
          return res;
        },
      }),

      hub_viral_san_pham: hubTool({
        id: 'hub_viral_san_pham',
        title: 'Sản phẩm đã sản xuất',
        level: 'doc',
        description:
          'Blog / infographic / podcast đã (hoặc đang) sản xuất: trạng thái processing | done | error, link file, gợi ý kênh.',
        input: z.object({}),
        run: async (_i, org) => {
          const items = (await this._viralService.listProducts(org.id)) as any[];
          return {
            san_pham: items.slice(0, LIST_LIMIT),
            con_nua: Math.max(0, items.length - LIST_LIMIT),
          };
        },
      }),

      hub_viral_san_pham_len_lich: hubTool({
        id: 'hub_viral_san_pham_len_lich',
        title: 'Đưa infographic lên Lịch (nháp / đăng ngay)',
        level: 'nhap',
        description:
          'Tạo BẢN NHÁP trên Lịch kèm cả bộ ảnh của một infographic đã xong. dang_ngay=true thì ĐĂNG THẬT ngay (cần khoá "được đăng", chỉ khi người dùng nói rõ).',
        input: z.object({
          id: z.string(),
          kenh: z.string(),
          dang_ngay: z.boolean().optional(),
        }),
        run: async (input, org) => {
          if (input.dang_ngay) requireLevel(org, 'dang', 'đăng ngay');
          const res: any = await this._viralService.postProduct(
            org.id,
            input.id,
            input.kenh,
            input.dang_ngay ? 'now' : 'draft'
          );
          if (!res) throw new HubToolError('Không tìm thấy sản phẩm (hoặc chưa xong / không phải infographic).');
          if (res.needRetry) {
            throw new HubToolError('Bộ ảnh tạo bằng bản cũ — gọi hub_viral_san_pham_lam_lai (lam_moi=true) rồi đưa lên lại.');
          }
          return res;
        },
      }),

      hub_viral_san_pham_lam_lai: hubTool({
        id: 'hub_viral_san_pham_lam_lai',
        title: 'Làm lại sản phẩm',
        level: 'nhap',
        openWorld: true,
        description:
          'Chạy lại sản phẩm lỗi. lam_moi=true: dựng lại từ đầu; false: làm tiếp từ chỗ hỏng.',
        input: z.object({ id: z.string(), lam_moi: z.boolean().default(false) }),
        run: async (input, org) => {
          const ok = await this._viralService.retryProduct(org.id, input.id, input.lam_moi);
          if (!ok) throw new HubToolError('Không tìm thấy sản phẩm.');
          return { ok: true };
        },
      }),

      hub_viral_san_pham_xoa: hubTool({
        id: 'hub_viral_san_pham_xoa',
        title: 'Xoá sản phẩm',
        level: 'dang',
        destructive: true,
        description: 'Xoá hẳn một sản phẩm đã sản xuất.',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          await this._viralService.deleteProduct(org.id, input.id);
          return { ok: true };
        },
      }),

      hub_viral_nguon: hubTool({
        id: 'hub_viral_nguon',
        title: 'Nguồn theo dõi',
        level: 'doc',
        description:
          'Các nguồn đang theo dõi (fanpage KOL, trường đối thủ, group, báo, từ khoá) và nguồn nào tự cào theo lịch.',
        input: z.object({}),
        run: async (_i, org) => this._viralService.listSources(org.id),
      }),

      hub_viral_nguon_them: hubTool({
        id: 'hub_viral_nguon_them',
        title: 'Thêm nguồn theo dõi',
        level: 'dang',
        description: 'Thêm một nguồn để cào bài viral.',
        input: z.object({
          ten: z.string().min(1).max(120),
          nen_tang: z.string().default('facebook').describe('facebook | tiktok | youtube | news | keyword …'),
          link: z.string().optional().describe('Link trang / kênh, hoặc từ khoá với news'),
          loai: z.enum(['kol', 'school', 'group', 'news', 'other']).default('other'),
          tu_dong: z.boolean().default(false).describe('Tự cào theo lịch'),
        }),
        run: async (input, org) =>
          this._viralService.createSource(org.id, {
            name: input.ten,
            platform: input.nen_tang,
            url: input.link,
            type: input.loai,
            auto: input.tu_dong,
          }),
      }),

      hub_viral_nguon_sua: hubTool({
        id: 'hub_viral_nguon_sua',
        title: 'Bật/tắt tự cào hoặc xoá nguồn',
        level: 'dang',
        destructive: true,
        description: 'Đổi chế độ tự cào của một nguồn, hoặc xoá nguồn (xoa=true).',
        input: z.object({
          id: z.string(),
          tu_dong: z.boolean().optional(),
          xoa: z.boolean().optional(),
        }),
        run: async (input, org) => {
          if (input.xoa) {
            await this._viralService.deleteSource(org.id, input.id);
          } else if (input.tu_dong !== undefined) {
            await this._viralService.setSourceAuto(org.id, input.id, input.tu_dong);
          } else {
            throw new HubToolError('Truyền tu_dong hoặc xoa.');
          }
          return { ok: true };
        },
      }),

      hub_viral_chan_dung: hubTool({
        id: 'hub_viral_chan_dung',
        title: 'Chân dung khách hàng',
        level: 'doc',
        description:
          '8 chân dung phụ huynh / khách hàng mục tiêu (AI tự làm giàu sau mỗi lần cào) — dùng để viết đúng người đọc.',
        input: z.object({}),
        run: async (_i, org) => this._viralService.listPersonas(org.id),
      }),

      hub_group_fb_tong_quan: hubTool({
        id: 'hub_group_fb_tong_quan',
        title: 'Group Facebook — group & các kỳ cào',
        level: 'doc',
        description:
          'Khu Group Facebook (tách riêng phễu content): danh sách group đang theo dõi + các kỳ cào gần nhất kèm chủ đề đang hot và chủ đề nhiều người hỏi.',
        input: z.object({}),
        run: async (_i, org) => {
          const [groups, batches] = await Promise.all([
            this._groupService.listGroups(org.id),
            this._groupService.batches(org.id),
          ]);
          return { groups, ky_cao: batches.slice(0, 8) };
        },
      }),

      hub_group_fb_bai: hubTool({
        id: 'hub_group_fb_bai',
        title: 'Bài trong group Facebook',
        level: 'doc',
        description:
          'Bài đã cào từ các group Facebook (link bài, group, chủ đề, loại bài, lượt tương tác, bình luận tiêu biểu). Mặc định 30 ngày gần nhất, nhiều bình luận trước.',
        input: z.object({
          ky: z.string().optional().describe('id kỳ cào, hoặc "open" = bài chưa kết kỳ'),
          group_id: z.string().optional(),
          loai: z.enum(GROUP_POST_KINDS).optional().describe('hoi = câu hỏi của phụ huynh'),
          chu_de: z.string().optional().describe('Đúng nhãn chủ đề'),
          tim: z.string().optional().describe('Tìm trong nội dung / chủ đề'),
        }),
        run: async (input, org) => {
          const rows = await this._groupService.posts(org.id, {
            batch: input.ky,
            group: input.group_id,
            kind: input.loai,
            topic: input.chu_de,
            q: input.tim,
          });
          return { bai: rows.slice(0, LIST_LIMIT), con_nua: Math.max(0, rows.length - LIST_LIMIT) };
        },
      }),

      hub_group_fb_them_group: hubTool({
        id: 'hub_group_fb_them_group',
        title: 'Thêm / sửa group Facebook theo dõi',
        level: 'nhap',
        description:
          'Thêm group vào danh sách cào (trùng link thì cập nhật tên/khu vực). Muốn tạm dừng hoặc xoá group thì dùng tat_bat / xoa với id.',
        input: z.object({
          url: z.string().optional().describe('facebook.com/groups/...'),
          ten: z.string().optional(),
          khu_vuc: z.string().optional(),
          id: z.string().optional().describe('Group có sẵn (để bật/tắt/xoá)'),
          bat: z.boolean().optional(),
          xoa: z.boolean().optional(),
        }),
        run: async (input, org) => {
          if (input.id && input.xoa) {
            requireLevel(org, 'dang', 'xoá group');
            await this._groupService.deleteGroup(org.id, input.id);
            return { ok: true, da_xoa: input.id };
          }
          if (input.id) {
            await this._groupService.updateGroup(org.id, input.id, {
              name: input.ten,
              area: input.khu_vuc,
              active: input.bat,
            });
            return { ok: true, id: input.id };
          }
          if (!input.url) throw new HubToolError('Cần url (thêm mới) hoặc id (sửa).');
          const g = await this._groupService.addGroup(org.id, {
            url: input.url,
            name: input.ten,
            area: input.khu_vuc,
          });
          return { ok: true, id: g.id, ten: g.name, url: g.url };
        },
      }),

      hub_group_fb_lam_content: hubTool({
        id: 'hub_group_fb_lam_content',
        title: 'Đưa bài group sang phễu content',
        level: 'nhap',
        description:
          'Biến 1 bài group Facebook thành 1 content trong tab Chờ duyệt (AI tổng hợp + chấm điểm như bài thêm tay). Gọi lại với cùng bài thì trả content đã tạo.',
        input: z.object({ id: z.string() }),
        run: async (input, org) => this._groupService.toContent(org.id, input.id),
      }),

      hub_viral_ban_tin: hubTool({
        id: 'hub_viral_ban_tin',
        title: 'Bản tin viral tuần',
        level: 'doc',
        description: 'Các bản tin tuần đã gửi (xu hướng, động tĩnh đối thủ, gợi ý content).',
        input: z.object({}),
        run: async (_i, org) => this._viralService.listReports(org.id),
      }),
    };
  }
}
