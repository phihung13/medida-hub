// ============================================================================
//  Diễn giải lỗi OpenRouter — dùng chung cho MỌI nơi gọi openrouter.ai
//  (openai.service.openRouterRaw + copilot.controller /anthropic-key/test).
//
//  Lý do tồn tại: trước đây mọi lỗi HTTP đều bị nuốt thành chuỗi thô
//  "OpenRouter HTTP 404: {...}" rồi lớp trên gắn thêm câu "Thường do hết hạn
//  mức AI" cho MỌI thất bại — sai bản chất. OpenRouter trả 404 cho nhiều tình
//  huống khác nhau, trong đó `no_callers` KHÔNG liên quan gì tới hạn mức:
//  không có provider (caller) nào của model thoả ràng buộc định tuyến hiện
//  hành (vd location tag 'us').
// ============================================================================

// Thông báo chuẩn cho trường hợp không có provider khả dụng (no_callers).
export const OPENROUTER_NO_CALLERS_MESSAGE =
  'Model hiện tại không có provider khả dụng trên OpenRouter. Có thể do cấu hình Provider Preferences/Location hoặc routing của OpenRouter. Hãy đổi model hoặc kiểm tra tài khoản OpenRouter.';

// Bóc message lồng nhau của OpenRouter. Thân lỗi có dạng:
//   { error: { message, code, metadata: { raw: "<chuỗi JSON của provider>" } } }
// nên mã máy (`no_callers`) thường nằm TRONG chuỗi metadata.raw, không nằm ở
// error.code (error.code khi đó là 404 — số HTTP, không phải mã nguyên nhân).
function flatten(body: string): { text: string; message: string; code: string } {
  const text = String(body || '');
  let message = '';
  let code = '';
  try {
    const json: any = JSON.parse(text);
    const err = json?.error ?? json;
    message = String(err?.message || '');
    code = String(err?.code ?? '');
    const raw = err?.metadata?.raw;
    if (raw) {
      // metadata.raw có thể là chuỗi JSON hoặc object — thử bóc thêm 1 lớp.
      const inner = typeof raw === 'string' ? safeParse(raw) : raw;
      const innerErr = inner?.error ?? inner;
      if (innerErr?.code) code = String(innerErr.code);
      if (innerErr?.message) message = String(innerErr.message);
    }
  } catch {
    /* không phải JSON — giữ nguyên text thô để hiển thị */
  }
  return { text, message, code };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Nhận diện RIÊNG `no_callers`. Bắt theo mã máy TRƯỚC; chuỗi tiếng Anh chỉ là
// lưới đỡ hẹp ("no caller(s)…") phòng khi OpenRouter đổi format — KHÔNG bắt
// theo status 404 chung chung, cũng KHÔNG gộp các lỗi định tuyến khác
// (vd "No endpoints found matching your data policy") vào đây.
export function isNoCallersError(body: string): boolean {
  const { text, message, code } = flatten(body);
  if (code === 'no_callers') return true;
  if (/no_callers/i.test(text)) return true;
  return /\bno\s+callers?\b/i.test(`${message} ${text}`);
}

// Lỗi định tuyến họ hàng: không có endpoint nào khớp ràng buộc (data policy,
// providers được phép…). Khác nguyên nhân với no_callers nên có thông báo riêng.
function isNoEndpointsError(body: string): boolean {
  const { text, message } = flatten(body);
  return /no\s+endpoints\s+found/i.test(`${message} ${text}`);
}

// Chuỗi lỗi hiển thị cho người dùng — ĐÚNG nguyên nhân theo từng mã HTTP.
// Mỗi nhánh chỉ nói điều mà status/mã lỗi thực sự chứng minh được.
export function describeOpenRouterError(
  status: number,
  body: string,
  model: string
): string {
  const { text, message } = flatten(body);
  const detail = (message || text).slice(0, 200);

  if (isNoCallersError(body)) {
    return `${OPENROUTER_NO_CALLERS_MESSAGE} (model: ${model})`;
  }
  if (isNoEndpointsError(body)) {
    return `Model "${model}" không có endpoint nào khớp ràng buộc định tuyến của tài khoản OpenRouter (data policy / danh sách provider được phép). Nới ràng buộc trong Settings của OpenRouter hoặc đổi model. Chi tiết: ${detail}`;
  }
  if (status === 401 || status === 403) {
    return `OpenRouter từ chối xác thực (HTTP ${status}) — key sai/hết hiệu lực. Kiểm tra key trong Settings. Chi tiết: ${detail}`;
  }
  if (status === 402) {
    return `OpenRouter hết số dư (HTTP 402) — nạp credit cho tài khoản OpenRouter. Chi tiết: ${detail}`;
  }
  if (status === 429) {
    return `OpenRouter chặn vì quá tần suất/hết hạn mức (HTTP 429) — đợi hoặc nâng hạn mức. Chi tiết: ${detail}`;
  }
  if (status === 404) {
    // 404 KHÁC no_callers: sai slug model, sai endpoint… — không phải quota.
    return `OpenRouter không tìm thấy tài nguyên (HTTP 404) cho model "${model}" — kiểm tra lại model/endpoint. Chi tiết: ${detail}`;
  }
  if (status >= 500) {
    return `OpenRouter lỗi phía máy chủ (HTTP ${status}) — thử lại sau. Chi tiết: ${detail}`;
  }
  return `OpenRouter HTTP ${status}: ${detail}`;
}

// Lý do thất bại có THỰC SỰ mang dáng dấp hết hạn mức/hết tiền hay không.
// Dùng để chỉ gợi ý "nạp tiền/hết quota" khi đúng, thay vì gắn cho mọi lỗi.
export function isQuotaLikeError(reason: string): boolean {
  const r = String(reason || '');
  if (isNoCallersError(r) || isNoEndpointsError(r)) return false;
  return /(429|402|quota|hạn mức|rate.?limit|too many requests|insufficient|credit|balance|billing|exceeded)/i.test(
    r
  );
}
