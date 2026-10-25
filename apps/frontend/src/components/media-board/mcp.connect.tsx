'use client';

import { FC, ReactNode, useCallback, useState } from 'react';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { resolveBaseUrl } from '@gitroom/helpers/utils/custom.fetch.func';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  KEY_PLACEHOLDER,
  MCP_LEVELS,
  McpLevel,
  SAMPLE_PROMPTS,
  TEST_EXPECT,
  buildMcpGuide,
  mcpClients,
  testCommands,
} from '@gitroom/frontend/components/media-board/mcp.guide';
import { Field, Sheet, btnCls, inputCls } from '@gitroom/frontend/components/media-board/ui';

// ============================================================================
//  "Kết nối agent AI (MCP)" — khung kín đáo trong Bảng sản xuất: tạo khoá MCP
//  (dùng chung API /mcp-keys của Cài đặt, chỉ quản trị viên tổ chức), chọn
//  ứng dụng để lấy cấu hình điền sẵn khoá, lệnh kiểm tra, câu lệnh mẫu, và
//  chép / tải file hướng dẫn trọn bộ (có khoá) — kiểu nút Connect của Supabase.
// ============================================================================

const isAdmin = (role?: string) => role === 'ADMIN' || role === 'SUPERADMIN';

const Step: FC<{ n: number; title: string; children: ReactNode }> = ({ n, title, children }) => (
  <section className="flex flex-col gap-[10px]">
    <h3 className="m-0 flex items-center gap-[8px] text-[14px] font-[700]">
      <span className="w-[22px] h-[22px] rounded-full bg-btnPrimary text-white text-[12px] flex items-center justify-center shrink-0">
        {n}
      </span>
      {title}
    </h3>
    <div className="flex flex-col gap-[10px] ps-[30px] max-[520px]:ps-0">{children}</div>
  </section>
);

const CodeBlock: FC<{ code: string; onCopy: (s: string) => void; label?: string }> = ({ code, onCopy, label }) => (
  <div className="relative">
    <pre className="m-0 font-mono text-[12px] leading-[1.55] bg-newBgColor border border-newBgLineColor rounded-[8px] p-[12px] pe-[72px] overflow-x-auto whitespace-pre">
      {code}
    </pre>
    <button
      type="button"
      onClick={() => onCopy(code)}
      aria-label={label || 'Chép'}
      className={clsx(btnCls('default', true), 'absolute top-[8px] end-[8px]')}
    >
      Chép
    </button>
  </div>
);

const Tabs: FC<{ items: { id: string; name: string }[]; value: string; onChange: (id: string) => void; label: string }> = ({
  items,
  value,
  onChange,
  label,
}) => (
  <div role="tablist" aria-label={label} className="flex flex-wrap gap-[6px]">
    {items.map((x) => (
      <button
        key={x.id}
        type="button"
        role="tab"
        aria-selected={value === x.id}
        onClick={() => onChange(x.id)}
        className={clsx(
          'px-[10px] py-[5px] rounded-full text-[12.5px] font-[600] border transition-colors',
          value === x.id
            ? 'bg-btnPrimary border-btnPrimary text-white'
            : 'bg-newBgColorInner border-newBgLineColor text-textItemBlur hover:text-textColor'
        )}
      >
        {x.name}
      </button>
    ))}
  </div>
);

export const McpConnectSheet: FC<{ onClose: () => void }> = ({ onClose }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const { backendUrl, mcpUrl } = useVariables();
  const endpoint = `${resolveBaseUrl(mcpUrl || backendUrl)}/mcp`;
  const admin = isAdmin((user as any)?.role);

  const [name, setName] = useState('Agent Bảng sản xuất');
  const [level, setLevel] = useState<McpLevel>('nhap');
  const [key, setKey] = useState('');
  const [keyLevel, setKeyLevel] = useState<McpLevel | undefined>();
  const [keyName, setKeyName] = useState('');
  const [pasted, setPasted] = useState('');
  const [creating, setCreating] = useState(false);
  const [client, setClient] = useState('claude-code');
  const [testTab, setTestTab] = useState('powershell');

  const copyText = useCallback(
    (text: string) => {
      copy(text);
      toaster.show('Đã chép', 'success');
    },
    [toaster]
  );

  const createKey = async () => {
    setCreating(true);
    try {
      const res = await fetch('/mcp-keys', { method: 'POST', body: JSON.stringify({ name, level }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.key) {
        toaster.show(data?.message || 'Chưa tạo được khoá, thử lại sau.', 'warning');
        return;
      }
      setKey(data.key);
      setKeyLevel(level);
      setKeyName(name);
    } finally {
      setCreating(false);
    }
  };

  const usePasted = () => {
    const k = pasted.trim();
    if (!/^hub_mcp_[0-9a-f]{20,}$/i.test(k)) {
      toaster.show('Khoá MCP có dạng hub_mcp_… — kiểm tra lại.', 'warning');
      return;
    }
    setKey(k);
    setKeyLevel(undefined);
    setKeyName('');
  };

  const clients = mcpClients(endpoint, key);
  const cur = clients.find((c) => c.id === client) || clients[0];
  const tests = testCommands(endpoint, key);
  const curTest = tests.find((x) => x.id === testTab) || tests[0];
  const guide = () =>
    buildMcpGuide({
      endpoint,
      key,
      keyName,
      level: keyLevel,
      boardUrl: typeof window !== 'undefined' ? `${window.location.origin}/media-board` : undefined,
      date: new Date().toLocaleString('vi-VN'),
    });

  const download = () => {
    const blob = new Blob([guide()], { type: 'text/markdown;charset=utf-8' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'ket-noi-mcp-media-hub.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  };

  return (
    <Sheet onClose={onClose} wide>
      <div className="flex flex-col gap-[4px]">
        <h2 className="m-0 text-[17px] font-[800]">Kết nối agent AI (MCP)</h2>
        <p className="m-0 text-[12.5px] text-textItemBlur leading-[1.6]">
          Cho Claude, Cursor, VS Code, n8n, Hermes… đọc và thao tác Bảng sản xuất (thêm thẻ, xếp lịch dựng, chuyển cột, tạo bản cắt…)
          bằng lời. Agent bị kiểm đúng các luật như khi bấm trên trang.
        </p>
      </div>

      <Step n={1} title="Khoá kết nối">
        {key ? (
          <div role="status" className="flex flex-col gap-[8px] p-[12px] rounded-[8px] border border-btnPrimary">
            <div className="text-[13px] font-[600]">
              {keyLevel ? 'Khoá mới — chỉ hiện ĐÚNG MỘT LẦN. Chép hoặc tải file hướng dẫn bên dưới ngay.' : 'Đang dùng khoá bạn dán.'}
            </div>
            <CodeBlock code={key} onCopy={copyText} label="Chép khoá" />
            <div className="flex flex-wrap items-center gap-[8px] text-[12px] text-textItemBlur">
              {keyLevel && (
                <span>
                  {keyName} · quyền <b className="text-textColor">{MCP_LEVELS[keyLevel].label}</b>
                </span>
              )}
              <span className="flex-1" />
              <button type="button" className="text-btnPrimary font-[600] hover:underline" onClick={() => setKey('')}>
                Dùng khoá khác
              </button>
            </div>
          </div>
        ) : (
          <>
            {admin ? (
              <div className="flex flex-col gap-[8px]">
                <div className="flex flex-wrap items-end gap-[8px]">
                  <Field label="Tên agent" htmlFor="mcp-name" className="flex-[1_1_200px]">
                    <input id="mcp-name" className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="Mức quyền" htmlFor="mcp-level">
                    <select id="mcp-level" className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as McpLevel)}>
                      {(Object.keys(MCP_LEVELS) as McpLevel[]).map((l) => (
                        <option key={l} value={l}>
                          {MCP_LEVELS[l].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" className={btnCls('primary')} disabled={creating || !name.trim()} onClick={createKey}>
                    {creating ? 'Đang tạo…' : 'Tạo khoá'}
                  </button>
                </div>
                <div className={clsx('text-[12px] leading-[1.6]', level === 'dang' ? 'text-[#FF5A52]' : 'text-textItemBlur')}>
                  {MCP_LEVELS[level].hint} Khoá dùng cho cả Hub, không riêng Bảng sản xuất — chọn mức vừa đủ, nên bắt đầu bằng “Tạo nháp”.
                </div>
              </div>
            ) : (
              <div className="text-[12.5px] bg-[#E8A33D]/15 text-[#D08A22] rounded-[8px] px-[11px] py-[9px]">
                Chỉ quản trị viên tổ chức tạo được khoá. Nhờ quản trị viên tạo rồi gửi riêng cho bạn, sau đó dán vào ô dưới.
              </div>
            )}
            <div className="flex flex-wrap items-end gap-[8px]">
              <Field label="Đã có khoá? Dán vào đây để điền sẵn hướng dẫn" htmlFor="mcp-paste" className="flex-[1_1_260px]">
                <input
                  id="mcp-paste"
                  className={clsx(inputCls, 'font-mono')}
                  placeholder="hub_mcp_…"
                  value={pasted}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setPasted(e.target.value)}
                />
              </Field>
              <button type="button" className={btnCls()} disabled={!pasted.trim()} onClick={usePasted}>
                Dùng khoá này
              </button>
            </div>
          </>
        )}
        <div className="text-[12px] text-textItemBlur">
          Địa chỉ MCP: <code className="font-mono text-textColor">{endpoint}</code> · Xem / thu hồi khoá:{' '}
          <a href="/settings" className="text-btnPrimary font-[600] hover:underline">
            Cài đặt → Kết nối agent MCP
          </a>
        </div>
      </Step>

      <Step n={2} title="Cắm vào ứng dụng">
        <Tabs items={clients} value={cur.id} onChange={setClient} label="Chọn ứng dụng" />
        <ol className="m-0 ps-[18px] flex flex-col gap-[4px] text-[13px] leading-[1.55]">
          {cur.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <CodeBlock code={cur.code} onCopy={copyText} />
        {cur.note && <div className="text-[12px] text-[#D08A22]">{cur.note}</div>}
        {!key && (
          <div className="text-[12px] text-textItemBlur">
            Chưa có khoá: cấu hình đang để chỗ trống <code className="font-mono">{KEY_PLACEHOLDER}</code>.
          </div>
        )}
      </Step>

      <Step n={3} title="Kiểm tra kết nối (không bắt buộc)">
        <Tabs items={tests} value={curTest.id} onChange={setTestTab} label="Chọn hệ điều hành" />
        <CodeBlock code={curTest.code} onCopy={copyText} />
        <div className="text-[12px] text-textItemBlur leading-[1.6]">{TEST_EXPECT}</div>
      </Step>

      <Step n={4} title="Thử ra lệnh cho agent">
        <ul className="m-0 p-0 list-none flex flex-col gap-[6px]">
          {SAMPLE_PROMPTS.map((p) => (
            <li key={p} className="flex gap-[8px] items-start text-[13px] leading-[1.5]">
              <span className="flex-1 bg-newBgColor rounded-[6px] px-[10px] py-[6px]">{p}</span>
              <button type="button" className={btnCls('default', true)} onClick={() => copyText(p)}>
                Chép
              </button>
            </li>
          ))}
        </ul>
      </Step>

      <div className="sticky bottom-[-20px] -mx-[20px] -mb-[20px] mt-auto bg-newBgColorInner border-t border-newBgLineColor px-[20px] py-[12px] flex flex-wrap items-center gap-[8px]">
        <span className="flex-1 min-w-[200px] text-[12px] text-textItemBlur">
          {key
            ? 'File hướng dẫn A–Z có điền sẵn khoá — giữ kín như mật khẩu.'
            : 'File hướng dẫn A–Z (chưa có khoá — tạo hoặc dán khoá ở bước 1 để điền sẵn).'}
        </span>
        <button type="button" className={btnCls()} onClick={() => copyText(guide())}>
          Chép toàn bộ hướng dẫn
        </button>
        <button type="button" className={btnCls('primary')} onClick={download}>
          Tải file .md
        </button>
      </div>
    </Sheet>
  );
};
