'use client';

import { withContinueProvider } from '../with-continue-provider';

interface ZaloVideoChannel {
  id: string;
  name: string;
  picture?: string;
  oaId?: string | null;
}

interface ZaloVideoSelection {
  id: string;
}

// Một tài khoản Zalo quản trị nhiều OA, mỗi OA có một kênh Zalo Video. Tick
// một hay nhiều kênh — mỗi kênh thành một kênh riêng trên Hub; lúc đăng bot tự
// chuyển Creator Center sang đúng kênh.
export const ZaloVideoContinue = withContinueProvider<
  ZaloVideoChannel,
  ZaloVideoSelection
>({
  endpoint: 'pages',
  swrKey: 'load-zalo-video-channels',
  titleKey: 'zalo_video_select_channels',
  titleDefault: 'Chọn kênh Zalo Video:',
  emptyStateMessages: [
    {
      key: 'zalo_video_no_channels',
      text: 'Tài khoản Zalo này chưa quản lý kênh Zalo Video nào.',
    },
    {
      key: 'zalo_video_no_channels_hint',
      text: 'Kiểm tra tài khoản đã là quản trị viên OA có kênh Zalo Video, rồi thử lại.',
    },
  ],
  getItemId: (item) => item.id,
  getSelectionValue: (item) => ({ id: item.id }),
  transformSaveData: (selection) => selection,
  multiple: true,
  isSelected: (item, selection) => selection?.id === item.id,
  renderItem: (item) => (
    <>
      <div className="flex justify-center">
        {item.picture ? (
          <img
            className="w-[64px] h-[64px] rounded-full object-cover"
            src={item.picture}
            alt=""
          />
        ) : (
          <div className="w-[64px] h-[64px] rounded-full bg-input flex items-center justify-center text-[20px] font-[600]">
            {item.name.trim().charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="text-[13px] font-medium leading-[1.3]">{item.name}</div>
    </>
  ),
});
