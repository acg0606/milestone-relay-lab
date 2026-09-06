const test = require('node:test');
const assert = require('node:assert/strict');

const { proofProvider } = require('@gluwa/usc-sdk');

test('uses the official SDK for a deterministic offline Merkle smoke', () => {
  const { KeccakMerkleTree, ZERO_HASH } = proofProvider.merkle;
  const emptyTree = new KeccakMerkleTree([]);
  assert.equal(emptyTree.getRoot(), ZERO_HASH);

  const leaves = ['aa', 'bb', 'cc', 'dd'].map((value) => `0x${value.repeat(32)}`);
  const tree = new KeccakMerkleTree(leaves);
  assert.equal(
    tree.getRoot(),
    '0x100ee33e3abc39fd1e939278fcfc34fb7a01a9cf5747b108d8b9a5c6ac5a0092',
  );
  assert.equal(tree.getProof(2).siblings.length, 2);

  const merged = proofProvider.mergeProofs([
    [10, { lowerEndpointDigest: '0x01', roots: ['a', 'b'] }],
    [11, { lowerEndpointDigest: '0x02', roots: ['b', 'c'] }],
  ]);
  assert.deepEqual(merged, {
    lowerEndpointDigest: '0x01',
    roots: ['a', 'b', 'c'],
  });
});
