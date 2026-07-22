export const NULL_LIKE_VALUES = new Set([
  '', 'null', 'NULL', 'n/a', 'N/A', 'na', 'NA', '-', '--', 'unknown', 'UNKNOWN', '(blank)', 'blank', 'none', 'None', 'NONE', '#N/A', '#NULL!'
]);

export function normalizeMissingValue(value: string | undefined | null): string {
  if (value == null) return '';
  const trimmed = String(value).trim();
  return NULL_LIKE_VALUES.has(trimmed) ? '' : trimmed;
}

export function normalizeCell(value: string | undefined | null): string {
  return normalizeMissingValue(value).replace(/^"|"$/g, '').trim();
}

export function isBooleanLike(value: string | undefined | null): boolean {
  const v = normalizeCell(value).toLowerCase();
  if (!v) return false;
  return /^(true|false|yes|no|y|n)$/i.test(v) || /^(0|1)$/.test(v);
}

export function isIdentifierHeader(header: string): boolean {
  const h = header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (
    h === 'id' ||
    h.endsWith('_id') ||
    h.includes('uuid') ||
    h.includes('guid') ||
    h.includes('invoice_id') ||
    h.includes('order_id') ||
    h.includes('customer_id') ||
    h.includes('employee_id') ||
    h.includes('transaction_id') ||
    h.includes('account_id') ||
    h.includes('sku') ||
    h.includes('reference') ||
    h.includes('ref_no') ||
    h.includes('serial_no')
  );
}

export function isIdentifierLike(value: string | undefined | null): boolean {
  const v = normalizeCell(value);
  if (!v) return false;
  return (
    /^[A-Z]{2,}-\d+$/i.test(v) ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i.test(v) ||
    /^[A-Z0-9_-]{6,}$/i.test(v) ||
    /^[A-Z]{2,}\d{3,}$/i.test(v)
  );
}

export function isPotentialPiiHeader(header: string): boolean {
  const h = header.toLowerCase();
  return /(email|phone|mobile|passport|ssn|national_id|iban|address|full_name|first_name|last_name|contact)/i.test(h);
}

export function isEmailLike(value: string | undefined | null): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeCell(value));
}

export function isPhoneLike(value: string | undefined | null): boolean {
  const v = normalizeCell(value);
  return /^\+?[0-9][0-9\s().-]{6,}$/.test(v);
}

export function parseEuropeanNumber(value: string | undefined | null): number {
  const raw = normalizeCell(value);
  if (!raw) return Number.NaN;
  const normalized = raw
    .replace(/[\s€$£¥₹]/g, '')
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/%$/, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number(normalized);
}

export function parseMessyNumber(value: string | undefined | null): number {
  const raw = normalizeCell(value);
  if (!raw) return Number.NaN;

  const magnitudeMatch = raw.match(/^\(?\s*([+-]?[\d.,]+(?:e[+-]?\d+)?)\s*([kmbt])\s*\)?$/i);
  const accountingNegative = /^\(.*\)$/.test(raw);
  const suffix = magnitudeMatch?.[2]?.toLowerCase();
  const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : suffix === 't' ? 1e12 : 1;

  let cleaned = (magnitudeMatch?.[1] ?? raw)
    .replace(/[\s€$£¥₹]/g, '')
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/%$/, '');

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    cleaned = /^[+-]?\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
  } else if (hasDot && /^[+-]?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return (accountingNegative && parsed > 0 ? -parsed : parsed) * multiplier;
}

export function isExcelSerialDate(value: string | undefined | null): boolean {
  const n = Number(normalizeCell(value));
  return Number.isFinite(n) && Number.isInteger(n) && n > 20000 && n < 60000;
}

export function excelSerialToIsoDate(serial: number): string {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const date = new Date(excelEpoch.getTime() + serial * 86400000);
  return date.toISOString().slice(0, 10);
}

export function parseMessyDate(value: string | undefined | null): string | null {
  const v = normalizeCell(value);
  if (!v) return null;

  if (isExcelSerialDate(v)) return excelSerialToIsoDate(Number(v));
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  if (/^\d{6}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-01`;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const ymd = v.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const q1 = v.match(/^Q([1-4])[-_ ]?(\d{2}|\d{4})$/i);
  if (q1) {
    const year = q1[2].length === 2 ? `20${q1[2]}` : q1[2];
    const month = (Number(q1[1]) - 1) * 3 + 1;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  const q2 = v.match(/^(\d{2}|\d{4})[-_ ]?Q([1-4])$/i);
  if (q2) {
    const year = q2[1].length === 2 ? `20${q2[1]}` : q2[1];
    const month = (Number(q2[2]) - 1) * 3 + 1;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  const fy = v.match(/^FY(\d{2}|\d{4})(?:[-_ ]?Q([1-4]))?$/i);
  if (fy) {
    const year = fy[1].length === 2 ? `20${fy[1]}` : fy[1];
    const month = fy[2] ? (Number(fy[2]) - 1) * 3 + 1 : 1;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  const week = v.match(/^(\d{4})-?W(\d{1,2})$/i);
  if (week) {
    const year = Number(week[1]);
    const weekNo = Number(week[2]);
    const d = new Date(Date.UTC(year, 0, 1 + (weekNo - 1) * 7));
    return d.toISOString().slice(0, 10);
  }

  const eu = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (eu) {
    const first = Number(eu[1]);
    const second = Number(eu[2]);
    const year = eu[3].length === 2 ? `20${eu[3]}` : eu[3];
    // Prefer European interpretation when first part is > 12, otherwise JS-safe MM/DD fallback is avoided.
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const unix = Number(v);
  if (Number.isFinite(unix) && unix > 1000000000 && unix < 9999999999) {
    return new Date(unix * 1000).toISOString().slice(0, 10);
  }
  if (Number.isFinite(unix) && unix > 1000000000000 && unix < 9999999999999) {
    return new Date(unix).toISOString().slice(0, 10);
  }
  if (Number.isFinite(parseMessyNumber(v))) return null;

  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

export function deduplicateHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const clean = normalizeCell(header) || `column_${index + 1}`;
    const count = (seen.get(clean) ?? 0) + 1;
    seen.set(clean, count);
    return count === 1 ? clean : `${clean}_${count}`;
  });
}
