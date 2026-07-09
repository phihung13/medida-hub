// ============================================================================
//  Sinh file .docx THẬT (OOXML zip thuần JS, store không nén) từ HTML blog —
//  port nguyên văn từ node "🧩 Parse Blog" của n8n WF-SanXuat (đã chạy ổn
//  production). Không thêm dependency.
// ============================================================================

function stripTags(s: string): string {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface Block {
  style: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'i';
  text: string;
}

function para(b: Block): string {
  let sz = '24';
  let bold = false;
  let pre = '';
  if (b.style === 'h1') {
    sz = '40';
    bold = true;
  } else if (b.style === 'h2') {
    sz = '30';
    bold = true;
  } else if (b.style === 'h3') {
    sz = '26';
    bold = true;
  } else if (b.style === 'li') {
    pre = '•  ';
  }
  const ital = b.style === 'i';
  const rPr =
    bold || ital || sz !== '24'
      ? '<w:rPr>' + (bold ? '<w:b/>' : '') + (ital ? '<w:i/>' : '') + `<w:sz w:val="${sz}"/></w:rPr>`
      : '';
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${esc(pre + b.text)}</w:t></w:r></w:p>`;
}

// CRC32 (bảng chuẩn) — zip cần checksum dù store không nén.
const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(f.data.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + f.data.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localPart, centralPart, eocd]);
}

// HTML blog (h2/h3/p/li) + tiêu đề + meta → Buffer .docx.
export function blogHtmlToDocx(opts: {
  title: string;
  metaDescription?: string;
  bodyHtml: string;
  tags?: string[];
}): Buffer {
  const blocks: Block[] = [];
  blocks.push({ style: 'h1', text: stripTags(opts.title) });
  if (opts.metaDescription)
    blocks.push({ style: 'i', text: stripTags(opts.metaDescription) });
  const re = /<(h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(opts.bodyHtml || '')) !== null) {
    const tag = m[1].toLowerCase();
    const txt = stripTags(m[2]);
    if (!txt) continue;
    blocks.push({ style: (tag === 'li' ? 'li' : tag) as Block['style'], text: txt });
  }
  const tags = (opts.tags || []).join(', ');
  if (tags) blocks.push({ style: 'i', text: 'Tags: ' + tags });
  if (blocks.length <= 2)
    blocks.push({ style: 'p', text: stripTags(opts.bodyHtml || '') });

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    blocks.map(para).join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    '</w:body></w:document>';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
  ]);
}
