/** Flexible CSV/Excel import: upload → map columns → preview → import. */

import { useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/ui';
import { useImportCases } from '../../api/repository';
import {
  FIELD_DEFS,
  buildImportRows,
  guessMapping,
  parseSpreadsheet,
  type FieldKey,
  type ParsedSheet,
} from './parse';

type Stage = 'upload' | 'map' | 'done';

interface Props {
  folderId: string;
  folderName: string;
  onClose: () => void;
  onImported: (count: number) => void;
}

export function ImportWizard({ folderId, folderName, onClose, onImported }: Props) {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [parseError, setParseError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const importMut = useImportCases();

  const handleFile = async (file: File) => {
    setParseError(null);
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.headers.length === 0) {
        setParseError('Could not read any columns from that file. Is the first row a header?');
        return;
      }
      setFileName(file.name);
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
      setStage('map');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  const importRows = useMemo(
    () => (sheet ? buildImportRows(sheet, mapping) : []),
    [sheet, mapping],
  );

  const titleMapped = !!mapping.title;

  const runImport = async () => {
    const res = await importMut.mutateAsync({ folderId, rows: importRows });
    setCreatedCount(res.created);
    setStage('done');
    onImported(res.created);
  };

  return (
    <Modal
      title={`Import test cases → ${folderName}`}
      onClose={onClose}
      footer={
        stage === 'map' ? (
          <>
            <button className="esp-btn esp-btn-secondary" onClick={() => setStage('upload')} disabled={importMut.isPending}>
              Back
            </button>
            <button
              className="esp-btn esp-btn-primary"
              onClick={runImport}
              disabled={!titleMapped || importRows.length === 0 || importMut.isPending}
            >
              {importMut.isPending ? 'Importing…' : `Import ${importRows.length} test case${importRows.length === 1 ? '' : 's'}`}
            </button>
          </>
        ) : stage === 'done' ? (
          <button className="esp-btn esp-btn-primary" onClick={onClose}>
            Done
          </button>
        ) : undefined
      }
    >
      <div className="esp-steps-wizard">
        <WizardStep n={1} label="Upload" active={stage === 'upload'} />
        <WizardStep n={2} label="Map columns" active={stage === 'map'} />
        <WizardStep n={3} label="Imported" active={stage === 'done'} />
      </div>

      {stage === 'upload' && (
        <>
          <div
            className="esp-dropzone"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            <div style={{ fontSize: 28 }}>⬆️</div>
            <div style={{ fontWeight: 700, color: 'var(--esp-ink)' }}>Drop a CSV or Excel file here</div>
            <div style={{ fontSize: 12 }}>or click to browse · .csv, .tsv, .xlsx, .xls</div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {parseError ? <p className="esp-error" style={{ marginTop: 12 }}>{parseError}</p> : null}
          <p className="esp-muted" style={{ fontSize: 12, marginTop: 14 }}>
            Your spreadsheet's columns don't need specific names — you'll map them to TestForge fields on the next step.
          </p>
        </>
      )}

      {stage === 'map' && sheet && (
        <>
          <p className="esp-muted" style={{ fontSize: 12, marginTop: 0 }}>
            <strong>{fileName}</strong> · {sheet.rows.length} rows, {sheet.headers.length} columns. Match your columns to
            TestForge fields:
          </p>
          <div className="esp-map-grid" style={{ marginBottom: 18 }}>
            {FIELD_DEFS.map((def) => (
              <div key={def.key} style={{ display: 'contents' }}>
                <label className="esp-label" style={{ marginBottom: 0, alignSelf: 'center' }}>
                  {def.label}
                  {def.required ? <span style={{ color: 'var(--esp-critical)' }}> *</span> : ''}
                  {def.hint ? <span className="esp-muted" style={{ fontWeight: 400, textTransform: 'none' }}> · {def.hint}</span> : null}
                </label>
                <select
                  className="esp-select"
                  value={mapping[def.key] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [def.key]: e.target.value }))}
                >
                  <option value="">— not mapped —</option>
                  {sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!titleMapped ? (
            <p className="esp-error">Map a column to <strong>Title</strong> to continue.</p>
          ) : (
            <>
              <div className="esp-label">Preview · {Math.min(importRows.length, 5)} of {importRows.length}</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="esp-preview-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Priority</th>
                      <th>Vendors</th>
                      <th>Steps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td title={r.title}>{r.title}</td>
                        <td>{r.testType ?? '—'}</td>
                        <td>{r.priority ?? '—'}</td>
                        <td>{r.vendors && r.vendors.length ? r.vendors.join(', ') : '—'}</td>
                        <td>{r.steps?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length === 0 ? (
                <p className="esp-error" style={{ marginTop: 10 }}>No rows have a title value — nothing to import.</p>
              ) : null}
            </>
          )}
          {importMut.isError ? (
            <p className="esp-error" style={{ marginTop: 10 }}>{(importMut.error as Error).message}</p>
          ) : null}
        </>
      )}

      {stage === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 34 }}>✅</div>
          <h3 style={{ marginTop: 8 }}>Imported {createdCount} test case{createdCount === 1 ? '' : 's'}</h3>
          <p className="esp-muted">They're now in <strong>{folderName}</strong>.</p>
        </div>
      )}
    </Modal>
  );
}

function WizardStep({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <div className={`esp-wizard-step${active ? ' active' : ''}`}>
      <span className="esp-wizard-dot">{n}</span>
      {label}
    </div>
  );
}
