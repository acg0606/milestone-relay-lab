#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { verifyPublicEvidence } = require('./src/proof-admission.cjs');
const policy = require('./evidence/public-benchmark-policy.json');

async function main() {
  const result = await verifyPublicEvidence(policy);
  const folder = path.join(__dirname, 'evidence');
  fs.writeFileSync(path.join(folder, 'attestcoin-read-only-receipt-2026-09-06.json'), JSON.stringify(result.receipt, null, 2) + '\n');
  fs.writeFileSync(path.join(folder, 'attestcoin-read-only-proof-2026-09-06.json'), JSON.stringify(result.proof, null, 2) + '\n');
  console.log(JSON.stringify(result.receipt, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', stage: 'READ_ONLY_ATTESTCOIN_VERIFICATION', message: error.shortMessage || error.message,
    walletUsed: false, transactionSubmitted: false, assetsMoved: false }));
  process.exitCode = 1;
});
