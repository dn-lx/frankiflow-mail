import type { AttachmentMeta } from '../types.ts';
import type { StoredAttachmentData } from './store.ts';

function toPdfAscii(text: string): string {
  return text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Builds a minimal valid single-page PDF document containing the attachment title.
 */
export function buildMinimalPdf(title: string): Uint8Array {
  const safeTitle = toPdfAscii(title);
  const streamContent = [
    'BT',
    '/F1 18 Tf',
    '50 770 Td',
    `(${safeTitle}) Tj`,
    '0 -28 Td',
    '/F1 11 Tf',
    '(FrankiFlow Reinigung Frankfurt - Demo-Dokument) Tj',
    '0 -20 Td',
    '(Erstellt im Demo-Modus ohne Netzwerkzugriff.) Tj',
    'ET',
  ].join('\n');

  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  const header = '%PDF-1.4\n';
  const offsets: number[] = [];
  let currentOffset = encoder.encode(header).length;

  for (const obj of objects) {
    offsets.push(currentOffset);
    currentOffset += encoder.encode(obj).length;
  }

  const xrefOffset = currentOffset;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((off) => `${String(off).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    '%%EOF\n',
  ];

  const fullPdf = header + objects.join('') + xrefLines.join('\n');
  return encoder.encode(fullPdf);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a lightweight SVG illustration for demo photo attachments.
 */
export function buildStaircaseSvg(title: string): Uint8Array {
  const safe = escapeXml(title);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">',
    '<rect width="640" height="400" fill="#F0F4F5"/>',
    '<rect x="40" y="40" width="560" height="320" rx="12" fill="#FFFFFF" stroke="#D5DFE2" stroke-width="2"/>',
    '<path d="M120 310 H220 V260 H300 V210 H380 V160 H480 V110 H540" fill="none" stroke="#1F8A8A" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>',
    '<line x1="120" y1="250" x2="480" y2="90" stroke="#475569" stroke-width="4"/>',
    '<text x="70" y="88" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#1E293B">',
    safe,
    '</text>',
    '<text x="70" y="114" font-family="system-ui, sans-serif" font-size="13" fill="#64748B">',
    'FrankiFlow Reinigung · Treppenhaus-Dokumentation (Demo)',
    '</text>',
    '</svg>',
  ].join('');
  return new TextEncoder().encode(svg);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const objectUrlCache = new Map<string, string>();

export function revokeAttachmentUrl(attachmentId: string): void {
  const cached = objectUrlCache.get(attachmentId);
  if (!cached) return;
  objectUrlCache.delete(attachmentId);
  if (
    typeof globalThis.URL !== 'undefined' &&
    typeof globalThis.URL.revokeObjectURL === 'function'
  ) {
    globalThis.URL.revokeObjectURL(cached);
  }
}

export function clearAttachmentUrlCache(): void {
  for (const id of Array.from(objectUrlCache.keys())) {
    revokeAttachmentUrl(id);
  }
}

export function createAttachmentUrl(
  meta: AttachmentMeta,
  custom?: StoredAttachmentData
): string {
  const isBrowser =
    typeof globalThis.document !== 'undefined' &&
    typeof globalThis.URL !== 'undefined' &&
    typeof globalThis.URL.createObjectURL === 'function';

  if (isBrowser) {
    const cached = objectUrlCache.get(meta.id);
    if (cached) return cached;
  }

  let bytes: Uint8Array;
  let contentType = meta.contentType;

  if (custom) {
    contentType = custom.contentType;
    bytes = base64ToBytes(custom.base64);
  } else if (
    meta.contentType === 'application/pdf' ||
    meta.filename.toLowerCase().endsWith('.pdf')
  ) {
    contentType = 'application/pdf';
    bytes = buildMinimalPdf(meta.filename.replace(/\.pdf$/i, ''));
  } else if (
    meta.contentType === 'image/svg+xml' ||
    meta.filename.toLowerCase().endsWith('.svg')
  ) {
    contentType = 'image/svg+xml';
    bytes = buildStaircaseSvg(meta.filename.replace(/\.svg$/i, ''));
  } else {
    contentType = meta.contentType || 'text/plain;charset=utf-8';
    bytes = new TextEncoder().encode(`Demo attachment: ${meta.filename}`);
  }

  if (isBrowser) {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const blob = new Blob([copy], { type: contentType });
    const url = globalThis.URL.createObjectURL(blob);
    objectUrlCache.set(meta.id, url);
    return url;
  }

  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}
