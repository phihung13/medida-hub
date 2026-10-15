// ============================================================================
//  NGƯỜI CHẤM ĐỘC LẬP — Rubric dự báo share (Đặc tả v2, 15/10/2026)
//  - MỘT lệnh gọi riêng tới Claude, temperature 0, system = rubric (skill
//    'rubric-du-bao-share', sửa được trên tab Công thức AI).
//  - User message CHỈ gồm: loại bài, bài viết, hồ sơ trường (bản gọn), dòng
//    thư viện câu chuyện + ghi chú giáo viên nếu có. KHÔNG đưa prompt viết hay
//    điểm tự chấm của bên viết.
//  - JSON ép bằng tool schema; VERDICT tính lại bằng code từ gates + total
//    (không tin verdict của model). KHÔNG so với điểm bản trước.
//  - QUY ƯỚC (Bot Zalo judge.mjs + POST /public/v1/share-judge dựa vào):
//    gates.Gx = true nghĩa là bài VI PHẠM / TRƯỢT cổng đó (đúng câu chữ rubric
//    "G1. Có dữ kiện KHÔNG có trong..."). Kết quả luôn có total:number và
//    verdict ∈ "đăng" | "sửa 1 lần" | "bỏ" | "loại" (tính bằng code).
// ============================================================================

import { getSkill } from '@gitroom/nestjs-libraries/viral/viral.skills';

export type ShareRubricType = 'GT' | 'UGC';
export type ShareVerdict = 'đăng' | 'sửa 1 lần' | 'bỏ' | 'loại';

export const SHARE_CRITERIA = [
  'identity',
  'value',
  'hook',
  'emotion',
  'proof',
  'recipient',
  'friction',
] as const;

// Trọng số tối đa từng tiêu chí theo loại bài (khớp rubric v2).
export const SHARE_WEIGHTS: Record<ShareRubricType, Record<string, number>> = {
  GT: { identity: 20, value: 20, hook: 15, emotion: 10, proof: 15, recipient: 10, friction: 10 },
  UGC: { identity: 25, value: 5, hook: 15, emotion: 15, proof: 25, recipient: 10, friction: 5 },
};

export const SHARE_PASS: Record<ShareRubricType, number> = { GT: 90, UGC: 80 };

export interface ShareJudgeInput {
  type: ShareRubricType;
  text: string;
  note?: string | null; // ghi chú giáo viên (bài UGC)
  story?: string | null; // dòng thư viện câu chuyện được dùng
}

export interface ShareJudgeResult {
  type: ShareRubricType;
  gates: Record<'G1' | 'G2' | 'G3' | 'G4' | 'G5', boolean>; // true = TRƯỢT cổng
  scores: Record<string, number>;
  evidence: Record<string, string>;
  total: number;
  verdict: ShareVerdict;
  one_fix: string;
}

const GATES = ['G1', 'G2', 'G3', 'G4', 'G5'] as const;

// BƯỚC 3 của rubric, tính bằng code.
export function computeShareVerdict(
  type: ShareRubricType,
  gates: Record<string, boolean>,
  total: number
): ShareVerdict {
  if (GATES.some((g) => gates[g])) return 'loại';
  if (type === 'UGC') return total >= SHARE_PASS.UGC ? 'đăng' : 'bỏ';
  if (total >= SHARE_PASS.GT) return 'đăng';
  if (total >= 75) return 'sửa 1 lần';
  return 'bỏ';
}

const TOOL = {
  name: 'ket_qua_cham',
  description: 'Trả kết quả chấm theo rubric dự báo share.',
  input_schema: {
    type: 'object',
    properties: {
      gates: {
        type: 'object',
        description: 'true = bài TRƯỢT cổng đó (vi phạm)',
        properties: Object.fromEntries(GATES.map((g) => [g, { type: 'boolean' }])),
        required: [...GATES],
      },
      type: { type: 'string', enum: ['GT', 'UGC'] },
      scores: {
        type: 'object',
        properties: Object.fromEntries(SHARE_CRITERIA.map((c) => [c, { type: 'number' }])),
        required: [...SHARE_CRITERIA],
      },
      evidence: {
        type: 'object',
        description: 'trích NGUYÊN VĂN đoạn trong bài làm bằng chứng; rỗng nếu không có',
        properties: Object.fromEntries(SHARE_CRITERIA.map((c) => [c, { type: 'string' }])),
        required: [...SHARE_CRITERIA],
      },
      total: { type: 'number' },
      verdict: { type: 'string' },
      one_fix: { type: 'string' },
    },
    required: ['gates', 'type', 'scores', 'evidence', 'total', 'verdict', 'one_fix'],
  },
};

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function judgeShare(input: ShareJudgeInput): Promise<ShareJudgeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY chưa cấu hình — không chấm được.');
  const type: ShareRubricType = input.type === 'UGC' ? 'UGC' : 'GT';
  const text = String(input.text || '').trim();
  if (!text) throw new Error('Bài trống — không có gì để chấm.');

  const user = [
    `LOẠI BÀI: ${type}`,
    `BÀI VIẾT CẦN CHẤM:\n"""\n${text.slice(0, 8000)}\n"""`,
    `HỒ SƠ TRƯỜNG:\n${getSkill('ho-so-truong-ngan')}`,
    input.story ? `DÒNG THƯ VIỆN CÂU CHUYỆN ĐƯỢC DÙNG:\n${String(input.story).slice(0, 3000)}` : '',
    input.note ? `GHI CHÚ GIÁO VIÊN:\n${String(input.note).slice(0, 3000)}` : '',
    'Chấm theo rubric. Gọi công cụ ket_qua_cham đúng 1 lần.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 3000,
      temperature: 0,
      system: getSkill('rubric-du-bao-share'),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Người chấm lỗi HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const raw = (data.content || []).find((c: any) => c.type === 'tool_use')?.input;
  if (!raw) throw new Error('Người chấm không trả kết quả.');

  // Kẹp điểm từng tiêu chí trong trọng số; không bằng chứng = 0 điểm.
  const w = SHARE_WEIGHTS[type];
  const scores: Record<string, number> = {};
  const evidence: Record<string, string> = {};
  for (const c of SHARE_CRITERIA) {
    const ev = String(raw.evidence?.[c] ?? '').trim();
    evidence[c] = ev;
    const n = Number(raw.scores?.[c]);
    scores[c] = ev && Number.isFinite(n) ? Math.max(0, Math.min(w[c], Math.round(n))) : 0;
  }
  const total = SHARE_CRITERIA.reduce((s, c) => s + scores[c], 0);
  const gates = Object.fromEntries(
    GATES.map((g) => [g, raw.gates?.[g] === true])
  ) as ShareJudgeResult['gates'];
  const verdict = computeShareVerdict(type, gates, total);
  return {
    type,
    gates,
    scores,
    evidence,
    total,
    verdict,
    one_fix: String(raw.one_fix || '').trim(),
  };
}
