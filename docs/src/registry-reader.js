(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RegistryReader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  async function inspect(config, transport) {
    let requestId = 0;
    const rpc = transport || (async (method, params) => {
      const response = await fetch(config.rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('RPC unavailable: HTTP ' + response.status);
      const result = await response.json();
      if (result.error) { const error = new Error(result.error.message); error.data = result.error.data; throw error; }
      if (result.result === undefined) throw new Error('RPC returned no result');
      return result.result;
    });
    if (config.chainId !== 102031 || BigInt(await rpc('eth_chainId', [])) !== 102031n) throw new Error('Wrong network');
    const block = await rpc('eth_blockNumber', []);
    const code = await rpc('eth_getCode', [config.registry, block]);
    if (!code || code === '0x') throw new Error('Registry bytecode missing');
    await Promise.all(config.calls.map(async call => {
      const result = await rpc('eth_call', [{ to: config.registry, data: call.data }, block]);
      if (!same(result, call.expected)) throw new Error('On-chain mismatch: ' + call.label);
    }));
    const receipts = await Promise.all(config.transactions.map(async entry => {
      const receipt = await rpc('eth_getTransactionReceipt', [entry.hash]);
      if (!receipt || receipt.status !== '0x1' || !same(receipt.transactionHash, entry.hash) ||
          !same(receipt.from, config.owner) || BigInt(receipt.blockNumber) > BigInt(block)) throw new Error('Receipt invalid: ' + entry.step);
      if (entry.step === 'deploy') {
        const tx = await rpc('eth_getTransactionByHash', [entry.hash]);
        if (!same(receipt.contractAddress, config.registry) || !tx || tx.to !== null || BigInt(tx.value) !== 0n ||
            !same(tx.input, config.creationData) || !same(tx.from, config.owner)) throw new Error('Deployment source mismatch');
      } else if (!same(receipt.to, config.registry) || !receipt.logs.some(log => same(log.address, config.registry) &&
          same(log.topics[0], entry.eventTopic) && same(log.topics[1], config.milestoneId))) throw new Error('Registry event missing: ' + entry.step);
      return { step: entry.step, hash: entry.hash, blockNumber: Number(BigInt(receipt.blockNumber)), status: 'CONFIRMED' };
    }));
    let replayRejected = false;
    try { await rpc('eth_call', [{ to: config.registry, data: config.replayData }, block]); }
    catch (error) { replayRejected = typeof error.data === 'string' && same(error.data.slice(0, 10), config.replayError); }
    if (!replayRejected) throw new Error('Replay rejection could not be verified');
    return { status: 'LIVE_TESTNET_VERIFIED', checkedAt: new Date().toISOString(), chainId: config.chainId,
      blockNumber: Number(BigInt(block)), registry: config.registry, owner: config.owner,
      milestoneId: config.milestoneId, verified: true, consumedEvidence: true, replayRejected: true, receipts };
  }
  return { inspect };
});
