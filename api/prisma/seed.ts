/**
 * Seed the Repository with sample Everstory data so the deployed pilot opens
 * populated (mirrors the demo content). Idempotent: clears repo folders/cases
 * first. Run with env loaded: `set -a; . ./.env.local; set +a; npm run db:seed`.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PROJECT = 'DS';
const OWNER = 'seed';

async function main(): Promise<void> {
  // Clear existing repo data (cases cascade to steps; then folders).
  await prisma.testCase.deleteMany({});
  await prisma.testFolder.deleteMany({});

  const plotbox = await prisma.testFolder.create({
    data: { name: 'PlotBox (PBX)', projectKey: PROJECT, vendorCode: 'PBX', order: 0 },
  });
  const interment = await prisma.testFolder.create({
    data: { name: 'Plot & Interment', projectKey: PROJECT, vendorCode: 'PBX', order: 0, parentId: plotbox.id },
  });
  const payments = await prisma.testFolder.create({
    data: { name: 'Payments', projectKey: PROJECT, vendorCode: 'PBX', order: 1, parentId: plotbox.id },
  });
  const lawson = await prisma.testFolder.create({
    data: { name: 'Lawson (LWS)', projectKey: PROJECT, vendorCode: 'LWS', order: 1 },
  });
  const financials = await prisma.testFolder.create({
    data: { name: 'Financials', projectKey: PROJECT, vendorCode: 'LWS', order: 0, parentId: lawson.id },
  });
  const uat = await prisma.testFolder.create({
    data: { name: 'Cross-vendor UAT', projectKey: PROJECT, order: 2 },
  });

  const cases = [
    {
      folderId: interment.id,
      title: 'Reserve an available plot for a pre-need customer',
      objective: 'Confirm a sales agent can reserve an unoccupied plot and the status flips to Reserved.',
      preconditions: 'Agent logged in with sales permissions; at least one Available plot exists.',
      testType: 'MANUAL_FUNCTIONAL' as const,
      priority: 'HIGH' as const,
      status: 'ACTIVE' as const,
      vendors: ['PBX' as const],
      labels: ['plot', 'sales'],
      steps: [
        { action: 'Search for an Available plot in the target cemetery and section.', expectedResult: 'Matching available plots are listed with map locations.' },
        { action: 'Select a plot and choose "Reserve".', testData: 'Customer: Jane Doe (pre-need)', expectedResult: 'Reservation form opens pre-filled with the plot identifier.' },
        { action: 'Assign the customer and confirm the reservation.', expectedResult: 'Plot status changes to Reserved and appears under the customer record.' },
      ],
    },
    {
      folderId: interment.id,
      title: 'Schedule an interment service for an occupied plot',
      objective: 'Verify interment scheduling blocks double-booking of the same plot/time.',
      testType: 'REGRESSION' as const,
      priority: 'CRITICAL' as const,
      status: 'ACTIVE' as const,
      vendors: ['PBX' as const],
      labels: ['interment', 'scheduling'],
      steps: [
        { action: 'Open an occupied plot with an existing reservation.', expectedResult: 'Plot detail shows the linked customer and contract.' },
        { action: 'Create an interment service overlapping an existing service.', testData: 'Same plot, overlapping window', expectedResult: 'System blocks the booking and shows a conflict warning.' },
      ],
    },
    {
      folderId: payments.id,
      title: 'Apply a deposit payment to a plot contract',
      objective: 'Ensure a partial deposit updates the contract balance correctly.',
      testType: 'MANUAL_FUNCTIONAL' as const,
      priority: 'MEDIUM' as const,
      status: 'ACTIVE' as const,
      vendors: ['PBX' as const, 'CPA' as const],
      labels: ['payments'],
      steps: [
        { action: 'Open a contract with an outstanding balance.', expectedResult: 'Balance and payment schedule are shown.' },
        { action: 'Record a deposit payment.', testData: 'Amount: $500.00', expectedResult: 'Balance decreases by the deposit; receipt is generated.' },
      ],
    },
    {
      folderId: financials.id,
      title: 'Post a daily revenue batch to the GL',
      objective: 'Confirm the nightly revenue batch posts to the correct Lawson GL accounts.',
      testType: 'REGRESSION' as const,
      priority: 'HIGH' as const,
      status: 'DRAFT' as const,
      vendors: ['LWS' as const],
      labels: ['gl', 'finance'],
      steps: [
        { action: 'Trigger the daily revenue batch export.', expectedResult: 'Batch file is produced with the day’s transactions.' },
        { action: 'Import the batch into Lawson and review the GL posting.', expectedResult: 'Totals reconcile and post to the expected accounts.' },
      ],
    },
    {
      folderId: uat.id,
      title: 'End-to-end: sale → payment → interment scheduling',
      objective: 'Full happy-path across PlotBox and Lawson for a single customer.',
      testType: 'UAT' as const,
      priority: 'CRITICAL' as const,
      status: 'ACTIVE' as const,
      vendors: ['PBX' as const, 'LWS' as const, 'CPA' as const],
      environments: ['STAGING' as const],
      labels: ['e2e', 'uat'],
      estimatedDurationMinutes: 45,
      steps: [
        { action: 'Create a new pre-need sale for a customer.', expectedResult: 'Contract is created in PlotBox.' },
        { action: 'Take a deposit and confirm it flows to Lawson financials.', expectedResult: 'Payment posts in both systems and reconciles.' },
        { action: 'Schedule the interment service.', expectedResult: 'Service is booked with no conflicts and notifications send.' },
      ],
    },
  ];

  for (const c of cases) {
    const { steps, ...rest } = c;
    await prisma.testCase.create({
      data: {
        ...rest,
        ownerAccountId: OWNER,
        environments: rest.environments ?? ['TEST'],
        steps: { create: steps.map((s, i) => ({ order: i + 1, ...s })) },
      },
    });
  }

  const folderCount = await prisma.testFolder.count();
  const caseCount = await prisma.testCase.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded ${folderCount} folders and ${caseCount} test cases.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
