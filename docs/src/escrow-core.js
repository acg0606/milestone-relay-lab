(function exposeEscrowCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EscrowCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildEscrowCore() {
  'use strict';

  const MODES = Object.freeze(['DEMO', 'REPLAY']);
  const EVENT_TYPES = Object.freeze([
    'CREATE_ESCROW',
    'FUND_SIMULATED',
    'SUBMIT_EVIDENCE',
    'APPROVE_MILESTONE',
    'REJECT_MILESTONE',
    'MARK_TIMEOUT',
    'OPEN_DISPUTE',
    'RESOLVE_DISPUTE',
    'RELEASE_MILESTONE',
    'REFUND_REMAINDER',
  ]);
  const MILESTONE_STATUSES = Object.freeze([
    'PENDING',
    'EVIDENCE_SUBMITTED',
    'APPROVED',
    'REJECTED',
    'TIMED_OUT',
    'DISPUTED',
    'REFUND_AUTHORIZED',
    'RELEASED',
    'REFUNDED',
  ]);
  const TERMINAL_STATUSES = new Set(['SETTLED', 'REFUNDED']);
  const PROHIBITED_KEYS = /(?:private.?key|seed|mnemonic|signature|wallet|rpc.?url|contract.?address|tx.?hash|transaction.?hash)/iu;

  function fail(code, detail) {
    const suffix = detail ? `:${detail}` : '';
    throw new Error(`${code}${suffix}`);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isIsoDate(value) {
    return typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
      && Number.isFinite(Date.parse(value));
  }

  function requireText(value, code, maxLength = 160) {
    if (typeof value !== 'string' || value.trim().length < 2 || value.length > maxLength) {
      fail(code);
    }
    return value.trim();
  }

  function requireUnits(value, code) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      fail(code);
    }
    return value;
  }

  function findProhibitedKey(value, path = 'event') {
    if (!value || typeof value !== 'object') return null;
    for (const [key, nested] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      if (PROHIBITED_KEYS.test(key)) return nextPath;
      const found = findProhibitedKey(nested, nextPath);
      if (found) return found;
    }
    return null;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) {
      return `[${value.map(canonicalize).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function fnv1a64(value) {
    const bytes = new TextEncoder().encode(value);
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, '0');
  }

  function traceFingerprint(events) {
    return `trace-fnv1a64:${fnv1a64(canonicalize(events))}`;
  }

  function createInitialState(mode = 'DEMO') {
    if (!MODES.includes(mode)) fail('MODE_NOT_ALLOWED', mode);
    return {
      schemaVersion: 1,
      engine: 'OFFLINE_STATE_MACHINE',
      mode,
      provenance: `${mode}_SYNTHETIC_FIXTURE`,
      status: 'UNINITIALIZED',
      project: null,
      ledger: {
        budgetUnits: 0,
        simulatedBalanceUnits: 0,
        releasedUnits: 0,
        refundedUnits: 0,
        funded: false,
      },
      milestones: [],
      processedEventIds: [],
      timeline: [],
      traceFingerprint: traceFingerprint([]),
      safetyBoundary: {
        externalCalls: 0,
        walletCreated: false,
        walletConnected: false,
        rpcUsed: false,
        contractDeployed: false,
        signatureCreated: false,
        transactionSubmitted: false,
        realValueMoved: false,
      },
    };
  }

  function earliestOpenMilestone(state) {
    return state.milestones.find((milestone) => !['RELEASED', 'REFUNDED'].includes(milestone.status));
  }

  function milestoneById(state, milestoneId) {
    const milestone = state.milestones.find((item) => item.id === milestoneId);
    if (!milestone) fail('MILESTONE_NOT_FOUND', milestoneId);
    return milestone;
  }

  function requireCurrentMilestone(state, milestoneId) {
    const current = earliestOpenMilestone(state);
    if (!current || current.id !== milestoneId) {
      fail('MILESTONE_ORDER_VIOLATION', milestoneId);
    }
    return milestoneById(state, milestoneId);
  }

  function requireActive(state) {
    if (state.status !== 'ACTIVE') fail('ESCROW_NOT_ACTIVE', state.status);
  }

  function eventSummary(event) {
    const milestoneId = event.payload && event.payload.milestoneId;
    const label = {
      CREATE_ESCROW: 'Escrow fixture created',
      FUND_SIMULATED: 'Budget funded with simulated units',
      SUBMIT_EVIDENCE: 'Synthetic milestone evidence attached',
      APPROVE_MILESTONE: 'Milestone approved in replay',
      REJECT_MILESTONE: 'Milestone rejected in replay',
      MARK_TIMEOUT: 'Deadline reached in deterministic clock',
      OPEN_DISPUTE: 'Offline dispute opened',
      RESOLVE_DISPUTE: 'Offline dispute resolved',
      RELEASE_MILESTONE: 'Simulated units released',
      REFUND_REMAINDER: 'Remaining simulated units refunded',
    }[event.type];
    return milestoneId ? `${label} · ${milestoneId}` : label;
  }

  function assertInvariants(state) {
    if (!MODES.includes(state.mode)) fail('INVARIANT_MODE');
    if (state.engine !== 'OFFLINE_STATE_MACHINE') fail('INVARIANT_ENGINE');
    if (Object.values(state.safetyBoundary).some((value) => value !== false && value !== 0)) {
      fail('INVARIANT_EXTERNAL_CAPABILITY');
    }
    if (state.ledger.simulatedBalanceUnits < 0
      || state.ledger.releasedUnits < 0
      || state.ledger.refundedUnits < 0) {
      fail('INVARIANT_NEGATIVE_LEDGER');
    }
    if (!state.project) {
      if (state.status !== 'UNINITIALIZED' || state.milestones.length !== 0) fail('INVARIANT_EMPTY_STATE');
      return true;
    }
    const milestoneBudget = state.milestones.reduce((sum, milestone) => sum + milestone.amountUnits, 0);
    if (milestoneBudget !== state.ledger.budgetUnits) fail('INVARIANT_BUDGET_MISMATCH');
    if (new Set(state.milestones.map((milestone) => milestone.id)).size !== state.milestones.length) {
      fail('INVARIANT_DUPLICATE_MILESTONE');
    }
    if (state.milestones.some((milestone) => !MILESTONE_STATUSES.includes(milestone.status))) {
      fail('INVARIANT_MILESTONE_STATUS');
    }
    const released = state.milestones
      .filter((milestone) => milestone.status === 'RELEASED')
      .reduce((sum, milestone) => sum + milestone.amountUnits, 0);
    if (released !== state.ledger.releasedUnits) fail('INVARIANT_RELEASE_LEDGER');
    if (state.ledger.funded) {
      const accounted = state.ledger.simulatedBalanceUnits + state.ledger.releasedUnits + state.ledger.refundedUnits;
      if (accounted !== state.ledger.budgetUnits) fail('INVARIANT_LEDGER_CONSERVATION');
    } else if (state.ledger.simulatedBalanceUnits !== 0 || state.ledger.releasedUnits !== 0 || state.ledger.refundedUnits !== 0) {
      fail('INVARIANT_UNFUNDED_LEDGER');
    }
    if (state.status === 'SETTLED' && state.milestones.some((milestone) => milestone.status !== 'RELEASED')) {
      fail('INVARIANT_SETTLEMENT');
    }
    if (state.status === 'REFUNDED' && state.ledger.simulatedBalanceUnits !== 0) {
      fail('INVARIANT_REFUND_BALANCE');
    }
    if (new Set(state.processedEventIds).size !== state.processedEventIds.length) {
      fail('INVARIANT_EVENT_REPLAY');
    }
    for (let index = 1; index < state.timeline.length; index += 1) {
      if (Date.parse(state.timeline[index].at) < Date.parse(state.timeline[index - 1].at)) {
        fail('INVARIANT_CLOCK_REWIND');
      }
    }
    return true;
  }

  function applyEvent(state, event) {
    assertInvariants(state);
    if (TERMINAL_STATUSES.has(state.status)) fail('ESCROW_TERMINAL', state.status);
    if (!event || typeof event !== 'object') fail('EVENT_REQUIRED');
    if (!EVENT_TYPES.includes(event.type)) fail('EVENT_TYPE_NOT_ALLOWED', event.type);
    if (typeof event.id !== 'string' || !/^evt-[a-z0-9-]{3,64}$/u.test(event.id)) fail('EVENT_ID_INVALID');
    if (!isIsoDate(event.at)) fail('EVENT_TIME_INVALID');
    if (state.processedEventIds.includes(event.id)) fail('EVENT_REPLAY_BLOCKED', event.id);
    const prohibited = findProhibitedKey(event);
    if (prohibited) fail('SENSITIVE_CAPABILITY_FIELD_BLOCKED', prohibited);
    const previous = state.timeline[state.timeline.length - 1];
    if (previous && Date.parse(event.at) < Date.parse(previous.at)) fail('CLOCK_REWIND_BLOCKED');

    const next = clone(state);
    const payload = event.payload || {};

    switch (event.type) {
      case 'CREATE_ESCROW': {
        if (next.status !== 'UNINITIALIZED') fail('ESCROW_ALREADY_CREATED');
        const title = requireText(payload.title, 'PROJECT_TITLE_REQUIRED');
        const clientAlias = requireText(payload.clientAlias, 'CLIENT_ALIAS_REQUIRED', 80);
        const builderAlias = requireText(payload.builderAlias, 'BUILDER_ALIAS_REQUIRED', 80);
        const budgetUnits = requireUnits(payload.budgetUnits, 'BUDGET_UNITS_INVALID');
        if (!isIsoDate(payload.deadlineAt) || Date.parse(payload.deadlineAt) <= Date.parse(event.at)) {
          fail('DEADLINE_INVALID');
        }
        if (!Array.isArray(payload.milestones) || payload.milestones.length < 1 || payload.milestones.length > 8) {
          fail('MILESTONES_INVALID');
        }
        const milestones = payload.milestones.map((milestone, index) => ({
          id: requireText(milestone.id, 'MILESTONE_ID_REQUIRED', 48),
          title: requireText(milestone.title, 'MILESTONE_TITLE_REQUIRED', 100),
          amountUnits: requireUnits(milestone.amountUnits, 'MILESTONE_AMOUNT_INVALID'),
          order: index + 1,
          status: 'PENDING',
          evidence: null,
          decision: null,
          dispute: null,
          evidenceRevision: 0,
        }));
        if (new Set(milestones.map((milestone) => milestone.id)).size !== milestones.length) {
          fail('MILESTONE_IDS_DUPLICATED');
        }
        if (milestones.reduce((sum, milestone) => sum + milestone.amountUnits, 0) !== budgetUnits) {
          fail('MILESTONE_BUDGET_MISMATCH');
        }
        next.project = { title, clientAlias, builderAlias, deadlineAt: payload.deadlineAt };
        next.ledger.budgetUnits = budgetUnits;
        next.milestones = milestones;
        next.status = 'DRAFT';
        break;
      }
      case 'FUND_SIMULATED': {
        if (next.status !== 'DRAFT') fail('SIMULATED_FUNDING_NOT_ALLOWED', next.status);
        const amountUnits = requireUnits(payload.amountUnits, 'FUNDING_AMOUNT_INVALID');
        if (amountUnits !== next.ledger.budgetUnits) fail('FUNDING_MUST_MATCH_BUDGET');
        next.ledger.simulatedBalanceUnits = amountUnits;
        next.ledger.funded = true;
        next.status = 'ACTIVE';
        break;
      }
      case 'SUBMIT_EVIDENCE': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (!['PENDING', 'REJECTED'].includes(milestone.status)) fail('EVIDENCE_NOT_ALLOWED', milestone.status);
        if (Date.parse(event.at) > Date.parse(next.project.deadlineAt)) fail('EVIDENCE_AFTER_DEADLINE');
        milestone.evidence = {
          summary: requireText(payload.summary, 'EVIDENCE_SUMMARY_REQUIRED', 240),
          artifactRef: requireText(payload.artifactRef, 'EVIDENCE_REF_REQUIRED', 100),
          sourceFixture: requireText(payload.sourceFixture, 'SOURCE_FIXTURE_REQUIRED', 100),
        };
        if (!milestone.evidence.sourceFixture.startsWith('SYNTHETIC_')) fail('SOURCE_FIXTURE_MUST_BE_SYNTHETIC');
        milestone.evidenceRevision += 1;
        milestone.status = 'EVIDENCE_SUBMITTED';
        milestone.decision = null;
        break;
      }
      case 'APPROVE_MILESTONE': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (milestone.status !== 'EVIDENCE_SUBMITTED') fail('APPROVAL_REQUIRES_EVIDENCE');
        milestone.status = 'APPROVED';
        milestone.decision = {
          outcome: 'APPROVE',
          reviewerAlias: requireText(payload.reviewerAlias, 'REVIEWER_ALIAS_REQUIRED', 80),
          note: requireText(payload.note, 'APPROVAL_NOTE_REQUIRED', 200),
        };
        break;
      }
      case 'REJECT_MILESTONE': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (milestone.status !== 'EVIDENCE_SUBMITTED') fail('REJECTION_REQUIRES_EVIDENCE');
        milestone.status = 'REJECTED';
        milestone.decision = {
          outcome: 'REJECT',
          reviewerAlias: requireText(payload.reviewerAlias, 'REVIEWER_ALIAS_REQUIRED', 80),
          note: requireText(payload.reason, 'REJECTION_REASON_REQUIRED', 200),
        };
        break;
      }
      case 'MARK_TIMEOUT': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (!['PENDING', 'EVIDENCE_SUBMITTED', 'REJECTED'].includes(milestone.status)) fail('TIMEOUT_NOT_ALLOWED', milestone.status);
        if (Date.parse(event.at) < Date.parse(next.project.deadlineAt)) fail('TIMEOUT_TOO_EARLY');
        milestone.status = 'TIMED_OUT';
        break;
      }
      case 'OPEN_DISPUTE': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (!['REJECTED', 'TIMED_OUT'].includes(milestone.status)) fail('DISPUTE_NOT_ALLOWED', milestone.status);
        milestone.status = 'DISPUTED';
        milestone.dispute = {
          openedByAlias: requireText(payload.openedByAlias, 'DISPUTE_ALIAS_REQUIRED', 80),
          reason: requireText(payload.reason, 'DISPUTE_REASON_REQUIRED', 220),
          outcome: null,
        };
        break;
      }
      case 'RESOLVE_DISPUTE': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (milestone.status !== 'DISPUTED') fail('DISPUTE_RESOLUTION_NOT_ALLOWED', milestone.status);
        if (!['RELEASE', 'REFUND'].includes(payload.outcome)) fail('DISPUTE_OUTCOME_INVALID');
        milestone.dispute.outcome = payload.outcome;
        milestone.dispute.resolverAlias = requireText(payload.resolverAlias, 'RESOLVER_ALIAS_REQUIRED', 80);
        milestone.dispute.note = requireText(payload.note, 'RESOLUTION_NOTE_REQUIRED', 220);
        if (payload.outcome === 'RELEASE') {
          milestone.status = 'APPROVED';
          milestone.decision = { outcome: 'APPROVE_AFTER_DISPUTE', reviewerAlias: milestone.dispute.resolverAlias, note: milestone.dispute.note };
        } else {
          milestone.status = 'REFUND_AUTHORIZED';
          next.status = 'REFUND_PENDING';
        }
        break;
      }
      case 'RELEASE_MILESTONE': {
        requireActive(next);
        const milestone = requireCurrentMilestone(next, payload.milestoneId);
        if (milestone.status !== 'APPROVED') fail('RELEASE_REQUIRES_APPROVAL');
        const amountUnits = requireUnits(payload.amountUnits, 'RELEASE_AMOUNT_INVALID');
        if (amountUnits !== milestone.amountUnits) fail('RELEASE_AMOUNT_MISMATCH');
        if (next.ledger.simulatedBalanceUnits < amountUnits) fail('SIMULATED_BALANCE_INSUFFICIENT');
        next.ledger.simulatedBalanceUnits -= amountUnits;
        next.ledger.releasedUnits += amountUnits;
        milestone.status = 'RELEASED';
        if (next.milestones.every((item) => item.status === 'RELEASED')) next.status = 'SETTLED';
        break;
      }
      case 'REFUND_REMAINDER': {
        if (next.status !== 'REFUND_PENDING') fail('REFUND_NOT_AUTHORIZED', next.status);
        const amountUnits = requireUnits(payload.amountUnits, 'REFUND_AMOUNT_INVALID');
        if (amountUnits !== next.ledger.simulatedBalanceUnits) fail('REFUND_MUST_MATCH_REMAINDER');
        next.ledger.simulatedBalanceUnits = 0;
        next.ledger.refundedUnits += amountUnits;
        next.milestones.forEach((milestone) => {
          if (milestone.status !== 'RELEASED') milestone.status = 'REFUNDED';
        });
        next.status = 'REFUNDED';
        break;
      }
      default:
        fail('EVENT_UNREACHABLE');
    }

    next.processedEventIds.push(event.id);
    next.timeline.push({
      id: event.id,
      type: event.type,
      at: event.at,
      summary: eventSummary(event),
      milestoneId: payload.milestoneId || null,
    });
    next.traceFingerprint = traceFingerprint(next.timeline);
    assertInvariants(next);
    return next;
  }

  function replay(events, { mode = 'REPLAY' } = {}) {
    if (!Array.isArray(events)) fail('EVENT_LIST_REQUIRED');
    return events.reduce((state, event) => applyEvent(state, event), createInitialState(mode));
  }

  function buildReceipt(state) {
    assertInvariants(state);
    return {
      schemaVersion: 1,
      generatedFrom: 'OFFLINE_DETERMINISTIC_REPLAY',
      mode: state.mode,
      provenance: state.provenance,
      status: state.status,
      projectTitle: state.project ? state.project.title : null,
      eventCount: state.timeline.length,
      traceFingerprint: state.traceFingerprint,
      ledger: clone(state.ledger),
      milestones: state.milestones.map(({ id, title, amountUnits, status, evidenceRevision }) => ({
        id, title, amountUnits, status, evidenceRevision,
      })),
      safetyBoundary: clone(state.safetyBoundary),
      claims: {
        realEscrowCreated: false,
        realFundsLocked: false,
        crossChainProofGenerated: false,
        onChainReleasePerformed: false,
      },
    };
  }

  return Object.freeze({
    EVENT_TYPES,
    MODES,
    applyEvent,
    assertInvariants,
    buildReceipt,
    canonicalize,
    createInitialState,
    replay,
    traceFingerprint,
  });
}));
