'use strict';
const config = globalThis.MILESTONE_RELAY;
const explorer = 'https://creditcoin-testnet.blockscout.com';
const registryLink = document.getElementById('registry');
registryLink.textContent = config.registry;
registryLink.href = explorer + '/address/' + config.registry;
const labels = { deploy: '01 / Deploy the registry', configure: '02 / Commit the exact evidence', verify: '03 / Verify and record' };
for (const transaction of config.transactions) {
  const card = document.createElement('div'); card.className = 'transaction';
  const title = document.createElement('strong'); title.textContent = labels[transaction.step];
  const link = document.createElement('a'); link.href = explorer + '/tx/' + transaction.hash;
  link.textContent = transaction.hash.slice(0, 12) + '…' + transaction.hash.slice(-6);
  const caption = document.createElement('p'); caption.textContent = 'Confirmed in the saved testnet receipt';
  card.append(title, link, caption); document.getElementById('transactions').append(card);
}
const refresh = document.getElementById('refresh');
const panel = document.querySelector('.panel');
refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  panel.dataset.state = 'checking';
  panel.setAttribute('aria-busy', 'true');
  document.getElementById('mode').textContent = 'READING CREDITCOIN TESTNET';
  document.getElementById('badge').textContent = 'CHECKING';
  document.getElementById('observation').textContent = 'Checking bytecode, owner, exact policy, receipts, events and replay rejection…';
  try {
    const result = await globalThis.RegistryReader.inspect(config);
    panel.dataset.state = 'verified';
    document.getElementById('mode').textContent = 'FRESH NETWORK READ / ' + result.checkedAt;
    document.getElementById('status').textContent = 'Verified on testnet';
    document.getElementById('badge').textContent = 'LIVE READ PASS';
    document.getElementById('observation').textContent = 'Confirmed at block ' + result.blockNumber + '. The exact evidence is VERIFIED, globally consumed and rejected on replay. All three transaction receipts match.';
    document.querySelectorAll('.transaction p').forEach((label, index) => { label.textContent = 'Confirmed · block ' + result.receipts[index].blockNumber; });
  } catch (error) {
    panel.dataset.state = 'unavailable';
    document.getElementById('mode').textContent = 'NETWORK CHECK INCOMPLETE';
    document.getElementById('status').textContent = 'Fresh check unavailable';
    document.getElementById('badge').textContent = 'NOT CONFIRMED';
    document.getElementById('observation').textContent = error.message + '. The saved receipt remains available below; no live result is claimed.';
  } finally { refresh.disabled = false; panel.setAttribute('aria-busy', 'false'); }
});
