'use strict';

// Read-only Attestcoin verification. This module never releases escrow funds.
const { JsonRpcProvider, FetchRequest, keccak256 } = require('ethers');
const { chainInfo, blockProver, proofProvider, encoding } = require('@gluwa/usc-sdk');
const { DEFAULT_RPC_URL, EXPECTED_CHAIN_ID } = require('./capability.cjs');

const SOURCE_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const PROVER_URL = 'https://prover.cc3-testnet.creditcoin.network';
const SOURCE_CHAIN_ID = 11155111n;
const SOURCE_CHAIN_KEY = 1;
const HASH = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object') throw new Error('POLICY_REQUIRED');
  if (!HASH.test(policy.transactionHash)) throw new Error('POLICY_HASH_INVALID');
  if (!ADDRESS.test(policy.expectedSender) || !ADDRESS.test(policy.expectedRecipient)) throw new Error('POLICY_ADDRESS_INVALID');
  if (policy.sourceChainId !== Number(SOURCE_CHAIN_ID) || policy.sourceChainKey !== SOURCE_CHAIN_KEY) throw new Error('POLICY_SOURCE_NOT_SEPOLIA');
  if (policy.purpose !== 'PUBLIC_TRANSACTION_BENCHMARK') throw new Error('POLICY_PURPOSE_NOT_SUPPORTED');
  return policy;
}

function validateBinding({ policy, proof, transaction, receipt, encodedBytes }) {
  validatePolicy(policy);
  const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  if (!proof || proof.chainKey !== SOURCE_CHAIN_KEY || !equal(proof.txHash, policy.transactionHash)) throw new Error('PROOF_IDENTITY_MISMATCH');
  if (!transaction || !receipt || !equal(transaction.hash, policy.transactionHash) || !equal(receipt.hash, policy.transactionHash)) throw new Error('SOURCE_TRANSACTION_MISMATCH');
  if (transaction.chainId !== SOURCE_CHAIN_ID) throw new Error('SOURCE_CHAIN_MISMATCH');
  if (!Number.isSafeInteger(proof.headerNumber) || proof.headerNumber < 1 || proof.headerNumber !== receipt.blockNumber || proof.headerNumber !== transaction.blockNumber) throw new Error('SOURCE_BLOCK_MISMATCH');
  if (!equal(transaction.blockHash, receipt.blockHash)) throw new Error('SOURCE_BLOCK_HASH_MISMATCH');
  if (!equal(encodedBytes, proof.txBytes)) throw new Error('PROOF_BYTES_MISMATCH');
  if (receipt.status !== 1) throw new Error('SOURCE_TRANSACTION_FAILED');
  if (!equal(transaction.from, policy.expectedSender)) throw new Error('SENDER_POLICY_MISMATCH');
  if (!equal(transaction.to, policy.expectedRecipient)) throw new Error('RECIPIENT_POLICY_MISMATCH');
  return { evidenceId: `sepolia:${policy.transactionHash.toLowerCase()}`, bytesDigest: keccak256(proof.txBytes) };
}

function admitOnce(binding, verified, seen) {
  if (verified !== true) throw new Error('ATTESTCOIN_VERIFICATION_REQUIRED');
  if (!(seen instanceof Set)) throw new Error('EVIDENCE_SET_REQUIRED');
  if (seen.has(binding.evidenceId)) throw new Error('EVIDENCE_ALREADY_ADMITTED');
  seen.add(binding.evidenceId);
  return { status: 'PUBLIC_EVIDENCE_VERIFIED', evidenceId: binding.evidenceId, fundsReleased: false,
    scope: 'Local admission of a public transaction benchmark; not milestone completion or escrow authorization.',
    deduplicationScope: 'CURRENT_PROCESS_ONLY' };
}

function makeReadOnlyProvider(url, calls) {
  const request = new FetchRequest(url);
  request.timeout = 15000;
  const provider = new JsonRpcProvider(request);
  const originalSend = provider.send.bind(provider);
  const allowed = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_call']);
  provider.send = async (method, params) => {
    if (!allowed.has(method)) throw new Error(`READ_ONLY_RPC_METHOD_DENIED:${method}`);
    calls.push({ host: new URL(url).hostname, method });
    return originalSend(method, params);
  };
  return provider;
}

async function verifyPublicEvidence(policy, { negativeCheck = true } = {}) {
  validatePolicy(policy);
  const calls = [];
  const source = makeReadOnlyProvider(SOURCE_RPC, calls);
  const destination = makeReadOnlyProvider(DEFAULT_RPC_URL, calls);
  const startedAt = new Date().toISOString();
  try {
    const [sourceNetwork, destinationNetwork] = await Promise.all([source.getNetwork(), destination.getNetwork()]);
    if (sourceNetwork.chainId !== SOURCE_CHAIN_ID || destinationNetwork.chainId !== EXPECTED_CHAIN_ID) throw new Error('RPC_CHAIN_MISMATCH');
    const info = new chainInfo.PrecompileChainInfoProvider(destination);
    const supported = await info.getSupportedChains();
    if (!supported.some((item) => item.chainKey === SOURCE_CHAIN_KEY && item.chainId === Number(SOURCE_CHAIN_ID) && item.chainEncoding === 1)) throw new Error('SOURCE_SUPPORT_MISMATCH');
    const [tx, receipt, destinationBlock] = await Promise.all([
      encoding.getTransactionWithRaw(source, policy.transactionHash), source.getTransactionReceipt(policy.transactionHash), destination.getBlockNumber(),
    ]);
    if (!tx || !receipt) throw new Error('SOURCE_TRANSACTION_NOT_FOUND');
    const attestation = await info.getLatestAttestedHeightAndHash(SOURCE_CHAIN_KEY);
    if (!attestation.exists || attestation.height < receipt.blockNumber) throw new Error('SOURCE_BLOCK_NOT_ATTESTED');
    const builder = new proofProvider.service.ProofBuilder(SOURCE_CHAIN_KEY, PROVER_URL, 20000);
    const result = await builder.getProof(policy.transactionHash);
    if (!result.success || !result.data) throw new Error(`PROOF_FETCH_FAILED:${result.error || 'NO_DATA'}`);
    const proof = result.data;
    const binding = validateBinding({ policy, proof, transaction: tx.formatted, receipt, encodedBytes: encoding.abiEncode(tx, receipt).abi });
    const prover = new blockProver.PrecompileBlockProver(destination);
    const verify = (bytes) => prover.verifySingle(proof.chainKey, proof.headerNumber, bytes, proof.merkleProof, proof.continuityProof);
    const verified = await verify(proof.txBytes);
    const seen = new Set();
    const admission = admitOnce(binding, verified, seen);
    let tamperedProof = 'NOT_RUN';
    if (negativeCheck) {
      const lastByte = parseInt(proof.txBytes.slice(-2), 16) ^ 1;
      const modified = proof.txBytes.slice(0, -2) + lastByte.toString(16).padStart(2, '0');
      try {
        const accepted = await verify(modified);
        if (accepted) throw new Error('TAMPERED_PROOF_ACCEPTED');
        tamperedProof = 'REJECTED_FALSE';
      } catch (error) {
        if (error.code !== 'CALL_EXCEPTION') throw error;
        tamperedProof = 'REJECTED_PRECOMPILE_REVERT';
      }
    }
    let duplicateEvidence = 'NOT_RUN';
    try { admitOnce(binding, verified, seen); } catch (error) {
      if (error.message !== 'EVIDENCE_ALREADY_ADMITTED') throw error;
      duplicateEvidence = 'REJECTED_LOCAL';
    }
    return { receipt: {
      schemaVersion: 1, startedAt, observedAt: new Date().toISOString(),
      provenance: 'LIVE_READ_ONLY_TESTNET_VERIFICATION', status: 'PASS',
      source: { chainId: Number(SOURCE_CHAIN_ID), chainKey: SOURCE_CHAIN_KEY, transactionHash: proof.txHash,
        blockNumber: proof.headerNumber, blockHash: receipt.blockHash, sender: tx.formatted.from,
        recipient: tx.formatted.to, transactionStatus: receipt.status, explorer: `https://sepolia.etherscan.io/tx/${proof.txHash}` },
      destination: { chainId: Number(EXPECTED_CHAIN_ID), observedBlock: destinationBlock,
        precompile: blockProver.BLOCK_PROVER_PRECOMPILE_ADDRESS, rpc: DEFAULT_RPC_URL, callMethod: 'eth_call', transactionHash: null },
      proof: { officialSdk: '@gluwa/usc-sdk@0.18.0', service: PROVER_URL, verified, bytesDigest: binding.bytesDigest,
        sourceReencodingMatches: true, attestedThrough: attestation.height },
      admission, negativeChecks: { tamperedProof, duplicateEvidence }, rpcCalls: calls,
      boundary: { walletUsed: false, signatureCreated: false, transactionSubmitted: false, externalStateMutation: false,
        contractDeployed: false, assetsMoved: false, sourceTransactionCreatedByProject: false,
        projectMilestoneCompletionProven: false, mandatoryHackathonIntegrationSatisfied: false },
    }, proof };
  } finally { source.destroy(); destination.destroy(); }
}

module.exports = { validatePolicy, validateBinding, admitOnce, makeReadOnlyProvider, verifyPublicEvidence };
