// Đặc tả v2 "ưu tiên share": link ở BÌNH LUẬN đầu của bài Facebook mang UTM để
// đo gần đúng lượt chia sẻ vào nhóm Zalo và truy Qlead về đúng bài.
// Chỉ gắn vào link của trường; link đã có utm_* thì giữ nguyên.
const OWN_DOMAINS = [
  'truongvietanh.com',
  'nguyenmanhduong.com',
  'bandohoctap.com',
];

const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:truongvietanh\.com|nguyenmanhduong\.com|bandohoctap\.com)(?:\/[^\s<>"')\]]*)?)/gi;

export function addUtm(
  text: string,
  campaign: string,
  source = 'facebook',
  medium = 'social'
): { text: string; changed: boolean } {
  let changed = false;
  const out = String(text || '').replace(URL_RE, (raw) => {
    // dấu câu dính cuối link (". , ; :") không thuộc URL
    const trail = raw.match(/[.,;:!?]+$/)?.[0] || '';
    const link = trail ? raw.slice(0, -trail.length) : raw;
    if (/[?&]utm_/i.test(link)) return raw;
    const host = link.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
    if (!OWN_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) {
      return raw;
    }
    const [base, hash] = link.split('#');
    const sep = base.includes('?') ? '&' : '?';
    const withProto = /^https?:\/\//i.test(base) ? base : 'https://' + base;
    changed = true;
    return (
      withProto +
      sep +
      `utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(
        medium
      )}&utm_campaign=${encodeURIComponent(campaign)}` +
      (hash !== undefined ? '#' + hash : '') +
      trail
    );
  });
  return { text: out, changed };
}
