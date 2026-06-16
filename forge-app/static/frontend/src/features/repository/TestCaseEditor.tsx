/**
 * Detail/editor pane. Drives create + edit of a test case and its steps.
 * Self-contained form state; emits a CreateTestCaseInput-shaped payload on save.
 */

import { useEffect, useRef, useState } from 'react';
import {
  PRIORITIES,
  STATUSES,
  TEST_TYPES,
  TEST_TYPE_LABELS,
  VENDOR_CODES,
  VENDOR_LABELS,
  tcId,
} from '../../domain/types';
import type {
  CreateTestCaseInput,
  Priority,
  TestCase,
  TestCaseStatus,
  TestType,
  VendorCode,
} from '../../domain/types';
import { Field } from '../../components/ui';

interface StepDraft {
  _key: number;
  action: string;
  testData: string;
  expectedResult: string;
}

interface FormState {
  title: string;
  objective: string;
  preconditions: string;
  testType: TestType;
  priority: Priority;
  status: TestCaseStatus;
  vendors: VendorCode[];
  steps: StepDraft[];
}

interface Props {
  /** Existing case to edit, or null when authoring a new one. */
  testCase: TestCase | null;
  isNew: boolean;
  folderName: string;
  saving: boolean;
  onSave: (input: Omit<CreateTestCaseInput, 'folderId'>) => void;
  onCancelNew?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

let keyCounter = 1;
const nextKey = () => keyCounter++;

function toForm(tc: TestCase | null): FormState {
  if (!tc) {
    return {
      title: '',
      objective: '',
      preconditions: '',
      testType: 'MANUAL_FUNCTIONAL',
      priority: 'MEDIUM',
      status: 'DRAFT',
      vendors: [],
      steps: [{ _key: nextKey(), action: '', testData: '', expectedResult: '' }],
    };
  }
  return {
    title: tc.title,
    objective: tc.objective ?? '',
    preconditions: tc.preconditions ?? '',
    testType: tc.testType,
    priority: tc.priority,
    status: tc.status,
    vendors: [...tc.vendors],
    steps:
      tc.steps.length > 0
        ? tc.steps.map((s) => ({
            _key: nextKey(),
            action: s.action,
            testData: s.testData ?? '',
            expectedResult: s.expectedResult,
          }))
        : [{ _key: nextKey(), action: '', testData: '', expectedResult: '' }],
  };
}

export function TestCaseEditor({
  testCase,
  isNew,
  folderName,
  saving,
  onSave,
  onCancelNew,
  onDuplicate,
  onDelete,
}: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(testCase));
  const [dirty, setDirty] = useState(isNew);

  // Re-seed when a different case is selected.
  const loadedId = useRef<string | null>(testCase?.id ?? null);
  useEffect(() => {
    const id = testCase?.id ?? null;
    if (id !== loadedId.current || isNew) {
      loadedId.current = id;
      setForm(toForm(testCase));
      setDirty(isNew);
    }
  }, [testCase, isNew]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const toggleVendor = (v: VendorCode) =>
    set('vendors', form.vendors.includes(v) ? form.vendors.filter((x) => x !== v) : [...form.vendors, v]);

  const setStep = (key: number, patch: Partial<StepDraft>) =>
    set('steps', form.steps.map((s) => (s._key === key ? { ...s, ...patch } : s)));

  const addStep = () =>
    set('steps', [...form.steps, { _key: nextKey(), action: '', testData: '', expectedResult: '' }]);

  const removeStep = (key: number) => set('steps', form.steps.filter((s) => s._key !== key));

  const moveStep = (key: number, dir: -1 | 1) => {
    const idx = form.steps.findIndex((s) => s._key === key);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= form.steps.length) return;
    const next = [...form.steps];
    const a = next[idx]!;
    next[idx] = next[swap]!;
    next[swap] = a;
    set('steps', next);
  };

  const canSave = form.title.trim().length > 0 && dirty && !saving;

  const submit = () => {
    onSave({
      title: form.title,
      objective: form.objective || undefined,
      preconditions: form.preconditions || undefined,
      testType: form.testType,
      priority: form.priority,
      status: form.status,
      vendors: form.vendors,
      steps: form.steps
        .filter((s) => s.action.trim() || s.expectedResult.trim())
        .map((s) => ({
          action: s.action,
          testData: s.testData || undefined,
          expectedResult: s.expectedResult,
        })),
    });
    setDirty(false);
  };

  return (
    <div className="esp-detail">
      <div className="esp-detail-head">
        <div style={{ flex: 1 }}>
          <div className="esp-muted" style={{ fontSize: 12, fontWeight: 700 }}>
            {isNew ? `New test case · ${folderName}` : tcId(testCase!.displayId)}
            {!isNew && testCase ? ` · v${testCase.version}` : ''}
          </div>
        </div>
        {!isNew && onDuplicate ? (
          <button className="esp-btn esp-btn-ghost" onClick={onDuplicate} disabled={saving}>
            ⧉ Duplicate
          </button>
        ) : null}
        {!isNew && onDelete ? (
          <button className="esp-btn esp-btn-danger" onClick={onDelete} disabled={saving}>
            Delete
          </button>
        ) : null}
      </div>

      <Field label="Title">
        <input
          className="esp-input"
          value={form.title}
          placeholder="e.g. Reserve an available plot"
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>

      <div className="esp-grid-2">
        <Field label="Type">
          <select className="esp-select" value={form.testType} onChange={(e) => set('testType', e.target.value as TestType)}>
            {TEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className="esp-select" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Status">
        <select className="esp-select" value={form.status} onChange={(e) => set('status', e.target.value as TestCaseStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Vendors">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {VENDOR_CODES.map((v) => {
            const on = form.vendors.includes(v);
            return (
              <button
                key={v}
                type="button"
                className={`esp-btn ${on ? 'esp-btn-secondary' : 'esp-btn-ghost'}`}
                style={on ? { background: 'var(--esp-powder)', borderColor: 'var(--esp-border-strong)' } : undefined}
                onClick={() => toggleVendor(v)}
              >
                {on ? '✓ ' : ''}
                {VENDOR_LABELS[v]} ({v})
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Objective">
        <textarea
          className="esp-textarea"
          value={form.objective}
          placeholder="What this test verifies"
          onChange={(e) => set('objective', e.target.value)}
        />
      </Field>

      <Field label="Preconditions">
        <textarea
          className="esp-textarea"
          value={form.preconditions}
          placeholder="State the system must be in before running"
          onChange={(e) => set('preconditions', e.target.value)}
        />
      </Field>

      <div className="esp-field">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label className="esp-label" style={{ marginBottom: 0 }}>
            Steps ({form.steps.length})
          </label>
          <button className="esp-btn esp-btn-secondary" onClick={addStep}>
            + Add step
          </button>
        </div>

        {form.steps.map((s, i) => (
          <div className="esp-step" key={s._key}>
            <div className="esp-step-head">
              <span className="esp-step-num">{i + 1}</span>
              <div style={{ flex: 1 }} />
              <button className="esp-btn esp-btn-ghost" onClick={() => moveStep(s._key, -1)} disabled={i === 0} title="Move up">
                ↑
              </button>
              <button
                className="esp-btn esp-btn-ghost"
                onClick={() => moveStep(s._key, 1)}
                disabled={i === form.steps.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button className="esp-btn esp-btn-ghost" onClick={() => removeStep(s._key)} title="Remove step">
                ✕
              </button>
            </div>
            <textarea
              className="esp-textarea"
              style={{ minHeight: 40, marginBottom: 6 }}
              placeholder="Action — what the tester does"
              value={s.action}
              onChange={(e) => setStep(s._key, { action: e.target.value })}
            />
            <input
              className="esp-input"
              style={{ marginBottom: 6 }}
              placeholder="Test data (optional)"
              value={s.testData}
              onChange={(e) => setStep(s._key, { testData: e.target.value })}
            />
            <textarea
              className="esp-textarea"
              style={{ minHeight: 40 }}
              placeholder="Expected result"
              value={s.expectedResult}
              onChange={(e) => setStep(s._key, { expectedResult: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="esp-btn esp-btn-primary" onClick={submit} disabled={!canSave}>
          {saving ? 'Saving…' : isNew ? 'Create test case' : 'Save changes'}
        </button>
        {isNew && onCancelNew ? (
          <button className="esp-btn esp-btn-secondary" onClick={onCancelNew} disabled={saving}>
            Cancel
          </button>
        ) : null}
        {!isNew && dirty ? <span className="esp-muted" style={{ alignSelf: 'center', fontSize: 12 }}>Unsaved changes</span> : null}
      </div>
    </div>
  );
}
