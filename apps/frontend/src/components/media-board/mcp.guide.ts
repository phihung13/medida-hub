// ============================================================================
//  Hướng dẫn kết nối agent AI (MCP) cho Bảng sản xuất Media — MỘT nguồn dữ
//  liệu cho cả khung "Kết nối agent" trên trang lẫn file .md tải về (file có
//  điền sẵn khoá). Địa chỉ + cách gửi khoá khớp start.mcp.ts:
//    • {endpoint}            header Authorization: Bearer hub_mcp_…
//    • {endpoint}/{khoá}     cho client không gửi được header
//  (route /sse/ cũ không nhận khoá MCP nên không hướng dẫn.)
// ============================================================================

export type McpLevel = 'doc' | 'nhap' | 'dang';

export const MCP_LEVELS: Record<McpLevel, { label: string; hint: string }> = {
  doc: {
    label: 'Chỉ đọc',
    hint: 'Agent xem bảng: tổng quan, danh sách, lịch dựng, luồng, xuất CSV. Không sửa gì.',
  },
  nhap: {
    label: 'Tạo nháp',
    hint: 'Thêm: tạo/sửa thẻ, chuyển cột, xếp lịch dựng, tạo bản cắt. Không tự duyệt được — thẻ dừng ở “Chờ duyệt” cho người duyệt.',
  },
  dang: {
    label: 'Được đăng',
    hint: 'Toàn quyền: thêm duyệt video, xoá thẻ, sửa cài đặt luồng. Khoá dùng cho CẢ Hub nên agent cũng đăng bài / gửi Zalo được.',
  },
};

export const KEY_PLACEHOLDER = '<DÁN_KHOÁ_hub_mcp_…_VÀO_ĐÂY>';
const SERVER = 'media-hub';

export interface ClientGuide {
  id: string;
  name: string;
  steps: string[];
  code: string;
  lang: 'bash' | 'json' | 'text' | 'powershell';
  note?: string;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

export function mcpClients(endpoint: string, key: string): ClientGuide[] {
  const k = key || KEY_PLACEHOLDER;
  const bearer = `Bearer ${k}`;
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      steps: [
        'Mở terminal (PowerShell trên Windows, Terminal trên macOS).',
        'Chạy lệnh dưới — `--scope user` để dùng được ở mọi thư mục dự án.',
        'Mở Claude Code, gõ `/mcp`: thấy `media-hub · connected` là xong.',
      ],
      code: `claude mcp add --transport http --scope user ${SERVER} ${endpoint} --header "Authorization: ${bearer}"`,
      lang: 'bash',
    },
    {
      id: 'claude-app',
      name: 'Claude (web / Desktop)',
      steps: [
        'Mở Claude → Settings (Cài đặt) → Connectors.',
        'Bấm “Add custom connector”.',
        'Name: Media Hub. Remote MCP server URL: dán địa chỉ dưới (đã gắn sẵn khoá ở cuối).',
        'Bấm Add. Trong khung chat, mở biểu tượng công cụ và bật “Media Hub”.',
      ],
      code: `${endpoint}/${k}`,
      lang: 'text',
      note: 'Địa chỉ này chứa khoá — coi như mật khẩu, không gửi cho ai.',
    },
    {
      id: 'claude-desktop-config',
      name: 'Claude Desktop (file cấu hình)',
      steps: [
        'Cần cài Node.js 18 trở lên (nodejs.org).',
        'Claude Desktop → Settings → Developer → Edit Config (mở claude_desktop_config.json).',
        'Thêm khối "media-hub" dưới vào "mcpServers" (giữ các server khác nếu có), lưu file.',
        'Thoát hẳn Claude Desktop rồi mở lại — biểu tượng công cụ sẽ có “media-hub”.',
      ],
      code: json({
        mcpServers: {
          [SERVER]: {
            command: 'npx',
            // mcp-remote tự thay biến môi trường ${AUTH_HEADER} (tránh lỗi dấu cách trong args trên Windows)
            args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:$' + '{AUTH_HEADER}'],
            env: { AUTH_HEADER: bearer },
          },
        },
      }),
      lang: 'json',
    },
    {
      id: 'cursor',
      name: 'Cursor',
      steps: [
        'Cursor → Settings → MCP → “Add new global MCP server” (mở ~/.cursor/mcp.json).',
        'Dán khối dưới (giữ các server khác nếu có), lưu.',
        'Thấy chấm xanh cạnh “media-hub” là đã kết nối; dùng trong Agent chat.',
      ],
      code: json({ mcpServers: { [SERVER]: { url: endpoint, headers: { Authorization: bearer } } } }),
      lang: 'json',
    },
    {
      id: 'vscode',
      name: 'VS Code (Copilot)',
      steps: [
        'Command Palette (Ctrl/Cmd+Shift+P) → “MCP: Open User Configuration” (hoặc tạo .vscode/mcp.json trong dự án).',
        'Dán khối dưới, lưu, bấm “Start” hiện trên dòng media-hub.',
        'Mở Copilot Chat ở chế độ Agent để dùng công cụ.',
      ],
      code: json({ servers: { [SERVER]: { type: 'http', url: endpoint, headers: { Authorization: bearer } } } }),
      lang: 'json',
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      steps: [
        'Windsurf → Settings → Cascade → MCP Servers → “View raw config” (~/.codeium/windsurf/mcp_config.json).',
        'Dán khối dưới, lưu, bấm Refresh.',
      ],
      code: json({ mcpServers: { [SERVER]: { serverUrl: endpoint, headers: { Authorization: bearer } } } }),
      lang: 'json',
    },
    {
      id: 'n8n',
      name: 'n8n',
      steps: [
        'Trong workflow có node AI Agent, thêm tool “MCP Client Tool”.',
        'Endpoint: dán địa chỉ dưới. Server Transport: HTTP Streamable.',
        'Authentication: Header Auth → tạo credential với Name = Authorization, Value = Bearer <khoá>.',
        'Tools to Include: All, hoặc chỉ chọn các công cụ media_board_*.',
      ],
      code: `Endpoint:        ${endpoint}\nServer Transport: HTTP Streamable\nHeader Name:     Authorization\nHeader Value:    ${bearer}`,
      lang: 'text',
    },
    {
      id: 'other',
      name: 'Hermes / agent khác',
      steps: [
        'Hầu hết agent nhận định dạng "mcpServers" chuẩn (Streamable HTTP) như dưới.',
        `Agent không gửi được header: dùng thẳng địa chỉ ${endpoint}/<khoá> (khoá nằm cuối URL).`,
      ],
      code: json({ mcpServers: { [SERVER]: { type: 'http', url: endpoint, headers: { Authorization: bearer } } } }),
      lang: 'json',
    },
  ];
}

const INIT_BODY =
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"kiem-tra","version":"1"}}}';

export function testCommands(endpoint: string, key: string) {
  const k = key || KEY_PLACEHOLDER;
  return [
    {
      id: 'powershell',
      name: 'Windows (PowerShell)',
      lang: 'powershell' as const,
      code: [
        `$h = @{ Authorization = "Bearer ${k}"; Accept = "application/json, text/event-stream" }`,
        `$b = '${INIT_BODY}'`,
        `(Invoke-RestMethod -Method Post -Uri "${endpoint}" -Headers $h -ContentType "application/json" -Body $b).result.serverInfo`,
      ].join('\n'),
    },
    {
      id: 'curl',
      name: 'macOS / Linux',
      lang: 'bash' as const,
      code: `curl -s -X POST "${endpoint}" \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '${INIT_BODY}'`,
    },
  ];
}

export const TEST_EXPECT =
  'Đúng: thấy tên máy chủ “Việt Anh Media Hub MCP”. Báo 401 “Invalid API Key or OAuth token” (hoặc 400 “Invalid API Key” với địa chỉ có khoá) = khoá sai hoặc đã bị thu hồi.';

export const SAMPLE_PROMPTS = [
  'Dùng media-hub: tóm tắt Bảng sản xuất tuần này — việc gấp, thẻ cảnh báo đỏ, ai đang tồn nhiều video đã quay chưa dựng.',
  'Tạo thẻ video “Ngày 12 — Khen đúng cách”, luồng <tên luồng>, phát ngày <YYYY-MM-DD>, người phụ trách <tên>, điền lịch theo hạn.',
  'Xem lịch dựng 7 ngày tới của <tên>; xếp các video đã quay chưa có lịch vào buổi còn trống (video dài phải chọn buổi).',
  'Thẻ <mã tập> đã có file dựng: <link Drive> — cập nhật giúp (thẻ sẽ tự sang Chờ duyệt).',
  'Tạo đủ bản cắt cho các video gốc đã duyệt còn thiếu kênh phụ.',
  'Luồng nào đang lệch nhịp cam kết? Đề xuất các tập cần lên lịch thêm.',
];

export const BOARD_TOOLS: [string, McpLevel, string][] = [
  ['media_board_tong_quan', 'doc', 'Tổng quan như dải chip đầu trang + việc gấp'],
  ['media_board_danh_sach', 'doc', 'Danh sách thẻ, lọc theo luồng / người / cột / cảnh báo'],
  ['media_board_xem_the', 'doc', 'Một thẻ đầy đủ: hạn, cảnh báo, bản cắt, bước kế tiếp bị chặn vì gì'],
  ['media_board_lich_dung', 'doc', 'Lịch dựng theo ngày × người × buổi, chỗ trống'],
  ['media_board_luong', 'doc', 'Sức khoẻ từng luồng, kiểm nhịp cam kết'],
  ['media_board_xuat_csv', 'doc', 'Xuất CSV như nút “Tải CSV”'],
  ['media_board_cau_hinh', 'doc', 'Luồng, thành viên, quy tắc'],
  ['media_board_tao_the', 'nhap', '“+ Thêm video” (tự mã tập, điền theo luồng, điền lịch theo hạn)'],
  ['media_board_sua_the', 'nhap', 'Sửa thẻ / xếp lịch dựng'],
  ['media_board_chuyen_trang_thai', 'nhap', 'Kéo–thả sang cột khác, hoặc bước kế tiếp'],
  ['media_board_tao_ban_cat', 'nhap', '“+ Tạo bản cắt” cho kênh phụ còn thiếu'],
  ['media_board_tao_tap_cung_buoi', 'nhap', '“+ Tập khác cùng buổi quay”'],
  ['media_board_duyet', 'dang', '“Duyệt ✓”: Chờ duyệt → Lên lịch phát'],
  ['media_board_xoa_the', 'dang', 'Xoá thẻ'],
  ['media_board_cau_hinh_sua', 'dang', 'Thêm / sửa / xoá luồng, đổi quy tắc'],
];

const fence = (lang: string, code: string) => '```' + lang + '\n' + code + '\n```';

// File .md tải về / chép một lần: đủ từ A–Z, khoá điền sẵn nếu có.
export function buildMcpGuide(opts: {
  endpoint: string;
  key: string;
  keyName?: string;
  level?: McpLevel;
  boardUrl?: string;
  date?: string;
}) {
  const { endpoint, key, keyName, level, boardUrl, date } = opts;
  const k = key || KEY_PLACEHOLDER;
  const lv = level ? MCP_LEVELS[level] : null;
  const out: string[] = [];
  out.push('# Kết nối agent AI với Bảng sản xuất Media (MCP)');
  out.push('');
  out.push(
    `Tạo lúc ${date || new Date().toLocaleString('vi-VN')}. File này giúp Claude, Cursor, VS Code, n8n, Hermes… đọc và thao tác Bảng sản xuất Media${
      boardUrl ? ` (${boardUrl})` : ''
    } — và cả các phần khác của Hub theo mức quyền của khoá.`
  );
  out.push('');
  out.push(
    key
      ? '> ⚠️ File có chứa KHOÁ BÍ MẬT. Coi như mật khẩu: không gửi qua chat, Zalo, email, không đưa lên Git. Lộ khoá thì thu hồi ngay ở Hub → Cài đặt → Kết nối agent MCP.'
      : `> Chưa có khoá: thay mọi chỗ \`${KEY_PLACEHOLDER}\` bằng khoá hub_mcp_… (quản trị viên tạo ở Bảng sản xuất → nút “Kết nối agent”, hoặc Cài đặt → Kết nối agent MCP).`
  );
  out.push('');
  out.push('## 0. Thông tin kết nối');
  out.push('');
  out.push('| | |');
  out.push('|---|---|');
  out.push(`| Địa chỉ MCP (Streamable HTTP) | \`${endpoint}\` |`);
  out.push(`| Gửi khoá | Header \`Authorization: Bearer <khoá>\` |`);
  out.push(`| Địa chỉ có sẵn khoá (client không gửi được header) | \`${endpoint}/${k}\` |`);
  out.push(`| Khoá | \`${k}\` |`);
  if (keyName) out.push(`| Tên khoá | ${keyName} |`);
  if (lv) out.push(`| Mức quyền | ${lv.label} — ${lv.hint} |`);
  out.push('');
  out.push('## 1. Cắm vào ứng dụng của bạn (chọn một)');
  for (const c of mcpClients(endpoint, key)) {
    out.push('');
    out.push(`### ${c.name}`);
    out.push('');
    c.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    out.push('');
    out.push(fence(c.lang, c.code));
    if (c.note) {
      out.push('');
      out.push(`> ${c.note}`);
    }
  }
  out.push('');
  out.push('## 2. Kiểm tra kết nối (không bắt buộc)');
  for (const t of testCommands(endpoint, key)) {
    out.push('');
    out.push(`**${t.name}**`);
    out.push('');
    out.push(fence(t.lang, t.code));
  }
  out.push('');
  out.push(TEST_EXPECT);
  out.push('');
  out.push('## 3. Thử ra lệnh cho agent');
  out.push('');
  SAMPLE_PROMPTS.forEach((p) => out.push(`- ${p}`));
  out.push('');
  out.push('## 4. Công cụ của Bảng sản xuất');
  out.push('');
  out.push('| Công cụ | Quyền tối thiểu | Việc |');
  out.push('|---|---|---|');
  BOARD_TOOLS.forEach(([n, l, d]) => out.push(`| \`${n}\` | ${MCP_LEVELS[l].label} | ${d} |`));
  out.push('');
  out.push(
    'Thẻ được gọi bằng id hoặc mã tập. Agent bị kiểm đúng luật như người bấm trên trang: bắt buộc tiêu đề + ngày phát hành, hạn quay/dựng tính ngược từ ngày phát, tối đa N video dài mỗi buổi dựng, điều kiện từng cột, tự chuyển cột khi đủ dữ liệu. Đưa thẻ lần đầu vào “Lên lịch phát”/“Đã phát hành” là bước DUYỆT — cần khoá quyền “Được đăng”.'
  );
  out.push('');
  out.push(
    'Khoá này dùng được cả các công cụ khác của Hub (lịch đăng hub_*, Zalo zalo_*…) trong phạm vi mức quyền — hỏi agent “liệt kê công cụ của media-hub” để xem đủ.'
  );
  out.push('');
  out.push('## 5. Gỡ lỗi nhanh');
  out.push('');
  out.push('- **401 / 400 Invalid API Key**: khoá chép thiếu ký tự, có dấu cách thừa, hoặc đã bị thu hồi → tạo khoá mới.');
  out.push('- **Agent báo “Khoá MCP này chỉ có quyền …”**: thao tác cần mức quyền cao hơn → nhờ quản trị viên tạo khoá mức phù hợp.');
  out.push('- **Không thấy công cụ media_board_***: khởi động lại ứng dụng (Claude Desktop phải thoát hẳn), kiểm tra file cấu hình đúng định dạng JSON.');
  out.push('- **Windows báo không tìm thấy `npx`**: cài Node.js 18+ rồi mở lại ứng dụng.');
  out.push('- **Thu hồi / xem khoá đang dùng**: Hub → Cài đặt → Kết nối agent MCP.');
  out.push('');
  return out.join('\n');
}
