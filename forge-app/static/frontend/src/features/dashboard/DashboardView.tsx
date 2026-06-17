/** Reporting dashboard: KPI cards + status / vendor / environment charts +
 *  recent executions. */

import { useEffect, useMemo, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchReport, useDashboard, usePackages, useRuns } from '../../api/runs';
import { useFolderTree, useProjects } from '../../api/repository';
import { EXEC_STATUS_LABEL, RUN_STAGE_LABEL, TEST_TYPES, TEST_TYPE_LABELS, tcId } from '../../domain/types';
import type { DashboardData, DashboardFilters, ExecutionStatus, ReportRow, TestType } from '../../domain/types';
import { ExecBadge } from '../runs/ExecutionRunner';

async function exportResults(d: DashboardData, rows: ReportRow[], scopeLabel: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const statusLines = (Object.keys(d.byStatus) as ExecutionStatus[])
    .filter((s) => d.byStatus[s] > 0)
    .map((s) => [EXEC_STATUS_LABEL[s], d.byStatus[s]]);
  const summary = [
    ['TestForge — Results Export'],
    ['Scope', scopeLabel],
    [],
    ['Metric', 'Value'],
    ['Test cases', d.totalCases],
    ['Test runs', d.totalRuns],
    ['Pass rate', `${d.passRate}%`],
    ['Coverage', `${d.coverage.executed}/${d.coverage.total} cases run`],
    ['Defects', d.defectCount],
    [],
    ['Result', 'Count'],
    ...statusLines,
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const header = [
    'Test Case', 'Title', 'Run', 'Package', 'Vendors', 'Environment',
    'Result', 'Steps', 'Defects', 'Jira', 'Assignee', 'Stage', 'Updated',
  ];
  const detail = rows.map((r) => [
    tcId(r.displayId), r.title, r.runName, r.packageName ?? '', r.vendors.join(', '), r.environment,
    EXEC_STATUS_LABEL[r.status], `${r.stepsDone}/${r.stepsTotal}`, r.defectCount, r.jiraKeys.join(', '),
    r.assigneeName ?? '', RUN_STAGE_LABEL[r.stage], new Date(r.updatedAt).toLocaleString(),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...detail]), 'Detail');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'testforge-results.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const STATUS_COLOR: Record<ExecutionStatus, string> = {
  PASS: '#2E7D5B',
  FAIL: '#C9372C',
  BLOCKED: '#B07D1A',
  IN_PROGRESS: '#4F94BC',
  NOT_STARTED: '#8FA1AD',
  SKIPPED: '#B4B2A9',
  ENHANCEMENT: '#6B4FB8',
};

export function DashboardView({ deepRunId = null }: { deepRunId?: string | null } = {}) {
  const [projectKey, setProjectKey] = useState('');
  const [folderId, setFolderId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [runId, setRunId] = useState(deepRunId ?? '');
  const [testType, setTestType] = useState<TestType | ''>('');
  const [exporting, setExporting] = useState(false);

  // Arriving from a run summary's "View in dashboard" (#dashboard/<runId>):
  // pre-select that run so the charts open already scoped to it.
  useEffect(() => {
    if (deepRunId) {
      setRunId(deepRunId);
      setPackageId('');
    }
  }, [deepRunId]);

  const filters: DashboardFilters = useMemo(
    () => ({
      ...(runId ? { runId } : packageId ? { packageId } : {}),
      ...(testType ? { testType } : {}),
      ...(folderId ? { folderId } : {}),
    }),
    [packageId, runId, testType, folderId],
  );

  const projects = useProjects();
  const appTree = useFolderTree(projectKey || undefined);
  const packages = usePackages();
  const runs = useRuns();
  const dash = useDashboard(filters, projectKey || undefined);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (projectKey) parts.push(`Project: ${projectKey}`);
    if (folderId) parts.push(`App: ${appTree.data?.find((f) => f.id === folderId)?.name ?? folderId}`);
    if (runId) parts.push(`Run: ${runs.data?.find((r) => r.id === runId)?.name ?? runId}`);
    else if (packageId) parts.push(`Package: ${packages.data?.find((p) => p.id === packageId)?.name ?? packageId}`);
    if (testType) parts.push(`Type: ${TEST_TYPE_LABELS[testType]}`);
    return parts.length ? parts.join(' · ') : 'All runs';
  }, [projectKey, folderId, runId, packageId, testType, appTree.data, runs.data, packages.data]);

  const runExport = async () => {
    if (!dash.data) return;
    setExporting(true);
    try {
      const rows = await fetchReport(filters, projectKey || undefined);
      await exportResults(dash.data, rows, scopeLabel);
    } finally {
      setExporting(false);
    }
  };

  const topFolders = appTree.data ?? [];

  const filterBar = (
    <div className="esp-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <select
        className="esp-select"
        style={{ width: 'auto' }}
        title="Filter by Jira project"
        value={projectKey}
        onChange={(e) => {
          setProjectKey(e.target.value);
          setFolderId(''); // applications are project-scoped; reset when project changes
        }}
      >
        <option value="">All projects</option>
        {(projects.data ?? []).map((pk) => (
          <option key={pk} value={pk}>
            {pk}
          </option>
        ))}
      </select>
      <select
        className="esp-select"
        style={{ width: 'auto' }}
        title="Filter by application (top-level folder)"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
      >
        <option value="">All applications</option>
        {topFolders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <select
        className="esp-select"
        style={{ width: 'auto' }}
        value={runId ? `run:${runId}` : packageId ? `pkg:${packageId}` : ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('run:')) {
            setRunId(v.slice(4));
            setPackageId('');
          } else if (v.startsWith('pkg:')) {
            setPackageId(v.slice(4));
            setRunId('');
          } else {
            setRunId('');
            setPackageId('');
          }
        }}
      >
        <option value="">All runs &amp; packages</option>
        {(packages.data ?? []).length > 0 ? (
          <optgroup label="Packages">
            {(packages.data ?? []).map((p) => (
              <option key={p.id} value={`pkg:${p.id}`}>
                📦 {p.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {(runs.data ?? []).length > 0 ? (
          <optgroup label="Runs">
            {(runs.data ?? []).map((r) => (
              <option key={r.id} value={`run:${r.id}`}>
                {r.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <select
        className="esp-select"
        style={{ width: 'auto' }}
        value={testType}
        onChange={(e) => setTestType(e.target.value as TestType | '')}
      >
        <option value="">All types</option>
        {TEST_TYPES.map((t) => (
          <option key={t} value={t}>
            {TEST_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <div className="esp-header-spacer" />
      <button className="esp-btn esp-btn-secondary" onClick={() => void runExport()} disabled={exporting || !dash.data}>
        {exporting ? 'Exporting…' : '⬇ Export results'}
      </button>
    </div>
  );

  if (dash.isLoading || !dash.data) {
    return (
      <div className="esp-spinner-wrap">
        <Spinner size="large" />
      </div>
    );
  }
  if (dash.isError) {
    return <div className="esp-error" style={{ padding: 20 }}>Failed to load dashboard: {(dash.error as Error).message}</div>;
  }

  const d = dash.data;
  const coveragePct = d.coverage.total > 0 ? Math.round((d.coverage.executed / d.coverage.total) * 100) : 0;

  const statusData = (Object.keys(d.byStatus) as ExecutionStatus[])
    .map((s) => ({ status: s, name: EXEC_STATUS_LABEL[s], value: d.byStatus[s] }))
    .filter((x) => x.value > 0);

  const totalExecutions = (Object.values(d.byStatus) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div className="esp-scroll-pane">
      {filterBar}
      <div className="esp-metrics">
        <Metric label="Test cases" value={String(d.totalCases)} />
        <Metric label="Test runs" value={String(d.totalRuns)} />
        <Metric label="Pass rate" value={`${d.passRate}%`} />
        <Metric label="Coverage" value={`${coveragePct}%`} sub={`${d.coverage.executed}/${d.coverage.total} cases run`} />
        <Metric label="Defects" value={String(d.defectCount)} />
      </div>

      {totalExecutions === 0 ? (
        <div className="esp-card">
          <p className="esp-muted" style={{ margin: 0 }}>
            No executions yet. Create a run under <strong>Test Runs</strong> and start executing to populate reporting.
          </p>
        </div>
      ) : (
        <div className="esp-cards-2">
          <div className="esp-card">
            <h3>Execution status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                  {statusData.map((e) => (
                    <Cell key={e.status} fill={STATUS_COLOR[e.status]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {d.byVendor.length > 0 ? (
            <div className="esp-card">
              <h3>Results by vendor</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.byVendor}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAF5FA" />
                  <XAxis dataKey="vendor" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pass" name="Pass" stackId="a" fill={STATUS_COLOR.PASS} />
                  <Bar dataKey="fail" name="Fail" stackId="a" fill={STATUS_COLOR.FAIL} />
                  <Bar dataKey="other" name="Other" stackId="a" fill={STATUS_COLOR.NOT_STARTED} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {d.byEnvironment.length > 0 ? (
            <div className="esp-card">
              <h3>Results by environment</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.byEnvironment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAF5FA" />
                  <XAxis dataKey="environment" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pass" name="Pass" stackId="a" fill={STATUS_COLOR.PASS} />
                  <Bar dataKey="fail" name="Fail" stackId="a" fill={STATUS_COLOR.FAIL} />
                  <Bar dataKey="other" name="Other" stackId="a" fill={STATUS_COLOR.NOT_STARTED} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="esp-card">
            <h3>Recent executions</h3>
            {d.recent.length === 0 ? (
              <p className="esp-muted" style={{ margin: 0 }}>Nothing yet.</p>
            ) : (
              d.recent.map((r) => (
                <div
                  key={r.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--esp-border)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>{r.title}</div>
                    <div className="esp-muted" style={{ fontSize: 11 }}>{r.runName}</div>
                  </div>
                  <ExecBadge status={r.status} />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="esp-metric">
      <div className="esp-metric-label">{label}</div>
      <div className="esp-metric-value">{value}</div>
      {sub ? <div className="esp-muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
