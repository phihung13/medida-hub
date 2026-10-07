/*
 * Xuất TOÀN VĂN prompt của mọi agent AI trong Media Hub ra một file JSON để
 * dựng báo cáo / gửi người refine. Đọc thẳng mã nguồn bằng TypeScript compiler
 * (không chép tay) nên luôn khớp code hiện tại.
 *
 *   pnpm exec tsx scripts/export-prompts.ts <out.json>
 *
 * Mỗi mục gồm: agent, tên hàm, file:dòng, và đoạn mã dựng prompt (system/user
 * prompt, kể cả phần ghép động — ${...} là chỗ chèn dữ liệu lúc chạy). Skill
 * "Công thức AI" được xuất nội dung GỐC trong code; bản đang chạy trên server
 * có thể đã được sửa trên giao diện (Phát hiện → Công thức AI).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

type Piece = { ham: string; file: string; dong: string; ma: string };

function sourceOf(file: string) {
  const abs = path.join(ROOT, file);
  const text = fs.readFileSync(abs, 'utf8');
  const kind = file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.mjs') || file.endsWith('.js')
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  return ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(sf: ts.SourceFile, pos: number) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

// Tìm hàm / method / const theo tên, trả về toàn văn khai báo.
function grab(file: string, names: string[]): Piece[] {
  const sf = sourceOf(file);
  const out: Piece[] = [];
  const want = new Set(names);
  const visit = (node: ts.Node) => {
    let name: string | undefined;
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      name = node.name.text;
    } else if (ts.isVariableStatement(node)) {
      const d = node.declarationList.declarations[0];
      if (d && ts.isIdentifier(d.name)) name = d.name.text;
    }
    if (name && want.has(name)) {
      out.push({
        ham: name,
        file: rel(sf.fileName),
        dong: `${lineOf(sf, node.getStart())}-${lineOf(sf, node.getEnd())}`,
        ma: node.getText(sf),
      });
      want.delete(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (want.size) throw new Error(`Không tìm thấy trong ${file}: ${[...want].join(', ')}`);
  return names.map((n) => out.find((p) => p.ham === n)!);
}

// Nội dung gốc của từng skill "Công thức AI" (giá trị chuỗi template của hằng).
function skills() {
  const file = 'libraries/nestjs-libraries/src/viral/viral.skills.ts';
  const sf = sourceOf(file);
  const consts = new Map<string, string>();
  const defs: { key: string; label: string; group: string; description: string; constName: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isNoSubstitutionTemplateLiteral(init) || ts.isStringLiteral(init)) {
        consts.set(node.name.text, init.text);
      }
      if (node.name.text === 'VIRAL_SKILL_DEFS' && ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (!ts.isObjectLiteralExpression(el)) continue;
          const get = (k: string) => {
            const p = el.properties.find(
              (x) => ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === k
            ) as ts.PropertyAssignment | undefined;
            return p?.initializer;
          };
          const s = (k: string) => {
            const v = get(k);
            return v && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) ? v.text : '';
          };
          const c = get('content');
          defs.push({
            key: s('key'),
            label: s('label'),
            group: s('group'),
            description: s('description'),
            constName: c && ts.isIdentifier(c) ? c.text : '',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return defs.map((d) => ({ ...d, file, noi_dung: consts.get(d.constName) || '' }));
}

const OAS = 'libraries/nestjs-libraries/src/openai/openai.service.ts';
const PP = 'libraries/nestjs-libraries/src/viral/viral.produce.prompts.ts';

const AGENTS: { ma: string; phan: Piece[] }[] = [
  {
    ma: 'zalo-bot',
    phan: [
      ...grab('apps/zalo-bot/src/caption.mjs', [
        'SYSTEM',
        'writeCaption',
        'generateHashtags',
        'rewriteCaption',
        'PER_IMAGE_INSTRUCTION',
        'captionOneImage',
        'captionImageSet',
        'captionFromFrames',
      ]),
      ...grab('apps/zalo-bot/src/pickbest.mjs', ['pickBest']),
      ...grab('apps/zalo-bot/src/safety.mjs', ['checkSafety']),
    ],
  },
  { ma: 'viral-clone', phan: grab(OAS, ['VIET_ANH_SYSTEM', 'viralFormula', 'viralClone']) },
  { ma: 'viral-ban-cua-minh', phan: grab(OAS, ['viralRewriteAndScore']) },
  {
    ma: 'viral-infographic',
    phan: [
      ...grab(PP, ['buildCarouselPrompt', 'carouselSlidePrompt', 'buildInfographicPrompt']),
      ...grab(OAS, ['viralProduceCarousel']),
    ],
  },
  {
    ma: 'viral-blog',
    phan: [
      ...grab(PP, ['diversityBlock', 'buildBlogPrompt', 'SITE_ROUTING_RUBRIC', 'buildSiteRoutingPrompt']),
      ...grab(OAS, ['viralProduceBlog', 'viralSuggestBlogSite']),
    ],
  },
  {
    ma: 'viral-podcast',
    phan: [...grab(PP, ['buildPodcastPrompt', 'buildChannelRoutingPrompt']), ...grab(OAS, ['viralProducePodcast', 'viralSuggestChannels'])],
  },
  { ma: 'agent-chat', phan: grab('libraries/nestjs-libraries/src/chat/load.tools.service.ts', ['agent']) },
  { ma: 'excel-ai', phan: grab('libraries/nestjs-libraries/src/database/prisma/content/bulk-import.service.ts', ['polish']) },
  { ma: 'autopost-rss', phan: grab('libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts', ['generateDescription', 'generatePicture']) },
  { ma: 'ai-caption', phan: grab(OAS, ['generateCaptionsForImages']) },
  { ma: 'ai-tao-anh', phan: grab(OAS, ['generatePromptForPicture']) },
  { ma: 'ai-tao-video', phan: grab(OAS, ['generateSlidesFromText', 'generateVoiceFromText']) },
  { ma: 'youtube-ai', phan: grab(OAS, ['generateYoutubeContentFromImages']) },
  { ma: 'copilot', phan: [] },
  { ma: 'tach-thread', phan: grab(OAS, ['separatePosts']) },
  {
    ma: 'viral-phat-hien',
    phan: grab(OAS, ['viralAnalyze', 'viralScoreBatch', 'viralClusterBatch', 'viralSynthesizeTopic', 'viralLeadMagnets', 'viralUpdatePersonas', 'viralExpandQueries']),
  },
  { ma: 'ban-tin-tuan', phan: grab(OAS, ['viralWeeklyBrief']) },
  { ma: 'phan-tich-kenh', phan: grab(OAS, ['analyzeChannelWinners', 'analyzeYoutubeWinners', 'answerAboutChannel']) },
];

// Copilot: instructions nằm trong JSX (thuộc tính `instructions` của CopilotPopup).
{
  const file = 'apps/frontend/src/components/new-launch/manage.modal.tsx';
  const sf = sourceOf(file);
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'instructions' && node.initializer) {
      const host = node.parent.parent;
      AGENTS.find((a) => a.ma === 'copilot')!.phan.push({
        ham: 'CopilotPopup.instructions',
        file,
        dong: `${lineOf(sf, host.getStart())}-${lineOf(sf, host.getEnd())}`,
        ma: host.getText(sf),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const out = process.argv[2] || 'prompts.json';
fs.writeFileSync(out, JSON.stringify({ agents: AGENTS, skills: skills() }, null, 1), 'utf8');
console.log(`Đã xuất ${AGENTS.reduce((n, a) => n + a.phan.length, 0)} đoạn prompt + ${skills().length} skill → ${out}`);
