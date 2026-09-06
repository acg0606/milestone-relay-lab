'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePolicy, validateBinding, admitOnce, makeReadOnlyProvider } = require('../src/proof-admission.cjs');
const policy = require('../evidence/public-benchmark-policy.json');
function inputs() {
  const hash = '0x' + 'ab'.repeat(32);
  return { policy: structuredClone(policy), proof: { chainKey: 1, txHash: policy.transactionHash, headerNumber: 123, txBytes: '0x1234' },
    transaction: { hash: policy.transactionHash, chainId: 11155111n, blockNumber: 123, blockHash: hash,
      from: policy.expectedSender, to: policy.expectedRecipient },
    receipt: { hash: policy.transactionHash, blockNumber: 123, blockHash: hash, status: 1 }, encodedBytes: '0x1234' };
}
test('binds matching successful source bytes and the explicit public benchmark policy', () => {
  const result = validateBinding(inputs());
  assert.equal(result.evidenceId, `sepolia:${policy.transactionHash}`);
  assert.match(result.bytesDigest, /^0x[0-9a-f]{64}$/);
});
test('rejects a source result that cannot be matched to cryptographically verified bytes', () => {
  const data = inputs(); data.encodedBytes = '0xabcd';
  assert.throws(() => validateBinding(data), /PROOF_BYTES_MISMATCH/);
});
test('rejects successful inclusion of a failed source transaction', () => {
  const data = inputs(); data.receipt.status = 0;
  assert.throws(() => validateBinding(data), /SOURCE_TRANSACTION_FAILED/);
});
test('rejects a different transaction, recipient, block or network', () => {
  for (const [mutate, expected] of [
    [d => { d.proof.txHash = '0x' + 'f'.repeat(64); }, /PROOF_IDENTITY_MISMATCH/],
    [d => { d.transaction.to = '0x' + 'f'.repeat(40); }, /RECIPIENT_POLICY_MISMATCH/],
    [d => { d.transaction.from = '0x' + 'f'.repeat(40); }, /SENDER_POLICY_MISMATCH/],
    [d => { d.receipt.blockNumber = 124; }, /SOURCE_BLOCK_MISMATCH/],
    [d => { d.transaction.chainId = 1n; }, /SOURCE_CHAIN_MISMATCH/],
  ]) { const data = inputs(); mutate(data); assert.throws(() => validateBinding(data), expected); }
});
test('admits evidence only after successful Attestcoin verification and rejects duplicates', () => {
  const binding = validateBinding(inputs()); const seen = new Set();
  assert.throws(() => admitOnce(binding, false, seen), /ATTESTCOIN_VERIFICATION_REQUIRED/);
  assert.equal(seen.size, 0);
  const result = admitOnce(binding, true, seen);
  assert.equal(result.fundsReleased, false);
  assert.equal(result.deduplicationScope, 'CURRENT_PROCESS_ONLY');
  assert.throws(() => admitOnce(binding, true, seen), /EVIDENCE_ALREADY_ADMITTED/);
});
test('rejects mainnet policy and unsupported project-purpose claims', () => {
  assert.throws(() => validatePolicy({ ...policy, sourceChainId: 1 }), /POLICY_SOURCE_NOT_SEPOLIA/);
  assert.throws(() => validatePolicy({ ...policy, purpose: 'MILESTONE_COMPLETED' }), /POLICY_PURPOSE_NOT_SUPPORTED/);
});
test('blocks account, signing and submission RPC methods before network access', async () => {
  const calls = []; const provider = makeReadOnlyProvider('https://rpc.cc3-testnet.creditcoin.network', calls);
  try {
    for (const method of ['eth_accounts', 'eth_sendTransaction', 'eth_sendRawTransaction', 'personal_sign']) {
      await assert.rejects(provider.send(method, []), /READ_ONLY_RPC_METHOD_DENIED/);
    }
    assert.deepEqual(calls, []);
  } finally { provider.destroy(); }
});
