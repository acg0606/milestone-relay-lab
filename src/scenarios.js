(function exposeEscrowScenarios(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EscrowScenarios = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildScenarios() {
  'use strict';

  function baseCreate(prefix) {
    return {
      id: `evt-${prefix}-create`,
      type: 'CREATE_ESCROW',
      at: '2026-08-23T12:00:00.000Z',
      payload: {
        title: 'Community solar installation',
        clientAlias: 'Solar Cooperative',
        builderAlias: 'Field Engineering Guild',
        budgetUnits: 1000,
        deadlineAt: '2026-08-30T12:00:00.000Z',
        milestones: [
          { id: 'M1', title: 'Site commissioning evidence', amountUnits: 400 },
          { id: 'M2', title: 'Operations handoff evidence', amountUnits: 600 },
        ],
      },
    };
  }

  function baseFund(prefix) {
    return {
      id: `evt-${prefix}-fund`,
      type: 'FUND_SIMULATED',
      at: '2026-08-23T12:01:00.000Z',
      payload: { amountUnits: 1000 },
    };
  }

  const release = [
    baseCreate('release'),
    baseFund('release'),
    {
      id: 'evt-release-evidence-m1', type: 'SUBMIT_EVIDENCE', at: '2026-08-24T09:00:00.000Z',
      payload: { milestoneId: 'M1', summary: 'Commissioning checklist and meter fixture attached.', artifactRef: 'artifact://demo/commissioning-v1', sourceFixture: 'SYNTHETIC_SOURCE_EVENT_001' },
    },
    {
      id: 'evt-release-approve-m1', type: 'APPROVE_MILESTONE', at: '2026-08-24T10:00:00.000Z',
      payload: { milestoneId: 'M1', reviewerAlias: 'Cooperative Reviewer', note: 'Fixture satisfies the demo acceptance checklist.' },
    },
    {
      id: 'evt-release-m1', type: 'RELEASE_MILESTONE', at: '2026-08-24T10:01:00.000Z',
      payload: { milestoneId: 'M1', amountUnits: 400 },
    },
    {
      id: 'evt-release-evidence-m2', type: 'SUBMIT_EVIDENCE', at: '2026-08-26T09:00:00.000Z',
      payload: { milestoneId: 'M2', summary: 'Operations handoff fixture and maintenance guide attached.', artifactRef: 'artifact://demo/handoff-v1', sourceFixture: 'SYNTHETIC_SOURCE_EVENT_002' },
    },
    {
      id: 'evt-release-approve-m2', type: 'APPROVE_MILESTONE', at: '2026-08-26T10:00:00.000Z',
      payload: { milestoneId: 'M2', reviewerAlias: 'Cooperative Reviewer', note: 'Handoff fixture satisfies the demo acceptance checklist.' },
    },
    {
      id: 'evt-release-m2', type: 'RELEASE_MILESTONE', at: '2026-08-26T10:01:00.000Z',
      payload: { milestoneId: 'M2', amountUnits: 600 },
    },
  ];

  const dispute = [
    baseCreate('dispute'),
    baseFund('dispute'),
    {
      id: 'evt-dispute-evidence-m1', type: 'SUBMIT_EVIDENCE', at: '2026-08-24T09:00:00.000Z',
      payload: { milestoneId: 'M1', summary: 'Incomplete commissioning fixture attached for review.', artifactRef: 'artifact://demo/incomplete-v1', sourceFixture: 'SYNTHETIC_SOURCE_EVENT_003' },
    },
    {
      id: 'evt-dispute-reject-m1', type: 'REJECT_MILESTONE', at: '2026-08-24T10:00:00.000Z',
      payload: { milestoneId: 'M1', reviewerAlias: 'Cooperative Reviewer', reason: 'Required safety checklist is absent from the fixture.' },
    },
    {
      id: 'evt-dispute-open-m1', type: 'OPEN_DISPUTE', at: '2026-08-24T11:00:00.000Z',
      payload: { milestoneId: 'M1', openedByAlias: 'Field Engineering Guild', reason: 'Request a neutral review of the rejected fixture.' },
    },
    {
      id: 'evt-dispute-resolve-m1', type: 'RESOLVE_DISPUTE', at: '2026-08-25T11:00:00.000Z',
      payload: { milestoneId: 'M1', outcome: 'REFUND', resolverAlias: 'Demo Resolution Panel', note: 'Fixture remains incomplete; authorize refund of all simulated units.' },
    },
    {
      id: 'evt-dispute-refund', type: 'REFUND_REMAINDER', at: '2026-08-25T11:01:00.000Z',
      payload: { amountUnits: 1000 },
    },
  ];

  const timeout = [
    baseCreate('timeout'),
    baseFund('timeout'),
    {
      id: 'evt-timeout-mark-m1', type: 'MARK_TIMEOUT', at: '2026-08-30T12:00:01.000Z',
      payload: { milestoneId: 'M1' },
    },
    {
      id: 'evt-timeout-open-m1', type: 'OPEN_DISPUTE', at: '2026-08-30T12:05:00.000Z',
      payload: { milestoneId: 'M1', openedByAlias: 'Solar Cooperative', reason: 'No milestone fixture was submitted before the deterministic deadline.' },
    },
    {
      id: 'evt-timeout-resolve-m1', type: 'RESOLVE_DISPUTE', at: '2026-08-30T13:00:00.000Z',
      payload: { milestoneId: 'M1', outcome: 'REFUND', resolverAlias: 'Demo Resolution Panel', note: 'Timeout is confirmed; authorize refund of all simulated units.' },
    },
    {
      id: 'evt-timeout-refund', type: 'REFUND_REMAINDER', at: '2026-08-30T13:01:00.000Z',
      payload: { amountUnits: 1000 },
    },
  ];

  const scenarios = Object.freeze({
    release: Object.freeze({
      id: 'release',
      label: 'Verified release path',
      description: 'Synthetic evidence is approved and every simulated unit is released in milestone order.',
      events: Object.freeze(release),
    }),
    dispute: Object.freeze({
      id: 'dispute',
      label: 'Reject, dispute & refund',
      description: 'Incomplete evidence is rejected, reviewed and resolved with a full simulated refund.',
      events: Object.freeze(dispute),
    }),
    timeout: Object.freeze({
      id: 'timeout',
      label: 'Timeout & refund',
      description: 'The deterministic clock reaches the deadline, opening a dispute and safe refund path.',
      events: Object.freeze(timeout),
    }),
  });

  return Object.freeze({ scenarios });
}));
