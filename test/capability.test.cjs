const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_RPC_URL,
  EXPECTED_CHAIN_ID,
  buildCapabilityResult,
  decodeChainName,
  validateRpcUrl,
} = require('../src/capability.cjs');

test('accepts only the official CC3 Testnet HTTPS RPC host', () => {
  assert.equal(validateRpcUrl(DEFAULT_RPC_URL), `${DEFAULT_RPC_URL}/`);
  assert.throws(
    () => validateRpcUrl('http://rpc.cc3-testnet.creditcoin.network'),
    /CREDITCOIN_RPC_HTTPS_REQUIRED/,
  );
  assert.throws(
    () => validateRpcUrl('https://rpc.creditcoin.network'),
    /CREDITCOIN_RPC_HOST_NOT_ALLOWED/,
  );
  assert.throws(
    () => validateRpcUrl('https://user:secret@rpc.cc3-testnet.creditcoin.network'),
    /CREDITCOIN_RPC_CREDENTIALS_NOT_ALLOWED/,
  );
});

test('decodes official chain-name bytes without guessing unknown values', () => {
  assert.equal(decodeChainName('0x457468657265756d'), 'Ethereum');
  assert.equal(decodeChainName('0x5365706f6c696120657468657265756d'), 'Sepolia ethereum');
  assert.equal(decodeChainName('not-hex'), 'not-hex');
});

test('produces an explicit read-only, wallet-free capability receipt', () => {
  const result = buildCapabilityResult({
    observedAt: '2026-08-21T00:00:00.000Z',
    rpcUrl: `${DEFAULT_RPC_URL}/`,
    network: { chainId: EXPECTED_CHAIN_ID },
    blockNumber: 123,
    sources: [{
      chainKey: 1,
      chainId: 11155111,
      chainName: '0x5365706f6c696120657468657265756d',
      chainEncoding: 1,
      latestAttestation: { height: 100, hash: '0x01', isAttestation: true, exists: true },
    }],
  });

  assert.equal(result.externalReadPerformed, true);
  assert.equal(result.externalWritePerformed, false);
  assert.equal(result.walletUsed, false);
  assert.equal(result.transactionSubmitted, false);
  assert.equal(result.destination.chainId, '102031');
  assert.equal(result.supportedSources[0].chainName, 'Sepolia ethereum');
});

test('rejects a capability receipt for the wrong destination chain', () => {
  assert.throws(
    () => buildCapabilityResult({
      observedAt: '2026-08-21T00:00:00.000Z',
      rpcUrl: `${DEFAULT_RPC_URL}/`,
      network: { chainId: 1n },
      blockNumber: 1,
      sources: [],
    }),
    /CREDITCOIN_CHAIN_ID_MISMATCH/,
  );
});

