// Text and images out of .docx / .pptx / .xlsx without dependencies: they are zip files of XML.
import fs from 'node:fs';
import zlib from 'node:zlib';

// Minimal zip reader: central directory → { name: () => Buffer }.
export function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries[name] = () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const runs = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => decode(m[1]));
const byNumber = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0);

// Returns { text (markdown-ish), media: [{ name, data }] }.
export function extractOffice(file) {
  const zip = readZip(file);
  const names = Object.keys(zip);
  const xml = n => zip[n]().toString('utf8');
  const out = [];
  if (zip['word/document.xml']) {
    for (const [, body] of xml('word/document.xml').matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
      const text = runs(body, 'w:t').join('').trim();
      if (!text) continue;
      const level = /<w:pStyle w:val="(?:Heading|Title)(\d?)"/.exec(body);
      out.push(level ? `${'#'.repeat(Number(level[1] || 1))} ${text}` : text);
    }
  } else if (names.some(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber).forEach((n, i) => {
      out.push(`## Slide ${i + 1}`);
      for (const [, para] of xml(n).matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
        const text = runs(para, 'a:t').join('').trim();
        if (text) out.push(text);
      }
      const notes = `ppt/notesSlides/notesSlide${n.match(/(\d+)\.xml$/)[1]}.xml`;
      if (zip[notes]) {
        const t = runs(xml(notes), 'a:t').join(' ').replace(/\s+/g, ' ').trim();
        if (t) out.push(`> Notes: ${t}`);
      }
    });
  } else if (zip['xl/workbook.xml']) {
    const shared = zip['xl/sharedStrings.xml'] ? [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => runs(m[1], 't').join('')) : [];
    names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(byNumber).forEach((n, i) => {
      out.push(`## Sheet ${i + 1}`);
      for (const [, row] of xml(n).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [...row.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, attrs, inner = '']) => {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? runs(inner, 't').join('');
          return /t="s"/.test(attrs) ? shared[Number(v)] ?? '' : decode(v);
        });
        if (cells.some(c => c !== '')) out.push(cells.join(' | '));
      }
    });
  } else {
    throw new Error('unrecognised Office file');
  }
  // Images, with where they sit: the slide (and its first line) for decks, the title for documents.
  const where = {};
  for (const r of names.filter(n => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n))) {
    const slide = Number(r.match(/slide(\d+)\.xml\.rels$/)[1]);
    const first = runs(xml(`ppt/slides/slide${slide}.xml`), 'a:t').join(' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    for (const [, target] of xml(r).matchAll(/Target="\.\.\/media\/([^"]+)"/g)) (where[target] ||= []).push(`slide ${slide}${first ? `: ${first}` : ''}`);
  }
  const title = out.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
  const media = names.filter(n => /^(word|ppt|xl)\/media\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(n))
    .map(n => { const name = n.split('/').pop(); return { name, data: zip[n](), context: where[name]?.join('; ') || title }; });
  return { text: out.join('\n\n'), media };
}
