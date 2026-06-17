/** Reporting dashboard: KPI cards + status / vendor / environment charts +
 *  recent executions. */

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
import { useDashboard } from '../../api/runs';
import { EXEC_STATUS_LABEL } from '../../domain/types';
import type { ExecutionStatus } from '../../domain/types';
import { ExecBadge } from '../runs/ExecutionRunner';

const STATUS_COLOR: Record<ExecutionStatus, string> = {
  PASS: '#2E7D5B',
  FAIL: '#C9372C',
  BLOCKED: '#B07D1A',
  IN_PROGRESS: '#4F94BC',
  NOT_STARTED: '#8FA1AD',
  SKIPPED: '#B4B2A9',
  ENHANCEMENT: '#6B4FB8',
};

export function DashboardView() {
  const dash = useDashboard();

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
