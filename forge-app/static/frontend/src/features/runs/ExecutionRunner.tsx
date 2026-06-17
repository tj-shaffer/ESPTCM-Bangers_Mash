/** The execution runner — step through a test case, mark Pass/Fail/Blocked/Skip
 *  per step, record actual results, and complete the execution. */

import { useRef, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { Modal } from '../../components/ui';
import {
  fetchAttachment,
  useAddAttachment,
  useCompleteExecution,
  useCreateDefect,
  useDeleteAttachment,
  useExecution,
  useJiraOptions,
  useLinkDefectJiraManual,
  useLinkDefectToJira,
  useSetStepResult,
} from '../../api/runs';
import { useAuth } from '../../context/AuthContext';
import { EXEC_STATUS_LABEL, PRIORITIES, tcId } from '../../domain/types';
import type { AttachmentView, ExecutionDetail, ExecutionStatus, Priority } from '../../domain/types';

const STEP_STATUSES: ExecutionStatus[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'ENHANCEMENT'];
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Read a File into raw base64 (strips the data: URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: type || 'application/octet-stream' });
}

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

          {data.steps.map((s) => {
            const gated = s.screenshotRequired && s.attachments.length === 0;
            return (
              <div className="esp-rstep" key={s.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="esp-step-num">{s.order}</span>
                  <ExecBadge status={s.status} />
                  {s.screenshotRequired ? (
                    <span className="esp-badge esp-badge-soft" title="A screenshot is required to mark this step">
                      📎 Screenshot required
                    </span>
                  ) : null}
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

                <StepAttachments
                  stepResultId={s.id}
                  attachments={s.attachments}
                  runId={runId}
                />

                <div className="esp-rstep-actions">
                  {STEP_STATUSES.map((st) => (
                    <button
                      key={st}
                      className={`esp-vbtn${s.status === st ? ` on-${st}` : ''}`}
                      disabled={gated}
                      title={gated ? 'Attach a screenshot first' : undefined}
                      onClick={() =>
                        setStep.mutate({ executionId, stepResultId: s.id, patch: { status: st } })
                      }
                    >
                      {EXEC_STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
                {gated ? (
                  <p className="esp-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    📎 Attach a screenshot above to mark this step.
                  </p>
                ) : null}

                <ActualResult
                  initial={s.actualResult ?? ''}
                  onSave={(actualResult) =>
                    setStep.mutate({ executionId, stepResultId: s.id, patch: { actualResult } })
                  }
                />
              </div>
            );
          })}

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
  const auth = useAuth();
  // Mohammad: managers control Jira tickets — testers log defects, managers link them.
  const canManageJira = auth.can('defect.linkJira');
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
              ) : canManageJira ? (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ManualJiraLink defectId={d.id} runId={runId} />
                  {jiraReady ? (
                    <>
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
                    </>
                  ) : null}
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

function ManualJiraLink({ defectId, runId }: { defectId: string; runId: string }) {
  const [key, setKey] = useState('');
  const link = useLinkDefectJiraManual(runId);
  const submit = () => {
    if (key.trim()) link.mutate({ defectId, jiraIssueKey: key.trim() });
  };
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input
        className="esp-input"
        style={{ width: 120, padding: '4px 8px', fontSize: 12 }}
        placeholder="PLOT-123"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <button
        className="esp-btn esp-btn-secondary"
        onClick={submit}
        disabled={!key.trim() || link.isPending}
        title="Link an existing Jira issue (no ticket is created)"
      >
        {link.isPending ? 'Linking…' : '🔗 Link'}
      </button>
    </span>
  );
}

function StepAttachments({
  stepResultId,
  attachments,
  runId,
}: {
  stepResultId: string;
  attachments: AttachmentView[];
  runId: string;
}) {
  const addAtt = useAddAttachment(runId);
  const delAtt = useDeleteAttachment(runId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File) => {
    setError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('File too large (max 8 MB).');
      return;
    }
    try {
      const dataBase64 = await fileToBase64(file);
      await addAtt.mutateAsync({
        stepResultId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        dataBase64,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const view = async (id: string) => {
    const a = await fetchAttachment(id);
    if (!a) return;
    const url = URL.createObjectURL(base64ToBlob(a.dataBase64, a.contentType));
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="esp-btn esp-btn-secondary" onClick={() => fileRef.current?.click()} disabled={addAtt.isPending}>
          {addAtt.isPending ? 'Uploading…' : '📎 Attach screenshot'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPick(f);
            e.target.value = '';
          }}
        />
        {attachments.map((a) => (
          <span key={a.id} className="esp-badge esp-badge-soft" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button
              className="esp-link-btn"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', textDecoration: 'underline' }}
              onClick={() => void view(a.id)}
              title="Open attachment"
            >
              {a.contentType.startsWith('image/') ? '🖼' : '📄'} {a.filename}
            </button>
            <button
              className="esp-link-btn"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
              onClick={() => delAtt.mutate(a.id)}
              title="Remove attachment"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {error ? <p className="esp-error" style={{ fontSize: 12, margin: '4px 0 0' }}>{error}</p> : null}
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
