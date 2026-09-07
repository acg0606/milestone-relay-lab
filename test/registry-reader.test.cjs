'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('../src/registry-reader.js');
const config = require('../evidence/registry-public-config.json');
function fixture(overrides = {}) {
  return async (method, params) => {
    if (overrides[method]) return overrides[method](params);
    if (method === 'eth_chainId') return '0x18e8f';
    if (method === 'eth_blockNumber') return '0x600000';
    if (method === 'eth_getCode') return '0x6000';
    if (method === 'eth_call') {
      if (params[0].data === config.replayData) { const error = new Error('revert'); error.data = config.replayError; throw error; }
      return config.calls.find(call => call.data === params[0].data).expected;
    }
    if (method === 'eth_getTransactionByHash') return { to: null, value: '0x0', from: config.owner, input: config.creationData };
    if (method === 'eth_getTransactionReceipt') {
      const entry = config.transactions.find(tx => tx.hash === params[0]);
      return { transactionHash: entry.hash, status: '0x1', from: config.owner, to: entry.step === 'deploy' ? null : config.registry,
        contractAddress: entry.step === 'deploy' ? config.registry : null, blockNumber: '0x530000',
        logs: [{ address: config.registry, topics: [entry.eventTopic, config.milestoneId] }] };
    }
    throw new Error('Unexpected RPC method');
  };
}
test('public reader confirms linked receipts, exact state and replay using only reads', async () => {
  const methods = [];
  const rpc = fixture();
  const result = await inspect(config, (method, params) => { methods.push(method); return rpc(method, params); });
  assert.equal(result.status, 'LIVE_TESTNET_VERIFIED');
  assert.equal(result.receipts.length, 3);
  assert.ok(methods.every(method => /^(eth_chainId|eth_blockNumber|eth_getCode|eth_call|eth_getTransactionReceipt|eth_getTransactionByHash)$/.test(method)));
});
test('public reader fails closed on another network or missing contract', async () => {
  await assert.rejects(inspect(config, fixture({ eth_chainId: () => '0x1' })), /Wrong network/);
  await assert.rejects(inspect(config, fixture({ eth_getCode: () => '0x' })), /bytecode missing/);
});
test('public reader never labels changed policy or failed transaction verified', async () => {
  await assert.rejects(inspect(config, fixture({ eth_call: () => '0x00' })), /On-chain mismatch/);
  await assert.rejects(inspect(config, fixture({ eth_getTransactionReceipt: () => null })), /Receipt invalid/);
});
test('public reader rejects a different deployment and a successful replay', async () => {
  await assert.rejects(inspect(config, fixture({ eth_getTransactionByHash: () => ({ to: null, value: '0x0', input: '0x00', from: config.owner }) })), /Deployment source mismatch/);
  const valid = fixture();
  await assert.rejects(inspect(config, fixture({ eth_call: params => params[0].data === config.replayData ? '0x' : valid('eth_call', params) })), /Replay rejection/);
});
