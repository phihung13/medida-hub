import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import dayjs from 'dayjs';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { SetsService } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.service';
import { SignatureService } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';
import {
  HubOrg,
  HubToolError,
  HubToolGroup,
  HubToolMap,
  MCP_AGENT,
  htmlToText,
  hubTool,
  requireLevel,
  toPostHtml,
} from '@gitroom/nestjs-libraries/chat/hub/hub.tool.helpers';

// ============================================================================
//  Nhóm "Bài & Lịch": xem lịch, tạo / sửa / đổi giờ / chuyển nháp↔lên lịch /
//  xoá bài, giờ trống, số liệu bài, ghi chú nội bộ, tag, mẫu bài, chữ ký.
//  Gọi đúng PostsService mà trình soạn dùng — kiểm hợp lệ y như giao diện.
// ============================================================================

const STATE_VI: Record<string, string> = {
  DRAFT: 'nhap',
  QUEUE: 'da_len_lich',
  PUBLISHED: 'da_dang',
  ERROR: 'loi',
};

const contentField = z
  .string()
  .describe(
    'Nội dung. Chữ thường (mỗi dòng thành một đoạn) hoặc HTML với các thẻ p, h1-h3, strong, u, ul, li.'
  );

const attachmentsField = z
  .array(z.string())
  .describe(
    'Link ảnh/video ĐÃ nằm trong thư viện Hub (lấy từ uploadFromUrlTool hoặc hub_media_danh_sach). Link ngoài phải tải lên trước.'
  );

const postSummary = (p: any) => ({
  id: p.id,
  nhom_bai: p.group,
  trang_thai: STATE_VI[p.state] || p.state,
  gio_dang: p.publishDate,
  kenh: p.integration
    ? {
        id: p.integration.id,
        ten: p.integration.name,
        nen_tang: p.integration.providerIdentifier,
      }
    : undefined,
  noi_dung: htmlToText(p.content).slice(0, 400),
  link_da_dang: p.releaseURL || undefined,
  tags: (p.tags || []).map((t: any) => t?.tag?.name).filter(Boolean),
  cach_tao: p.creationMethod,
});

@Injectable()
export class HubPostsTools implements HubToolGroup {
  constructor(
    private _postsService: PostsService,
    private _setsService: SetsService,
    private _signatureService: SignatureService,
    private _notificationService: NotificationService
  ) {}

  private async loadPost(org: HubOrg, postId: string) {
    const cur = await this._postsService
      .getPost(org.id, postId)
      .catch(() => null);
    if (!cur?.posts?.length) {
      throw new HubToolError(
        'Không tìm thấy bài (id phải là id bài chính — lấy từ hub_lich_xem / hub_bai_danh_sach).'
      );
    }
    return cur;
  }

  private settingsOf(list?: { key?: string; value?: any }[]) {
    return (list || []).reduce(
      (acc, s) => (s.key ? { ...acc, [s.key]: s.value } : acc),
      {} as Record<string, any>
    );
  }

  // Kiểm hợp lệ như POST /posts (settings kênh, media, độ dài) — nháp chỉ cần
  // không rỗng.
  private async validate(org: HubOrg, type: string, posts: any[]) {
    const validation = await this._postsService.validatePosts(org.id, posts);
    for (const item of validation) {
      if (item.emptyContent) {
        throw new HubToolError(
          `${item.name}: bài phải có ít nhất 1 ký tự hoặc 1 ảnh.`
        );
      }
      if (type === 'draft') continue;
      if (!item.valid) {
        throw new HubToolError(
          `${item.name}: ${item.settingsError || 'thiếu/sai cài đặt kênh'} — xem integrationSchema rồi truyền settings.`
        );
      }
      if (item.errors !== true) {
        throw new HubToolError(`${item.name}: ${item.errors}`);
      }
      if (item.tooLong) {
        throw new HubToolError(
          `${item.name}: quá dài (tối đa ${item.maximumCharacters} ký tự).`
        );
      }
    }
  }

  // DUYỆT 1 bài: kiểm hợp lệ như lúc lên lịch → (đặt giờ mới nếu có) → vào
  // hàng đăng. Giờ đăng ở quá khứ = workflow đăng NGAY (sleep 0).
  private async approvePost(org: HubOrg, postId: string, when?: dayjs.Dayjs) {
    const cur = await this.loadPost(org, postId);
    const first: any = cur.posts[0];
    if (first.state === 'PUBLISHED') throw new HubToolError('Bài đã đăng.');
    await this.validate(org, 'schedule', [
      {
        integration: { id: cur.integration },
        settings: cur.settings,
        value: cur.posts.map((p: any) => ({
          content: p.content,
          image: p.image || [],
        })),
      },
    ]);
    if (when) {
      await this._postsService.changeDate(org.id, first.id, when.toISOString(), 'update');
    }
    await this._postsService.changePostStatus(org.id, first.id, 'schedule');
    return {
      id: first.id,
      gio_dang: (when || dayjs(first.publishDate)).toISOString(),
    };
  }

  tools(): HubToolMap {
    return {
      hub_lich_xem: hubTool({
        id: 'hub_lich_xem',
        title: 'Xem lịch đăng',
        level: 'doc',
        description:
          'Liệt kê mọi bài trên Lịch trong một khoảng thời gian (tối đa 62 ngày): trạng thái, giờ đăng, kênh, nội dung rút gọn, link đã đăng.',
        input: z.object({
          tu_ngay: z.string().describe('Bắt đầu, ISO 8601 (vd 2026-10-13T00:00:00+07:00)'),
          den_ngay: z.string().describe('Kết thúc, ISO 8601'),
          khach_hang: z
            .string()
            .optional()
            .describe('id nhóm khách hàng (groupList) để lọc kênh'),
        }),
        run: async (input, org) => {
          const start = dayjs(input.tu_ngay);
          const end = dayjs(input.den_ngay);
          if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
            throw new HubToolError('Khoảng ngày không hợp lệ.');
          }
          if (end.diff(start, 'day') > 62) {
            throw new HubToolError('Tối đa 62 ngày mỗi lần xem.');
          }
          const posts = await this._postsService.getPosts(org.id, {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            customer: input.khach_hang as string,
          });
          return { so_bai: posts.length, bai: posts.map(postSummary) };
        },
      }),

      hub_bai_danh_sach: hubTool({
        id: 'hub_bai_danh_sach',
        title: 'Danh sách bài (phân trang)',
        level: 'doc',
        description:
          'Danh sách bài theo trạng thái (all | scheduled | draft | published), mới nhất trước, có phân trang.',
        input: z.object({
          trang_thai: z
            .enum(['all', 'scheduled', 'draft', 'published'])
            .default('all'),
          trang: z.number().int().min(0).default(0),
          so_luong: z.number().int().min(1).max(100).default(20),
          khach_hang: z.string().optional(),
        }),
        run: async (input, org) => {
          const res = expandPostsList(
            await this._postsService.getPostsList(org.id, {
              page: input.trang,
              limit: input.so_luong,
              state: input.trang_thai,
              customer: input.khach_hang,
            })
          );
          return {
            tong: res.total,
            trang: res.page,
            con_nua: res.hasMore,
            bai: (res.posts || []).map(postSummary),
          };
        },
      }),

      hub_bai_chi_tiet: hubTool({
        id: 'hub_bai_chi_tiet',
        title: 'Chi tiết một bài',
        level: 'doc',
        description:
          'Toàn văn một bài: nội dung chính + các comment đầu (thread), media, cài đặt kênh, tag, trạng thái, lỗi nếu có.',
        input: z.object({ id: z.string().describe('id bài') }),
        run: async (input, org) => {
          const cur = await this.loadPost(org, input.id);
          const first: any = cur.posts[0];
          return {
            id: first.id,
            nhom_bai: cur.group,
            trang_thai: STATE_VI[first.state] || first.state,
            gio_dang: first.publishDate,
            kenh: first.integration
              ? {
                  id: first.integration.id,
                  ten: first.integration.name,
                  nen_tang: first.integration.providerIdentifier,
                }
              : { id: cur.integration },
            tags: (first.tags || []).map((t: any) => t?.tag?.name).filter(Boolean),
            cai_dat_kenh: cur.settings,
            link_da_dang: first.releaseURL || undefined,
            loi: first.error || undefined,
            noi_dung: cur.posts.map((p: any, i: number) => ({
              id: p.id,
              vai_tro: i === 0 ? 'bai_chinh' : `comment_${i}`,
              html: p.content,
              media: (p.image || []).map((m: any) => ({
                id: m.id,
                path: m.path,
                an: m.hidden || undefined,
              })),
            })),
          };
        },
      }),

      hub_bai_tao: hubTool({
        id: 'hub_bai_tao',
        title: 'Tạo bài (nháp / lên lịch / đăng ngay)',
        level: 'nhap',
        description: `Tạo bài cho một hoặc nhiều kênh cùng lúc (mỗi kênh một bài, chung nội dung).
- loai "draft": nháp trên Lịch, người duyệt sẽ xem rồi đăng (đủ với khoá "tạo nháp").
- loai "schedule" / "now": lên lịch / đăng ngay THẬT — cần khoá "được đăng".
Kênh có cài đặt bắt buộc (YouTube: tiêu đề; Pinterest: board…) thì gọi integrationSchema trước rồi truyền cai_dat. Bỏ trống gio_dang thì Hub chọn giờ trống kế tiếp của kênh.`,
        input: z.object({
          kenh: z.array(z.string()).min(1).describe('Danh sách id kênh (integrationList)'),
          noi_dung: contentField,
          comment_dau: z
            .array(z.string())
            .optional()
            .describe('Comment tự đăng ngay dưới bài (hoặc các bài nối thread với X/Threads)'),
          media: attachmentsField.optional(),
          loai: z.enum(['draft', 'schedule', 'now']).default('draft'),
          gio_dang: z.string().optional().describe('ISO 8601, vd 2026-10-14T19:30:00+07:00'),
          tags: z.array(z.string()).optional().describe('Tên tag có sẵn (hub_tag_danh_sach)'),
          rut_gon_link: z.boolean().default(false),
          cai_dat: z
            .array(z.object({ key: z.string(), value: z.any() }))
            .optional()
            .describe('Cài đặt riêng của kênh theo integrationSchema (áp cho mọi kênh trong lần gọi)'),
        }),
        run: async (input, org) => {
          if (input.loai !== 'draft') {
            requireLevel(org, 'dang', 'lên lịch / đăng ngay');
          }
          const settings = this.settingsOf(input.cai_dat);
          const value = [input.noi_dung, ...(input.comment_dau || [])].map(
            (c, i) => ({
              id: makeId(10),
              content: toPostHtml(c),
              delay: 0,
              image:
                i === 0
                  ? (input.media || []).map((path) => ({ id: makeId(10), path }))
                  : [],
            })
          );
          const posts = input.kenh.map((id) => ({
            integration: { id },
            group: makeId(10),
            settings,
            value,
          }));
          await this.validate(org, input.loai, posts);

          const out: any[] = [];
          for (const post of posts) {
            const date =
              input.loai === 'now'
                ? dayjs().toISOString()
                : input.gio_dang
                ? dayjs(input.gio_dang).toISOString()
                : await this._postsService.findFreeDateTime(
                    org.id,
                    post.integration.id
                  );
            const body = await this._postsService.mapTypeToPost(
              {
                type: input.loai,
                date,
                shortLink: input.rut_gon_link,
                tags: (input.tags || []).map((t) => ({ value: t, label: t })),
                posts: [post],
              } as any,
              org.id
            );
            out.push(
              ...(await this._postsService.createPost(
                org.id,
                body,
                'MCP',
                MCP_AGENT
              ))
            );
          }
          return {
            ok: true,
            loai: input.loai,
            bai: out.map((p) => ({ id: p.postId, kenh: p.integration })),
          };
        },
      }),

      hub_bai_sua: hubTool({
        id: 'hub_bai_sua',
        title: 'Sửa bài',
        level: 'nhap',
        description: `Sửa nội dung / comment đầu / media / cài đặt kênh / tag của một bài. Chỉ truyền phần muốn đổi.
Sửa bài NHÁP hoặc bài LỖI: khoá "tạo nháp" (bài lỗi sau khi sửa thành nháp). Sửa bài ĐÃ LÊN LỊCH: khoá "được đăng". Bài ĐÃ ĐĂNG không sửa được ở đây.`,
        input: z.object({
          id: z.string(),
          noi_dung: contentField.optional(),
          comment_dau: z
            .array(z.string())
            .optional()
            .describe('Thay TOÀN BỘ comment đầu bằng danh sách này ([] = xoá hết)'),
          media: attachmentsField.optional().describe('Thay toàn bộ media của bài chính'),
          tags: z.array(z.string()).optional().describe('Thay toàn bộ tag'),
          cai_dat: z
            .array(z.object({ key: z.string(), value: z.any() }))
            .optional()
            .describe('Gộp vào cài đặt kênh hiện có'),
        }),
        run: async (input, org) => {
          const cur = await this.loadPost(org, input.id);
          const first: any = cur.posts[0];
          if (first.state === 'PUBLISHED') {
            throw new HubToolError('Bài đã đăng — không sửa qua MCP được.');
          }
          if (first.state === 'QUEUE') {
            requireLevel(org, 'dang', 'sửa bài đã lên lịch');
          }
          const type = first.state === 'QUEUE' ? 'schedule' : 'draft';

          const existing = cur.posts.map((p: any) => ({
            id: p.id,
            content: p.content,
            delay: p.delay || 0,
            image: p.image || [],
          }));
          const main = {
            ...existing[0],
            ...(input.noi_dung != null
              ? { content: toPostHtml(input.noi_dung) }
              : {}),
            ...(input.media
              ? { image: input.media.map((path) => ({ id: makeId(10), path })) }
              : {}),
          };
          const comments = input.comment_dau
            ? input.comment_dau.map((c, i) => ({
                // giữ id dòng cũ ở cùng vị trí → sửa tại chỗ, không tạo bài mới
                ...(existing[i + 1] ? { id: existing[i + 1].id } : {}),
                content: toPostHtml(c),
                delay: existing[i + 1]?.delay || 0,
                image: existing[i + 1]?.image || [],
              }))
            : existing.slice(1);

          const post = {
            integration: { id: cur.integration },
            group: cur.group,
            settings: { ...cur.settings, ...this.settingsOf(input.cai_dat) },
            value: [main, ...comments],
          };
          await this.validate(org, type, [post]);

          const tags = (
            input.tags ||
            (first.tags || []).map((t: any) => t?.tag?.name).filter(Boolean)
          ).map((t: string) => ({ value: t, label: t }));
          const body = await this._postsService.mapTypeToPost(
            {
              type,
              date: dayjs(first.publishDate).toISOString(),
              shortLink: false,
              tags,
              posts: [post],
            } as any,
            org.id
          );
          await this._postsService.createPost(org.id, body, 'MCP', MCP_AGENT);
          return { ok: true, id: first.id, trang_thai: STATE_VI[first.state] === 'loi' ? 'nhap' : STATE_VI[first.state] };
        },
      }),

      hub_bai_doi_gio: hubTool({
        id: 'hub_bai_doi_gio',
        title: 'Đổi giờ đăng',
        level: 'nhap',
        description:
          'Đổi giờ đăng của một bài. Bài nháp giữ là nháp (khoá "tạo nháp"); bài đã lên lịch được lên lịch lại theo giờ mới (khoá "được đăng").',
        input: z.object({
          id: z.string(),
          gio_dang: z.string().describe('ISO 8601'),
        }),
        run: async (input, org) => {
          const cur = await this.loadPost(org, input.id);
          const first: any = cur.posts[0];
          if (first.state === 'PUBLISHED') {
            throw new HubToolError('Bài đã đăng — không đổi giờ được.');
          }
          const when = dayjs(input.gio_dang);
          if (!when.isValid()) throw new HubToolError('Giờ không hợp lệ.');
          if (first.state === 'DRAFT') {
            await this._postsService.changeDate(org.id, first.id, when.toISOString(), 'update');
          } else {
            requireLevel(org, 'dang', 'đổi giờ bài đã lên lịch');
            await this._postsService.changeDate(org.id, first.id, when.toISOString(), 'schedule');
          }
          return { ok: true, id: first.id, gio_dang: when.toISOString() };
        },
      }),

      hub_bai_trang_thai: hubTool({
        id: 'hub_bai_trang_thai',
        title: 'Chuyển nháp ↔ lên lịch',
        level: 'nhap',
        description:
          'Chuyển bài sang "draft" (gỡ khỏi hàng đăng — khoá "tạo nháp") hoặc "schedule" (đưa vào hàng đăng theo giờ đã đặt — khoá "được đăng"). Đây là bước "duyệt" bài nháp do agent làm.',
        input: z.object({
          id: z.string(),
          trang_thai: z.enum(['draft', 'schedule']),
        }),
        run: async (input, org) => {
          const cur = await this.loadPost(org, input.id);
          const first: any = cur.posts[0];
          if (first.state === 'PUBLISHED') {
            throw new HubToolError('Bài đã đăng.');
          }
          if (input.trang_thai === 'schedule') {
            requireLevel(org, 'dang', 'đưa bài vào hàng đăng');
            await this.validate(org, 'schedule', [
              {
                integration: { id: cur.integration },
                settings: cur.settings,
                value: cur.posts.map((p: any) => ({
                  content: p.content,
                  image: p.image || [],
                })),
              },
            ]);
          }
          return this._postsService.changePostStatus(
            org.id,
            first.id,
            input.trang_thai
          );
        },
      }),

      hub_bai_dang_ngay: hubTool({
        id: 'hub_bai_dang_ngay',
        title: 'Đăng ngay bài nháp',
        level: 'dang',
        destructive: true,
        openWorld: true,
        description:
          'ĐĂNG THẬT ngay bây giờ một bài đang là nháp (hoặc đã lên lịch / bị lỗi): kiểm hợp lệ theo luật kênh, đặt giờ = bây giờ, đưa vào hàng đăng — hệ thống đăng trong khoảng 1 phút. Chỉ gọi khi người dùng nói rõ "đăng ngay".',
        input: z.object({
          id: z.string().describe('id bài chính (hub_lich_xem / hub_bai_danh_sach)'),
        }),
        run: async (input, org) => {
          const res = await this.approvePost(org, input.id, dayjs());
          return {
            ok: true,
            ...res,
            ghi_chu: 'Đã vào hàng đăng ngay — xem kết quả bằng hub_bai_chi_tiet sau 1-2 phút.',
          };
        },
      }),

      hub_bai_duyet_hang_loat: hubTool({
        id: 'hub_bai_duyet_hang_loat',
        title: 'Duyệt hàng loạt bài nháp',
        level: 'dang',
        openWorld: true,
        description:
          'Duyệt nhiều bài nháp cùng lúc (≤ 50): mỗi bài được kiểm hợp lệ rồi đưa vào hàng đăng theo giờ đã đặt trên bài. Bài có giờ đăng đã QUA: gio_qua="bo_qua" (mặc định) bỏ qua, "dang_ngay" đăng luôn, "gio_trong" dời sang giờ trống kế tiếp của kênh. Một bài lỗi không chặn các bài khác; kết quả trả từng bài.',
        input: z.object({
          ids: z.array(z.string()).min(1).max(50),
          gio_qua: z.enum(['bo_qua', 'dang_ngay', 'gio_trong']).optional(),
        }),
        run: async (input, org) => {
          const mode = input.gio_qua || 'bo_qua';
          const ket_qua: any[] = [];
          for (const id of input.ids) {
            try {
              const cur = await this.loadPost(org, id);
              const first: any = cur.posts[0];
              let when: dayjs.Dayjs | undefined;
              if (dayjs(first.publishDate).isBefore(dayjs())) {
                if (mode === 'bo_qua') {
                  ket_qua.push({
                    id,
                    ok: false,
                    loi: 'Giờ đăng đã qua — bỏ qua (truyền gio_qua để xử lý).',
                  });
                  continue;
                }
                if (mode === 'gio_trong') {
                  // giờ trống trả dạng UTC không hậu tố (như viral.service)
                  when = dayjs(
                    (await this._postsService.findFreeDateTime(org.id, cur.integration)) + 'Z'
                  );
                }
              }
              const res = await this.approvePost(org, id, when);
              ket_qua.push({ ok: true, ...res });
            } catch (e: any) {
              ket_qua.push({ id, ok: false, loi: e?.message || 'Lỗi' });
            }
          }
          return {
            da_duyet: ket_qua.filter((x) => x.ok).length,
            loi: ket_qua.filter((x) => !x.ok).length,
            ket_qua,
          };
        },
      }),

      hub_bai_xoa: hubTool({
        id: 'hub_bai_xoa',
        title: 'Xoá bài',
        level: 'dang',
        destructive: true,
        description:
          'Xoá một bài (kèm các comment đầu của nó) khỏi Lịch và huỷ lịch đăng. Bài đã đăng trên mạng xã hội KHÔNG bị gỡ.',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const cur = await this.loadPost(org, input.id);
          await this._postsService.deletePost(org.id, cur.group);
          return { ok: true, da_xoa: input.id };
        },
      }),

      hub_gio_trong: hubTool({
        id: 'hub_gio_trong',
        title: 'Tìm giờ trống',
        level: 'doc',
        description:
          'Giờ trống kế tiếp theo khung giờ đăng đã cài của kênh (hoặc của cả tổ chức nếu bỏ trống kênh).',
        input: z.object({ kenh: z.string().optional() }),
        run: async (input, org) => ({
          gio_trong: await this._postsService.findFreeDateTime(
            org.id,
            input.kenh
          ),
        }),
      }),

      hub_bai_so_lieu: hubTool({
        id: 'hub_bai_so_lieu',
        title: 'Số liệu một bài đã đăng',
        level: 'doc',
        openWorld: true,
        description:
          'Lượt xem / tương tác của một bài đã đăng (lấy từ mạng xã hội) + lượt bấm link rút gọn.',
        input: z.object({
          id: z.string(),
          so_ngay: z.number().int().min(1).max(365).default(7),
        }),
        run: async (input, org) => {
          const [social, clicks] = await Promise.all([
            this._postsService
              .checkPostAnalytics(org.id, input.id, input.so_ngay)
              .catch((e: any) => ({ loi: e?.message })),
            this._postsService
              .getStatistics(org.id, input.id)
              .catch(() => null),
          ]);
          return { mang_xa_hoi: social, link_rut_gon: clicks };
        },
      }),

      hub_ghi_chu_xem: hubTool({
        id: 'hub_ghi_chu_xem',
        title: 'Xem ghi chú nội bộ của bài',
        level: 'doc',
        description:
          'Ghi chú nội bộ của đội trên một bài (trao đổi duyệt bài — KHÔNG phải comment trên mạng xã hội).',
        input: z.object({ id: z.string() }),
        run: async (input, org) => {
          const post = await this._postsService.getPostById(input.id, org.id);
          if (!post) throw new HubToolError('Không tìm thấy bài.');
          const list = await this._postsService.getComments(input.id);
          return list
            .filter((c: any) => !c.deletedAt)
            .map((c: any) => ({
              id: c.id,
              noi_dung: c.content,
              nguoi_viet: c.userId,
              luc: c.createdAt,
            }));
        },
      }),

      hub_ghi_chu_them: hubTool({
        id: 'hub_ghi_chu_them',
        title: 'Thêm ghi chú nội bộ',
        level: 'nhap',
        description:
          'Thêm ghi chú nội bộ vào một bài (vd lý do cần sửa, gợi ý cho người duyệt). Ghi dưới tên người đã tạo khoá MCP.',
        input: z.object({
          id: z.string(),
          noi_dung: z.string().min(1).max(4000),
        }),
        run: async (input, org) => {
          if (!org.mcpUserId) {
            throw new HubToolError(
              'Ghi chú cần biết người viết — dùng khoá MCP riêng (Cài đặt → Kết nối agent MCP), không dùng API key tổ chức.'
            );
          }
          const post = await this._postsService.getPostById(input.id, org.id);
          if (!post) throw new HubToolError('Không tìm thấy bài.');
          const c = await this._postsService.createComment(
            org.id,
            org.mcpUserId,
            input.id,
            input.noi_dung
          );
          return { ok: true, id: c.id };
        },
      }),

      hub_tag_danh_sach: hubTool({
        id: 'hub_tag_danh_sach',
        title: 'Danh sách tag',
        level: 'doc',
        description: 'Các tag (nhãn bài) của tổ chức.',
        input: z.object({}),
        run: async (_i, org) =>
          (await this._postsService.getTags(org.id)).map((t: any) => ({
            id: t.id,
            ten: t.name,
            mau: t.color,
          })),
      }),

      hub_tag_tao: hubTool({
        id: 'hub_tag_tao',
        title: 'Tạo tag',
        level: 'nhap',
        description: 'Tạo tag mới.',
        input: z.object({
          ten: z.string().min(1).max(50),
          mau: z.string().default('#612BD3').describe('Mã màu hex'),
        }),
        run: async (input, org) => {
          const t = await this._postsService.createTag(org.id, {
            name: input.ten,
            color: input.mau,
          } as any);
          return { ok: true, id: t.id };
        },
      }),

      hub_mau_bai: hubTool({
        id: 'hub_mau_bai',
        title: 'Mẫu bài & chữ ký',
        level: 'doc',
        description:
          'Các mẫu bài (sets — bộ kênh + nội dung soạn sẵn) và chữ ký có sẵn của tổ chức, để agent bám giọng văn / định dạng.',
        input: z.object({}),
        run: async (_i, org) => {
          const [sets, signatures] = await Promise.all([
            this._setsService.getSets(org.id),
            this._signatureService.getSignaturesByOrgId(org.id),
          ]);
          return {
            mau_bai: sets.map((s: any) => ({
              id: s.id,
              ten: s.name,
              noi_dung: (() => {
                try {
                  return JSON.parse(s.content);
                } catch {
                  return s.content;
                }
              })(),
            })),
            chu_ky: signatures.map((s: any) => ({
              id: s.id,
              mac_dinh: s.autoAdd,
              noi_dung: htmlToText(s.content),
            })),
          };
        },
      }),

      hub_thong_bao: hubTool({
        id: 'hub_thong_bao',
        title: 'Thông báo của Hub',
        level: 'doc',
        description:
          'Thông báo gần đây của tổ chức (bài đăng lỗi, kênh mất kết nối, bài đã đăng…).',
        input: z.object({ trang: z.number().int().min(0).default(0) }),
        run: async (input, org) =>
          this._notificationService.getNotificationsPaginated(
            org.id,
            input.trang
          ),
      }),
    };
  }
}
