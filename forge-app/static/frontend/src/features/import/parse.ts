/**
 * Client-side spreadsheet parsing + field normalization for the import wizard.
 * Parsing happens in the browser (not the resolver) to avoid Forge's ~25s
 * invocation timeout and payload limits — only the mapped rows cross the wire.
 */

import Papa from 'papaparse';
import type {
  ImportedCaseRow,
  Priority,
  TestStepInput,
  TestType,
  VendorCode,
} from '../../domain/types';

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
  /** All worksheet/tab names (Excel only). Empty/absent for CSV. */
  sheetNames?: string[];
  /** Which worksheet these headers/rows came from (Excel only). */
  activeSheet?: string;
}

export type FieldKey =
  | 'title'
  | 'objective'
  | 'preconditions'
  | 'testType'
  | 'priority'
  | 'vendors'
  | 'steps'
  | 'expected';

export const FIELD_DEFS: { key: FieldKey; label: string; required?: boolean; hint?: string }[] = [
  { key: 'title', label: 'Title', required: true },
  { key: 'objective', label: 'Objective' },
  { key: 'preconditions', label: 'Preconditions' },
  { key: 'testType', label: 'Test type' },
  { key: 'priority', label: 'Priority' },
  { key: 'vendors', label: 'Vendors', hint: 'PBX, LWS, CPA, HG' },
  { key: 'steps', label: 'Steps', hint: 'one step per line' },
  { key: 'expected', label: 'Expected results', hint: 'aligns line-by-line to steps' },
];

const GUESS: Record<FieldKey, string[]> = {
  title: ['title', 'test name', 'testcase', 'test case', 'name', 'summary', 'scenario'],
  objective: ['objective', 'description', 'purpose', 'goal'],
  preconditions: ['precondition', 'pre-condition', 'prereq', 'setup'],
  testType: ['test type', 'type'],
  priority: ['priority', 'severity'],
  vendors: ['vendor', 'system', 'application', 'platform'],
  steps: ['steps', 'step', 'action', 'procedure', 'instructions'],
  expected: ['expected', 'result', 'outcome'],
};

export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCsv(file);
  }
  return parseExcel(file);
}

/** Re-parse a specific worksheet/tab from an Excel workbook the user already picked. */
export function parseExcelSheet(file: File, sheetName: string): Promise<ParsedSheet> {
  return parseExcel(file, sheetName);
}

function parseCsv(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter((h) => h && h.trim().length > 0);
        resolve({ headers, rows: res.data });
      },
      error: (err) => reject(err),
    });
  });
}

async function parseExcel(file: File, sheetName?: string): Promise<ParsedSheet> {
  // Loaded on demand — keeps SheetJS (~400 KB) out of the initial bundle.
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetNames = wb.SheetNames;
  // Honor a requested tab (multi-tab workbooks); otherwise default to the first.
  const target = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  if (!target) return { headers: [], rows: [], sheetNames };
  const sheet = wb.Sheets[target];
  if (!sheet) return { headers: [], rows: [], sheetNames, activeSheet: target };
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false });
  const headers = rows.length > 0 ? Object.keys(rows[0]!).filter((h) => h.trim().length > 0) : [];
  return { headers, rows, sheetNames, activeSheet: target };
}

/** Best-guess initial mapping from header names. */
export function guessMapping(headers: string[]): Record<FieldKey, string> {
  const mapping = {} as Record<FieldKey, string>;
  for (const def of FIELD_DEFS) {
    const match = headers.find((h) => {
      const lower = h.toLowerCase().trim();
      return GUESS[def.key].some((kw) => lower === kw || lower.includes(kw));
    });
    mapping[def.key] = match ?? '';
  }
  return mapping;
}

function normalizeType(raw: string): TestType | undefined {
  const v = raw.toUpperCase();
  if (v.includes('REGRESS')) return 'REGRESSION';
  if (v.includes('UAT') || v.includes('ACCEPT')) return 'UAT';
  if (v.includes('SMOKE')) return 'SMOKE';
  if (v.includes('EXPLOR')) return 'EXPLORATORY';
  if (v.includes('FUNCT') || v.includes('MANUAL')) return 'MANUAL_FUNCTIONAL';
  return undefined;
}

function normalizePriority(raw: string): Priority | undefined {
  const v = raw.toUpperCase();
  if (v.includes('CRIT') || v.startsWith('P0') || v === '1') return 'CRITICAL';
  if (v.includes('HIGH') || v.startsWith('P1') || v === '2') return 'HIGH';
  if (v.includes('MED') || v.startsWith('P2') || v === '3') return 'MEDIUM';
  if (v.includes('LOW') || v.startsWith('P3') || v === '4') return 'LOW';
  return undefined;
}

const KNOWN_VENDORS: VendorCode[] = ['PBX', 'LWS', 'CPA', 'HG'];
const VENDOR_SPLIT = new RegExp('[,;/|]+|\\s{2,}');

function normalizeVendors(raw: string): VendorCode[] {
  const tokens = raw.toUpperCase().split(VENDOR_SPLIT).map((t) => t.trim());
  const out: VendorCode[] = [];
  for (const t of tokens) {
    const code = KNOWN_VENDORS.find((c) => t === c || t.includes(c));
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

const LINE_SPLIT = new RegExp('\\r?\\n|;');
const STEP_PREFIX = new RegExp('^\\s*\\d+[).:-]\\s*');

function splitLines(raw: string): string[] {
  return raw
    .split(LINE_SPLIT)
    .map((l) => l.replace(STEP_PREFIX, '').trim())
    .filter((l) => l.length > 0);
}

function buildSteps(stepsCell: string, expectedCell: string): TestStepInput[] {
  const actions = splitLines(stepsCell);
  const expecteds = splitLines(expectedCell);
  if (actions.length === 0 && expectedCell.trim()) {
    return [{ action: '', expectedResult: expectedCell.trim() }];
  }
  return actions.map((action, i) => ({ action, expectedResult: expecteds[i] ?? '' }));
}

/** Turn parsed rows + a column mapping into import-ready case rows. */
export function buildImportRows(sheet: ParsedSheet, mapping: Record<FieldKey, string>): ImportedCaseRow[] {
  const get = (row: Record<string, string>, key: FieldKey): string => {
    const col = mapping[key];
    return col ? String(row[col] ?? '').trim() : '';
  };

  return sheet.rows
    .map((row): ImportedCaseRow | null => {
      const title = get(row, 'title');
      if (!title) return null;
      const steps = buildSteps(get(row, 'steps'), get(row, 'expected'));
      return {
        title,
        objective: get(row, 'objective') || undefined,
        preconditions: get(row, 'preconditions') || undefined,
        testType: mapping.testType ? normalizeType(get(row, 'testType')) : undefined,
        priority: mapping.priority ? normalizePriority(get(row, 'priority')) : undefined,
        vendors: mapping.vendors ? normalizeVendors(get(row, 'vendors')) : undefined,
        steps: steps.length > 0 ? steps : undefined,
      };
    })
    .filter((r): r is ImportedCaseRow => r !== null);
}

// ---------- downloadable import template ----------

/**
 * Standard column headers for the import template. Chosen so `guessMapping`
 * auto-maps every column — a file built from this template imports with no
 * manual mapping needed.
 */
export const TEMPLATE_HEADERS = [
  'Title',
  'Objective',
  'Preconditions',
  'Test Type',
  'Priority',
  'Vendors',
  'Steps',
  'Expected Results',
] as const;

const TEMPLATE_EXAMPLE_ROW: Record<(typeof TEMPLATE_HEADERS)[number], string> = {
  'Title': 'PlotBox — apply discount threshold at checkout',
  'Objective': 'Verify a configured discount threshold applies to the order total',
  'Preconditions': 'Discount management configured; a test order exists',
  'Test Type': 'Regression',
  'Priority': 'High',
  'Vendors': 'PBX',
  'Steps': 'Open the test order\nApply the discount threshold\nReview the order total',
  'Expected Results': 'Order opens\nThreshold is accepted\nTotal reflects the discount',
};

/** Build the standard import template as a CSV string (header row + one example). */
export function buildTemplateCsv(): string {
  return Papa.unparse([TEMPLATE_EXAMPLE_ROW], { columns: TEMPLATE_HEADERS as unknown as string[] });
}

/** Trigger a browser download of the standard import template. */
export function downloadTemplate(filename = 'testforge-import-template.csv'): void {
  const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
