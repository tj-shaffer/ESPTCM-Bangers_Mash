import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { dispatch, DispatchError } from '../src/repository/dispatch';
import type { TestCaseStore } from '../src/repository/store';

// Stub the audit write (run.signOff records before/after) so these stay pure
// unit tests with no database. auditEntityType etc. stay real.
vi.mock('../src/lib/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/audit')>();
  return { ...actual, recordAudit: vi.fn(async () => {}) };
});

// A fake store that records the stage transitions dispatch asks for. Only the
// methods the run-stage paths touch are implemented; the rest throw if hit so a
// mistaken call is loud rather than silent.
function makeStore(overrides: Partial<TestCaseStore> = {}): TestCaseStore {
  const base = {
    setRunStage: async (id: string, stage: string) => ({ id, stage }),
    getRun: async (_id: string) => ({ id: _id, stage: 'READY_FOR_APPROVAL' }),
    signOffRun: async (_id: string, decision: unknown) => ({ id: _id, decision }),
  };
  return new Proxy(
    { ...base, ...overrides },
    {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        return () => {
          throw new Error(`unexpected store call: ${prop}`);
        };
      },
    },
  ) as unknown as TestCaseStore;
}

const ACCOUNT = 'acc-1';

describe('dispatch run.setStage — tester vs. manager gate', () => {
  it('lets a FIELD_OPERATOR submit a run for QC (COMPLETED_BY_TESTER)', async () => {
    const store = makeStore();
    const res = await dispatch(
      store,
      'run.setStage',
      { id: 'run-1', stage: 'COMPLETED_BY_TESTER' },
      ACCOUNT,
      Role.FIELD_OPERATOR,
    );
    expect(res).toEqual({ id: 'run-1', stage: 'COMPLETED_BY_TESTER' });
  });

  it('blocks a non-manager from advancing past submission (403)', async () => {
    const store = makeStore();
    for (const stage of ['IN_QC_REVIEW', 'READY_FOR_APPROVAL', 'APPROVED', 'IN_PROGRESS']) {
      await expect(
        dispatch(store, 'run.setStage', { id: 'run-1', stage }, ACCOUNT, Role.FIELD_OPERATOR),
      ).rejects.toMatchObject({ status: 403 });
    }
  });

  it('lets a TEST_MANAGER advance the run through QC', async () => {
    const store = makeStore();
    const res = await dispatch(
      store,
      'run.setStage',
      { id: 'run-1', stage: 'IN_QC_REVIEW' },
      ACCOUNT,
      Role.TEST_MANAGER,
    );
    expect(res).toEqual({ id: 'run-1', stage: 'IN_QC_REVIEW' });
  });

  it('rejects an invalid stage value', async () => {
    const store = makeStore();
    await expect(
      dispatch(store, 'run.setStage', { id: 'run-1', stage: 'NONSENSE' }, ACCOUNT, Role.SUPER_ADMIN),
    ).rejects.toBeInstanceOf(DispatchError);
  });
});

describe('dispatch run.signOff — approval guard', () => {
  it('signs off a run that is READY_FOR_APPROVAL', async () => {
    const store = makeStore();
    const res = await dispatch(
      store,
      'run.signOff',
      { id: 'run-1', decision: 'APPROVED', approverName: 'Mgr' },
      ACCOUNT,
      Role.TEST_MANAGER,
    );
    expect(res).toMatchObject({ id: 'run-1' });
  });

  it('refuses to sign off a run that is not READY_FOR_APPROVAL (400)', async () => {
    const store = makeStore({ getRun: async (id: string) => ({ id, stage: 'IN_QC_REVIEW' }) as never });
    await expect(
      dispatch(
        store,
        'run.signOff',
        { id: 'run-1', decision: 'APPROVED', approverName: 'Mgr' },
        ACCOUNT,
        Role.TEST_MANAGER,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('requires a valid decision and an approver name', async () => {
    const store = makeStore();
    await expect(
      dispatch(store, 'run.signOff', { id: 'run-1', decision: 'MAYBE', approverName: 'Mgr' }, ACCOUNT, Role.TEST_MANAGER),
    ).rejects.toBeInstanceOf(DispatchError);
    await expect(
      dispatch(store, 'run.signOff', { id: 'run-1', decision: 'APPROVED' }, ACCOUNT, Role.TEST_MANAGER),
    ).rejects.toBeInstanceOf(DispatchError);
  });

  it('404s when the run does not exist', async () => {
    const store = makeStore({ getRun: async () => null as never });
    await expect(
      dispatch(
        store,
        'run.signOff',
        { id: 'missing', decision: 'APPROVED', approverName: 'Mgr' },
        ACCOUNT,
        Role.TEST_MANAGER,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('dispatch repo.deleteCase — surfaces failures', () => {
  it("throws 409 when the store can't delete (no longer a silent false)", async () => {
    const store = makeStore({ deleteCase: async () => false });
    await expect(
      dispatch(store, 'repo.deleteCase', { id: 'case-1' }, ACCOUNT, Role.TEST_AUTHOR),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns { deleted: true } on success', async () => {
    const store = makeStore({ deleteCase: async () => true });
    const res = await dispatch(store, 'repo.deleteCase', { id: 'case-1' }, ACCOUNT, Role.TEST_AUTHOR);
    expect(res).toEqual({ deleted: true });
  });
})
