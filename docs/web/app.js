(function runMilestoneRelayApp() {
  'use strict';

  const { applyEvent, assertInvariants, createInitialState } = globalThis.EscrowCore;
  const { scenarios } = globalThis.EscrowScenarios;
  const statusProgress = {
    PENDING: 8,
    EVIDENCE_SUBMITTED: 35,
    APPROVED: 68,
    REJECTED: 45,
    TIMED_OUT: 45,
    DISPUTED: 58,
    REFUND_AUTHORIZED: 76,
    RELEASED: 100,
    REFUNDED: 100,
  };
  const eventLabels = {
    CREATE_ESCROW: 'Create escrow fixture',
    FUND_SIMULATED: 'Fund with simulated units',
    SUBMIT_EVIDENCE: 'Attach synthetic evidence',
    APPROVE_MILESTONE: 'Approve milestone',
    REJECT_MILESTONE: 'Reject milestone',
    MARK_TIMEOUT: 'Mark deterministic timeout',
    OPEN_DISPUTE: 'Open offline dispute',
    RESOLVE_DISPUTE: 'Resolve offline dispute',
    RELEASE_MILESTONE: 'Release simulated units',
    REFUND_REMAINDER: 'Refund simulated remainder',
  };

  const elements = {
    balance: document.querySelector('#balance-units'),
    conservationDetail: document.querySelector('#conservation-detail'),
    conservationStatus: document.querySelector('#conservation-status'),
    eventList: document.querySelector('#event-list'),
    eventProgress: document.querySelector('#event-progress'),
    externalCalls: document.querySelector('#external-call-count'),
    fingerprint: document.querySelector('#trace-fingerprint'),
    milestoneList: document.querySelector('#milestone-list'),
    refunded: document.querySelector('#refunded-units'),
    released: document.querySelector('#released-units'),
    reset: document.querySelector('#reset-replay'),
    runAll: document.querySelector('#run-all'),
    scenarioDescription: document.querySelector('#scenario-description'),
    status: document.querySelector('#escrow-status'),
    step: document.querySelector('#step-replay'),
    announcer: document.querySelector('#replay-announcer'),
  };

  let selectedScenario = scenarios.release;
  let state = createInitialState('REPLAY');
  let cursor = 0;
  let running = false;
  let timer = null;

  function shortTime(value) {
    return new Intl.DateTimeFormat('en', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
    }).format(new Date(value));
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderEvents() {
    elements.eventList.replaceChildren();
    selectedScenario.events.forEach((event, index) => {
      const item = create('li', 'event-item');
      if (index < cursor) item.classList.add('is-complete');
      if (index === cursor && cursor < selectedScenario.events.length) item.classList.add('is-active');
      const dot = create('span', 'event-dot');
      dot.setAttribute('aria-hidden', 'true');
      const copy = create('span', 'event-copy');
      copy.append(create('strong', '', eventLabels[event.type]));
      const detail = event.payload.milestoneId ? `${event.payload.milestoneId} · ${event.id}` : event.id;
      copy.append(create('small', '', detail));
      item.append(dot, copy, create('time', 'event-time', `${shortTime(event.at)} UTC`));
      elements.eventList.append(item);
    });
  }

  function renderMilestones() {
    elements.milestoneList.replaceChildren();
    if (state.milestones.length === 0) {
      const empty = create('div', 'milestone-card');
      empty.append(create('p', 'milestone-title', 'Milestones appear after the fixture is created.'));
      elements.milestoneList.append(empty);
      return;
    }
    state.milestones.forEach((milestone) => {
      const card = create('article', 'milestone-card');
      card.dataset.status = milestone.status;
      const top = create('div', 'milestone-top');
      top.append(
        create('span', 'milestone-index', String(milestone.order).padStart(2, '0')),
        create('h4', 'milestone-title', milestone.title),
        create('span', 'milestone-amount', `${milestone.amountUnits} u`),
      );
      const meta = create('div', 'milestone-meta');
      const track = create('span', 'progress-track');
      const fill = create('span');
      fill.style.width = `${statusProgress[milestone.status]}%`;
      track.append(fill);
      meta.append(track, create('span', 'milestone-status', milestone.status.replaceAll('_', ' ')));
      card.append(top, meta);
      elements.milestoneList.append(card);
    });
  }

  function renderConservation() {
    if (!state.ledger.funded) {
      elements.conservationStatus.textContent = 'WAITING';
      elements.conservationStatus.classList.remove('is-pass');
      elements.conservationDetail.textContent = 'Create and fund the fixture to activate the invariant.';
      return;
    }
    const accounted = state.ledger.simulatedBalanceUnits + state.ledger.releasedUnits + state.ledger.refundedUnits;
    const passes = accounted === state.ledger.budgetUnits;
    elements.conservationStatus.textContent = passes ? 'PASS' : 'FAIL';
    elements.conservationStatus.classList.toggle('is-pass', passes);
    elements.conservationDetail.textContent = `${state.ledger.simulatedBalanceUnits} + ${state.ledger.releasedUnits} + ${state.ledger.refundedUnits} = ${state.ledger.budgetUnits} simulated units.`;
  }

  function render() {
    assertInvariants(state);
    elements.scenarioDescription.textContent = selectedScenario.description;
    elements.status.textContent = state.status.replaceAll('_', ' ');
    elements.balance.textContent = state.ledger.simulatedBalanceUnits;
    elements.released.textContent = state.ledger.releasedUnits;
    elements.refunded.textContent = state.ledger.refundedUnits;
    elements.eventProgress.textContent = `${cursor} / ${selectedScenario.events.length}`;
    elements.fingerprint.textContent = state.traceFingerprint;
    elements.externalCalls.textContent = state.safetyBoundary.externalCalls;
    elements.step.disabled = running || cursor >= selectedScenario.events.length;
    elements.runAll.disabled = running || cursor >= selectedScenario.events.length;
    elements.reset.disabled = running || cursor === 0;
    document.querySelectorAll('[data-scenario]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.scenario === selectedScenario.id));
      button.disabled = running;
    });
    renderEvents();
    renderMilestones();
    renderConservation();
  }

  function stepReplay({ announce = true } = {}) {
    if (cursor >= selectedScenario.events.length) return false;
    const event = selectedScenario.events[cursor];
    state = applyEvent(state, event);
    cursor += 1;
    if (announce) elements.announcer.textContent = `${eventLabels[event.type]}. State is ${state.status}.`;
    render();
    return true;
  }

  function stopRun() {
    if (timer) globalThis.clearInterval(timer);
    timer = null;
    running = false;
    render();
    elements.announcer.textContent = `Replay complete. Final state is ${state.status}. No external call was made.`;
  }

  function runAll() {
    if (running || cursor >= selectedScenario.events.length) return;
    running = true;
    render();
    timer = globalThis.setInterval(() => {
      if (!stepReplay({ announce: false }) || cursor >= selectedScenario.events.length) stopRun();
    }, 180);
  }

  function reset() {
    if (timer) globalThis.clearInterval(timer);
    timer = null;
    running = false;
    state = createInitialState('REPLAY');
    cursor = 0;
    elements.announcer.textContent = `${selectedScenario.label} reset.`;
    render();
  }

  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedScenario = scenarios[button.dataset.scenario];
      reset();
    });
  });
  elements.step.addEventListener('click', () => stepReplay());
  elements.runAll.addEventListener('click', runAll);
  elements.reset.addEventListener('click', reset);

  render();
}());
