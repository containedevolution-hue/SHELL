const AdmZip = require('adm-zip');

const DEFAULT_MAX_CHARS = 12000;
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'html', 'htm',
  'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp',
  'hpp', 'sql', 'sh', 'ps1', 'log', 'rtf',
]);

function extensionOf(filename = '') {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function cleanText(value) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bounded(text, format, maxChars) {
  const normalized = cleanText(text);
  const truncated = normalized.length > maxChars;
  const output = truncated ? normalized.slice(0, maxChars).trimEnd() : normalized;
  return { text: output, format, chars: output.length, truncated };
}

function extractDocx(buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw Object.assign(new Error('The DOCX document body is missing.'), { code: 'unreadable_upload' });
  if (entry.header.size > 5 * 1024 * 1024) {
    throw Object.assign(new Error('The DOCX document body is too large to read safely.'), { code: 'extraction_limit' });
  }
  const xml = entry.getData().toString('utf8')
    .replace(/<w:tab\b[^>]*\/?\s*>/gi, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/gi, '\n')
    .replace(/<\/w:(?:p|tr)>/gi, '\n')
    .replace(/<\/w:tc>/gi, '\t')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(xml);
}

function extractMarkup(buffer) {
  return decodeEntities(buffer.toString('utf8')
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<\/?(?:p|div|section|article|h[1-6]|li|tr|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

async function extractPdf(buffer, maxChars) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  let length = 0;
  const pageLimit = Math.min(document.numPages, 100);
  for (let pageNumber = 1; pageNumber <= pageLimit && length <= maxChars; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || '').join(' ');
    pages.push(text);
    length += text.length + 1;
  }
  const result = cleanText(pages.join('\n'));
  if (!result) throw Object.assign(new Error('No searchable text was found. This PDF may be image-only.'), { code: 'no_searchable_text' });
  return result;
}

function supportsTextExtraction(filename, mimeType = '') {
  const extension = extensionOf(filename);
  const mime = String(mimeType).toLowerCase().split(';')[0].trim();
  return extension === 'pdf' || extension === 'docx' || TEXT_EXTENSIONS.has(extension)
    || mime.startsWith('text/') || mime === 'application/pdf'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mime === 'application/json' || mime.endsWith('+json') || mime.endsWith('+xml');
}

async function extractUploadText({ filename = '', mimeType = '', content, maxChars = DEFAULT_MAX_CHARS }) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ''), 'base64');
  if (!buffer.length) throw Object.assign(new Error('The upload is empty.'), { code: 'empty_upload' });
  const limit = Math.max(1, Math.min(Number(maxChars) || DEFAULT_MAX_CHARS, DEFAULT_MAX_CHARS));
  const extension = extensionOf(filename);
  const mime = String(mimeType).toLowerCase().split(';')[0].trim();
  if (extension === 'pdf' || mime === 'application/pdf') return bounded(await extractPdf(buffer, limit), 'pdf', limit);
  if (extension === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return bounded(extractDocx(buffer), 'docx', limit);
  }
  if (!supportsTextExtraction(filename, mimeType)) {
    throw Object.assign(new Error('This file type does not have a safe text extractor yet.'), { code: 'unsupported_upload_type' });
  }
  if (extension === 'html' || extension === 'htm' || extension === 'xml' || mime.includes('html') || mime.includes('xml')) {
    return bounded(extractMarkup(buffer), extension || 'markup', limit);
  }
  return bounded(buffer.toString('utf8'), extension || 'text', limit);
}

module.exports = { DEFAULT_MAX_CHARS, extensionOf, supportsTextExtraction, extractUploadText };
