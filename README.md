# Milestone Relay - public source review

This export contains the implementation, tests and evidence needed to reproduce
a real read-only Attestcoin testnet proof verification and the separate escrow
model. It excludes repository history, account configuration and private scripts.

## Run

Install Node.js 22 or newer and pnpm 11.19.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm verify:attestcoin
```

The verification uses public Sepolia and Creditcoin testnet reads plus the
official ProofBuilder service. It needs no wallet or API key. An unavailable
service causes a failure; a fixture never substitutes for network verification.

## What is verified

- Actual Merkle/continuity proof verification through the native precompile.
- Exact SDK re-encoding of the source transaction/receipt against proof bytes.
- Success, sender and recipient binding to an explicit benchmark policy.
- Rejection of modified proof bytes and duplicate admission in one process.

## Current boundary

The transaction is an existing public benchmark, unrelated to project work.
It does not establish address ownership or milestone completion. Escrow
release/dispute/refund logic remains a synthetic local model. No project
contract deployment, destination transaction or assets movement occurred.
The registry MVP awaits public testnet deployment and real persistent-state evidence. Financial settlement is outside its scope.

The HTML/CSS/JS in web/ are the preserved replay UI. The product demo and
whitepaper are distributed separately with the static review site.

See docs/attestcoin-verification-2026-09-06.md and the evidence/ receipts.
manifest.json records SHA-256 hashes for every exported source file.

## Attribution

Project source is MIT licensed. @gluwa/usc-sdk 0.18.0 and ethers 6.17.0 are
MIT-licensed dependencies, installed from the pinned package lockfile.
Official SDK: https://github.com/gluwa/cc-next-query-builder
Official docs: https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk

## Stateful registry

The contracts/ directory contains a nonpayable MilestoneEvidenceRegistry. It
commits an owner-selected source digest and height, invokes the native verifier
and persists VERIFIED with global replay protection. Compile with
`pnpm compile:contract`; its local EVM tests use a mock, never a live network.
The unsigned planner is disabled by default and cannot sign or broadcast.
See docs/registry-testnet-handoff.md for exact next actions and limitations.
