/** The execution runner — step through a test case, mark Pass/Fail/Blocked/Skip
 *  per step, record actual results, and complete the execution. */

import { useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { Modal } from '../../components/ui';
import {
  useCompleteExecution,
  useCreateDefect,
  useExecution,
  useJiraOptions,
  useLinkDefectToJira,
  useSetStepResult,
} from '../../api/runs';
import { EXEC_STATUS_LABEL, PRIORITIES, tcId } from '../../domain/types';
import type { ExecutionDetail, ExecutionStatus, Priority } from '../../domain/types';

const STEP_STATUSES: ExecutionStatus[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

export function ExecBadge({ status }: { status: ExecutionStatus }) {
  return <span className={`esp-exec esp-exec-${status}`}>{EXEC_STATUS_LABEL[status]}</span>;
}

export function ExecutionRunner({
  executionId,
  runId,
  onClose,
}: {
  executionId: string;
  runId: string;
  onClose: () => void;
}) {
  const exec = useExecution(executionId);
  const setStep = useSetStepResult(runId);
  const complete = useCompleteExecution(runId);

  const data = exec.data;

  return (
    <Modal
      title={data ? `Run: ${data.runName}` : 'Execution'}
      onClose={onClose}
      footer={
        data ? (
          <>
            <span className="esp-muted" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 13 }}>
              Overall: <ExecBadge status={data.status} />
            </span>
            <button className="esp-btn esp-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              className="esp-btn esp-btn-primary"
              onClick={() => complete.mutate(executionId, { onSuccess: onClose })}
              disabled={complete.isPending}
            >
              {complete.isPending ? 'Saving…' : 'Complete execution'}
            </button>
          </>
        ) : undefined
      }
    >
      {exec.isLoading || !data ? (
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <div className="esp-muted" style={{ fontSize: 12, fontWeight: 700 }}>
              {tcId(data.testCaseDisplayId)} · {data.environment}
            </div>
            <h3 style={{ fontSize: 16, margin: '2px 0 6px' }}>{data.title}</h3>
            {data.objective ? <p className="esp-muted" style={{ margin: 0, fontSize: 13 }}>{data.objective}</p> : null}
            {data.preconditions ? (
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                <strong>Preconditions: </strong>
                {data.preconditions}
              </p>
            ) : null}
          </div>

          {data.steps.map((s) => (
            <div className="esp-rstep" key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="esp-step-num">{s.order}</span>
                <ExecBadge status={s.status} />
              </div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>{s.action}</div>
              {s.testData ? (
                <div className="esp-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Data: {s.testData}
                </div>
              ) : null}
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <strong>Expected: </strong>
                {s.expectedResult}
              </div>

              <div className="esp-rstep-actions">
                {STEP_STATUSES.map((st) => (
                  <button
                    key={st}
                    className={`esp-vbtn${s.status === st ? ` on-${st}` : ''}`}
                    onClick={() =>
                      setStep.mutate({ executionId, stepResultId: s.id, patch: { status: st } })
                    }
                  >
                    {EXEC_STATUS_LABEL[st]}
                  </button>
                ))}
              </div>

              <ActualResult
                initial={s.actualResult ?? ''}
                onSave={(actualResult) =>
                  setStep.mutate({ executionId, stepResultId: s.id, patch: { actualResult } })
                }
              />
            </div>
          ))}

          <DefectsPanel exec={data} runId={runId} />
        </>
      )}
    </Modal>
  );
}

function DefectsPanel({ exec, runId }: { exec: ExecutionDetail; runId: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<Priority>('HIGH');
  const [description, setDescription] = useState('');
  const createDefect = useCreateDefect(runId);
  const linkJira = useLinkDefectToJira(runId);
  const jiraOpts = useJiraOptions();
  const [typeByDefect, setTypeByDefect] = useState<Record<string, string>>({});
  const jiraTypes = jiraOpts.data?.issueTypes ?? [];
  const jiraReady = !!jiraOpts.data?.configured && jiraTypes.length > 0;

  const submit = () => {
    if (!summary.trim()) return;
    createDefect.mutate(
      { executionId: exec.id, input: { summary, severity, description: description || undefined } },
      {
        onSuccess: () => {
          setSummary('');
          setDescription('');
          setOpen(false);
        },
      },
    );
  };

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--esp-border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="esp-label" style={{ marginBottom: 0 }}>
          Defects ({exec.defects.length})
        </span>
        {!open ? (
          <button className="esp-btn esp-btn-secondary" onClick={() => setOpen(true)}>
            + Log defect
          </button>
        ) : null}
      </div>

      {exec.defects.map((d) => (
        <div key={d.id} className="esp-rstep" style={{ borderLeft: '3px solid var(--esp-critical)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`esp-badge esp-prio-${d.severity}`}>{d.severity}</span>
            <strong style={{ fontSize: 13 }}>{d.summary}</strong>
            <span style={{ marginLeft: 'auto' }}>
              {d.jiraIssueKey ? (
                d.jiraUrl ? (
                  <a className="esp-badge esp-badge-soft" href={d.jiraUrl} target="_blank" rel="noreferrer">
                    {d.jiraIssueKey} ↗
                  </a>
                ) : (
                  <span className="esp-badge esp-badge-soft">{d.jiraIssueKey}</span>
                )
              ) : jiraReady ? (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="esp-select"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                    value={typeByDefect[d.id] ?? jiraTypes[0] ?? ''}
                    onChange={(e) => setTypeByDefect((m) => ({ ...m, [d.id]: e.target.value }))}
                  >
                    {jiraTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    className="esp-btn esp-btn-secondary"
                    onClick={() => linkJira.mutate({ defectId: d.id, issueType: typeByDefect[d.id] ?? jiraTypes[0] })}
                    disabled={linkJira.isPending}
                  >
                    {linkJira.isPending && linkJira.variables?.defectId === d.id ? 'Creating…' : 'Create Jira issue'}
                  </button>
                </span>
              ) : null}
            </span>
          </div>
          {d.description ? (
            <div className="esp-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {d.description}
            </div>
          ) : null}
        </div>
      ))}

      {linkJira.isError ? (
        <p className="esp-error" style={{ fontSize: 12 }}>{(linkJira.error as Error).message}</p>
      ) : null}

      {open ? (
        <div className="esp-rstep" style={{ background: 'var(--esp-powder-soft)' }}>
          <div className="esp-grid-2" style={{ marginBottom: 8 }}>
            <input
              className="esp-input"
              autoFocus
              placeholder="Defect summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <select className="esp-select" value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="esp-textarea"
            style={{ minHeight: 44, marginBottom: 8 }}
            placeholder="What went wrong? (steps to reproduce, actual vs expected)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="esp-btn esp-btn-primary" onClick={submit} disabled={!summary.trim() || createDefect.isPending}>
              {createDefect.isPending ? 'Saving…' : 'Save defect'}
            </button>
            <button className="esp-btn esp-btn-secondary" onClick={() => setOpen(false)} disabled={createDefect.isPending}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActualResult({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(initial);
  return (
    <textarea
      className="esp-textarea"
      style={{ minHeight: 38 }}
      placeholder="Actual result / notes (optional)"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== initial) onSave(val);
      }}
    />
  );
}
