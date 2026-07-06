// Dữ liệu mẫu cho demo Việt Anh Media Hub.
// Trong hệ thật, danh sách nhóm Zalo + ánh xạ kênh này nằm trong Postgres,
// được sửa qua trang "Nhóm Zalo" và worker đọc để biết nghe nhóm nào.

export const CHANNELS = {
  fb_viet_anh: { id: 'fb_viet_anh', name: 'Facebook · Trường Việt Anh', kind: 'facebook' },
  fb_thpt: { id: 'fb_thpt', name: 'Facebook · THPT Việt Anh', kind: 'facebook' },
  zalo_oa_ts: { id: 'zalo_oa_ts', name: 'Zalo OA · Tuyển sinh Việt Anh', kind: 'zalo' },
  gbp: { id: 'gbp', name: 'Google Business · Việt Anh', kind: 'google' },
};

// Các nhóm Zalo mà worker "nghe". enabled = worker có hứng media từ nhóm đó không.
export const DEFAULT_GROUPS = [
  {
    id: 'g_sukien',
    name: 'Nhóm Zalo · Sự kiện Trường',
    emoji: '🎉',
    enabled: true,
    tone: 'trang trọng, tự hào, cổ vũ tinh thần',
    channels: ['fb_viet_anh', 'gbp'],
  },
  {
    id: 'g_hoatdong',
    name: 'Nhóm Zalo · Hoạt động Học sinh',
    emoji: '📚',
    enabled: true,
    tone: 'gần gũi, tươi vui, khích lệ học sinh',
    channels: ['fb_thpt', 'fb_viet_anh'],
  },
  {
    id: 'g_tuyensinh',
    name: 'Nhóm Zalo · Tuyển sinh 2026',
    emoji: '📢',
    enabled: false,
    tone: 'kêu gọi, rõ ràng, có thông tin liên hệ',
    channels: ['zalo_oa_ts', 'fb_viet_anh'],
  },
];

export function channelName(id) {
  return CHANNELS[id]?.name || id;
}
