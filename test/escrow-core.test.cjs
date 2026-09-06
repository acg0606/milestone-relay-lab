'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyEvent,
  assertInvariants,
  buildReceipt,
  createInitialState,
  replay,
} = require('../src/escrow-core.js');
const { scenarios } = require('../src/scenarios.js');
const preservedReceipts = require('../evidence/offline-replay-receipts-v02.json');

function eventAt(scenario, index) {
  return JSON.parse(JSON.stringify(scenario.events[index]));
}

test('settles the release fixture while conserving all simulated units', () => {
  const state = replay(scenarios.release.events);
  const receipt = buildReceipt(state);

  assert.equal(state.status, 'SETTLED');
  assert.equal(state.ledger.simulatedBalanceUnits, 0);
  assert.equal(state.ledger.releasedUnits, 1000);
  assert.equal(state.ledger.refundedUnits, 0);
  assert.deepEqual(state.milestones.map((milestone) => milestone.status), ['RELEASED', 'RELEASED']);
  assert.equal(receipt.claims.realEscrowCreated, false);
  assert.equal(receipt.claims.crossChainProofGenerated, false);
  assert.equal(receipt.safetyBoundary.externalCalls, 0);
});

test('rejects evidence, resolves a dispute and refunds only simulated balance', () => {
  const state = replay(scenarios.dispute.events);

  assert.equal(state.status, 'REFUNDED');
  assert.equal(state.ledger.refundedUnits, 1000);
  assert.equal(state.ledger.releasedUnits, 0);
  assert.deepEqual(state.milestones.map((milestone) => milestone.status), ['REFUNDED', 'REFUNDED']);
  assert.equal(state.milestones[0].dispute.outcome, 'REFUND');
});

test('requires the deterministic deadline before the timeout path', () => {
  const state = replay(scenarios.timeout.events);
  assert.equal(state.status, 'REFUNDED');
  assert.equal(state.timeline.some((entry) => entry.type === 'MARK_TIMEOUT'), true);

  const tooEarly = eventAt(scenarios.timeout, 2);
  tooEarly.at = '2026-08-29T11:59:59.000Z';
  assert.throws(
    () => replay([scenarios.timeout.events[0], scenarios.timeout.events[1], tooEarly]),
    /TIMEOUT_TOO_EARLY/,
  );
});

test('produces the same trace fingerprint for the same ordered fixture', () => {
  const first = replay(scenarios.release.events);
  const second = replay(JSON.parse(JSON.stringify(scenarios.release.events)));
  assert.equal(first.traceFingerprint, second.traceFingerprint);
  assert.match(first.traceFingerprint, /^trace-fnv1a64:[0-9a-f]{16}$/u);
});

test('blocks replay of an event identifier before any economic transition', () => {
  const initial = createInitialState('REPLAY');
  const created = applyEvent(initial, scenarios.release.events[0]);
  assert.throws(() => applyEvent(created, scenarios.release.events[0]), /EVENT_REPLAY_BLOCKED/);
  assert.equal(created.ledger.funded, false);
});

test('blocks release before evidence approval', () => {
  const releaseTooSoon = {
    id: 'evt-release-too-soon',
    type: 'RELEASE_MILESTONE',
    at: '2026-08-23T12:02:00.000Z',
    payload: { milestoneId: 'M1', amountUnits: 400 },
  };
  assert.throws(
    () => replay([scenarios.release.events[0], scenarios.release.events[1], releaseTooSoon]),
    /RELEASE_REQUIRES_APPROVAL/,
  );
});

test('blocks milestone reordering and over-release', () => {
  const evidenceM2 = eventAt(scenarios.release, 2);
  evidenceM2.id = 'evt-order-evidence-m2';
  evidenceM2.payload.milestoneId = 'M2';
  assert.throws(
    () => replay([scenarios.release.events[0], scenarios.release.events[1], evidenceM2]),
    /MILESTONE_ORDER_VIOLATION/,
  );

  const events = scenarios.release.events.slice(0, 4).map((event) => JSON.parse(JSON.stringify(event)));
  const wrongRelease = eventAt(scenarios.release, 4);
  wrongRelease.payload.amountUnits = 401;
  assert.throws(() => replay([...events, wrongRelease]), /RELEASE_AMOUNT_MISMATCH/);
});

test('blocks capability-bearing fields from an offline event', () => {
  const unsafe = eventAt(scenarios.release, 1);
  unsafe.id = 'evt-unsafe-fund';
  unsafe.payload.walletAddress = 'not-accepted';
  assert.throws(
    () => replay([scenarios.release.events[0], unsafe]),
    /SENSITIVE_CAPABILITY_FIELD_BLOCKED/,
  );
});

test('blocks clock rewind and any action after terminal settlement', () => {
  const reversed = eventAt(scenarios.release, 1);
  reversed.at = '2026-08-22T12:00:00.000Z';
  assert.throws(() => replay([scenarios.release.events[0], reversed]), /CLOCK_REWIND_BLOCKED/);

  const settled = replay(scenarios.release.events);
  const extra = {
    id: 'evt-after-terminal',
    type: 'FUND_SIMULATED',
    at: '2026-08-27T12:00:00.000Z',
    payload: { amountUnits: 1000 },
  };
  assert.throws(() => applyEvent(settled, extra), /ESCROW_TERMINAL/);
});

test('detects ledger tampering through explicit invariants', () => {
  const state = replay(scenarios.release.events.slice(0, 2));
  state.ledger.simulatedBalanceUnits = 999;
  assert.throws(() => assertInvariants(state), /INVARIANT_LEDGER_CONSERVATION/);
});

test('rejects a create fixture whose milestone amounts do not match budget', () => {
  const create = eventAt(scenarios.release, 0);
  create.payload.milestones[1].amountUnits = 599;
  assert.throws(() => replay([create]), /MILESTONE_BUDGET_MISMATCH/);
});

test('keeps the preserved v0.2 receipts synchronized with executable fixtures', () => {
  const actual = Object.values(scenarios).map((scenario) => {
    const receipt = buildReceipt(replay(scenario.events));
    return {
      id: scenario.id,
      status: receipt.status,
      eventCount: receipt.eventCount,
      traceFingerprint: receipt.traceFingerprint,
      ledger: {
        budgetUnits: receipt.ledger.budgetUnits,
        simulatedBalanceUnits: receipt.ledger.simulatedBalanceUnits,
        releasedUnits: receipt.ledger.releasedUnits,
        refundedUnits: receipt.ledger.refundedUnits,
      },
    };
  });
  assert.deepEqual(actual, preservedReceipts.scenarios);
  assert.equal(preservedReceipts.safetyBoundary.externalCalls, 0);
  assert.equal(Object.values(preservedReceipts.claims).every((claim) => claim === false), true);
});

test('conserves value when a released milestone is followed by a partial refund', () => {
  const events = scenarios.release.events.slice(0, 6).map((event) => JSON.parse(JSON.stringify(event)));
  events.push(
    {
      id: 'evt-partial-reject-m2', type: 'REJECT_MILESTONE', at: '2026-08-26T09:30:00.000Z',
      payload: { milestoneId: 'M2', reviewerAlias: 'Cooperative Reviewer', reason: 'Handoff fixture requires correction.' },
    },
    {
      id: 'evt-partial-dispute-m2', type: 'OPEN_DISPUTE', at: '2026-08-26T09:40:00.000Z',
      payload: { milestoneId: 'M2', openedByAlias: 'Field Engineering Guild', reason: 'Request review before returning the remainder.' },
    },
    {
      id: 'evt-partial-resolve-m2', type: 'RESOLVE_DISPUTE', at: '2026-08-26T09:50:00.000Z',
      payload: { milestoneId: 'M2', outcome: 'REFUND', resolverAlias: 'Demo Resolution Panel', note: 'Return only the unreleased remainder.' },
    },
    {
      id: 'evt-partial-refund-m2', type: 'REFUND_REMAINDER', at: '2026-08-26T09:51:00.000Z',
      payload: { amountUnits: 600 },
    },
  );
  const state = replay(events);
  assert.equal(state.status, 'REFUNDED');
  assert.deepEqual(state.milestones.map((milestone) => milestone.status), ['RELEASED', 'REFUNDED']);
  assert.deepEqual(state.ledger, {
    budgetUnits: 1000,
    simulatedBalanceUnits: 0,
    releasedUnits: 400,
    refundedUnits: 600,
    funded: true,
  });
});
