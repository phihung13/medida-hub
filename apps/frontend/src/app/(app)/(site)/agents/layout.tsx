import { Metadata } from 'next';
import { Agent } from '@gitroom/frontend/components/agents/agent';
import { isFeaturePaused } from '@gitroom/helpers/utils/paused.features';
export const metadata: Metadata = {
  title: 'Social Hub - Agent',
  description: 'agents',
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Đặc tả v2 (15/10/2026): trang Agent chat tạm dừng — ẩn, không xoá.
  if (isFeaturePaused('agent-chat')) {
    return (
      <div className="flex flex-1 items-center justify-center p-[24px]">
        <div className="max-w-[460px] text-center flex flex-col gap-[8px] bg-newBgColorInner border border-newBgLineColor rounded-[12px] p-[24px]">
          <div className="text-[16px] font-[600]">Trang Agent chat đang tạm dừng</div>
          <div className="text-[13px] text-textItemBlur">
            Tạm dừng theo Đặc tả v2 (15/10/2026) đến khi rubric dự báo share
            chạy ổn. Agent ngoài qua MCP vẫn hoạt động bình thường.
          </div>
        </div>
      </div>
    );
  }
  return <Agent>{children}</Agent>;
}
