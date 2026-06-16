/**
 * Demo seed data — sample Everstory folders + test cases so the Repository
 * view is populated the moment `forge tunnel` starts, before any real data
 * exists. Replaced by Forge SQL content once the dev site is provisioned.
 */

import { randomUUID } from 'crypto';
import type { TestCase, TestFolder } from './types';

const DEFAULT_PROJECT = 'DS';
const OWNER = 'seed-user';

export interface SeedState {
  folders: TestFolder[];
  cases: TestCase[];
  nextDisplayId: number;
}

export function buildSeedState(): SeedState {
  const now = new Date('2026-06-01T09:00:00.000Z').toISOString();

  const fPlotbox: TestFolder = mkFolder('PlotBox (PBX)', null, now, { vendorCode: 'PBX', order: 0 });
  const fInterment: TestFolder = mkFolder('Plot & Interment', fPlotbox.id, now, { vendorCode: 'PBX', order: 0 });
  const fPayments: TestFolder = mkFolder('Payments', fPlotbox.id, now, { vendorCode: 'PBX', order: 1 });
  const fLawson: TestFolder = mkFolder('Lawson (LWS)', null, now, { vendorCode: 'LWS', order: 1 });
  const fFinancials: TestFolder = mkFolder('Financials', fLawson.id, now, { vendorCode: 'LWS', order: 0 });
  const fUat: TestFolder = mkFolder('Cross-vendor UAT', null, now, { order: 2 });

  const folders = [fPlotbox, fInterment, fPayments, fLawson, fFinancials, fUat];

  let displayId = 1041;
  const mk = (
    folderId: string,
    title: string,
    rest: Partial<TestCase> & Pick<TestCase, 'testType' | 'priority' | 'status'>,
  ): TestCase => ({
    id: randomUUID(),
    displayId: ++displayId,
    title,
    vendors: [],
    environments: ['TEST'],
    folderId,
    ownerAccountId: OWNER,
    version: 1,
    labels: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
    ...rest,
  });

  const cases: TestCase[] = [
    mk(fInterment.id, 'Reserve an available plot for a pre-need customer', {
      objective: 'Confirm a sales agent can reserve an unoccupied plot and the status flips to Reserved.',
      preconditions: 'Agent is logged in with sales permissions; at least one Available plot exists in the selected cemetery.',
      testType: 'MANUAL_FUNCTIONAL',
      priority: 'HIGH',
      status: 'ACTIVE',
      vendors: ['PBX'],
      labels: ['plot', 'sales'],
      steps: [
        { id: randomUUID(), order: 1, action: 'Search for an Available plot in the target cemetery and section.', expectedResult: 'Matching available plots are listed with map locations.' },
        { id: randomUUID(), order: 2, action: 'Select a plot and choose "Reserve".', testData: 'Customer: Jane Doe (pre-need)', expectedResult: 'Reservation form opens pre-filled with the plot identifier.' },
        { id: randomUUID(), order: 3, action: 'Assign the customer and confirm the reservation.', expectedResult: 'Plot status changes to Reserved and appears under the customer record.' },
      ],
    }),
    mk(fInterment.id, 'Schedule an interment service for an occupied plot', {
      objective: 'Verify interment scheduling blocks double-booking of the same plot/time.',
      testType: 'REGRESSION',
      priority: 'CRITICAL',
      status: 'ACTIVE',
      vendors: ['PBX'],
      labels: ['interment', 'scheduling'],
      steps: [
        { id: randomUUID(), order: 1, action: 'Open an occupied plot with an existing reservation.', expectedResult: 'Plot detail shows the linked customer and contract.' },
        { id: randomUUID(), order: 2, action: 'Create an interment service for a date/time that overlaps an existing service.', testData: 'Same plot, overlapping window', expectedResult: 'System blocks the booking and shows a conflict warning.' },
      ],
    }),
    mk(fPayments.id, 'Apply a deposit payment to a plot contract', {
      objective: 'Ensure a partial deposit updates the contract balance correctly.',
      testType: 'MANUAL_FUNCTIONAL',
      priority: 'MEDIUM',
      status: 'ACTIVE',
      vendors: ['PBX', 'CPA'],
      labels: ['payments'],
      steps: [
        { id: randomUUID(), order: 1, action: 'Open a contract with an outstanding balance.', expectedResult: 'Balance and payment schedule are shown.' },
        { id: randomUUID(), order: 2, action: 'Record a deposit payment.', testData: 'Amount: $500.00', expectedResult: 'Balance decreases by the deposit; receipt is generated.' },
      ],
    }),
    mk(fFinancials.id, 'Post a daily revenue batch to the GL', {
      objective: 'Confirm the nightly revenue batch posts to the correct Lawson GL accounts.',
      testType: 'REGRESSION',
      priority: 'HIGH',
      status: 'DRAFT',
      vendors: ['LWS'],
      labels: ['gl', 'finance'],
      steps: [
        { id: randomUUID(), order: 1, action: 'Trigger the daily revenue batch export.', expectedResult: 'Batch file is produced with the day’s transactions.' },
        { id: randomUUID(), order: 2, action: 'Import the batch into Lawson and review the GL posting.', expectedResult: 'Totals reconcile and post to the expected accounts.' },
      ],
    }),
    mk(fUat.id, 'End-to-end: sale → payment → interment scheduling', {
      objective: 'Full happy-path across PlotBox and Lawson for a single customer.',
      testType: 'UAT',
      priority: 'CRITICAL',
      status: 'ACTIVE',
      vendors: ['PBX', 'LWS', 'CPA'],
      environments: ['STAGING'],
      labels: ['e2e', 'uat'],
      estimatedDurationMinutes: 45,
      steps: [
        { id: randomUUID(), order: 1, action: 'Create a new pre-need sale for a customer.', expectedResult: 'Contract is created in PlotBox.' },
        { id: randomUUID(), order: 2, action: 'Take a deposit and confirm it flows to Lawson financials.', expectedResult: 'Payment posts in both systems and reconciles.' },
        { id: randomUUID(), order: 3, action: 'Schedule the interment service.', expectedResult: 'Service is booked with no conflicts and notifications send.' },
      ],
    }),
  ];

  return { folders, cases, nextDisplayId: displayId + 1 };
}

function mkFolder(
  name: string,
  parentId: string | null,
  ts: string,
  extra: Partial<TestFolder>,
): TestFolder {
  return {
    id: randomUUID(),
    name,
    parentId,
    projectKey: DEFAULT_PROJECT,
    order: 0,
    createdAt: ts,
    updatedAt: ts,
    ...extra,
  };
}
