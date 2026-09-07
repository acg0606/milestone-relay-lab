# Milestone Relay Evidence Registry - testnet execution

FACT: deployed and independently read back on CC3 Testnet (chain 102031), September 7, 2026.

Registry: [0x194075d28FedC34D53F095Bac0581368021cfD9a](https://creditcoin-testnet.blockscout.com/address/0x194075d28FedC34D53F095Bac0581368021cfD9a)

| Step | Transaction | Result |
| --- | --- | --- |
| Deployment | [0xee75cffb…d85812](https://creditcoin-testnet.blockscout.com/tx/0xee75cffb1e55243487b46c75c667bb46f51831ec004962917ba1e42a15d85812) | Confirmed, block 5448049 |
| Owner commitment | [0x192116e0…50d167](https://creditcoin-testnet.blockscout.com/tx/0x192116e0e3e8b129ac570ea0d25f7f9c4fea0c384a2db69fa33c69308150d167) | MilestoneConfigured, block 5448052 |
| Native proof admission | [0x6d421920…4453d9](https://creditcoin-testnet.blockscout.com/tx/0x6d4219203e4f69f5c3bc5c8a3507fa7ef5b3c79c0fbb3c7eace01602fb4453d9) | EvidenceVerified, block 5448057 |

The independent public reader checks the network, deployed bytecode, creation transaction against compiled source, owner, official native verifier, immutable source policy, all three receipts and emitted events. It reads VERIFIED and globally consumed evidence, then confirms a repeated admission reverts with MilestoneAlreadyVerified. It performs only public RPC reads; it does not load a key, sign or broadcast.

The first simulation with the September 6 continuity proof failed because its checkpoint had changed. No failed transaction was broadcast. A fresh official proof generated and independently verified on September 7 was used for successful admission. The owner commitment remained unchanged because the exact transaction bytes and source height were identical.

## Reproduce

In the public repository: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm verify:registry` and `pnpm verify:attestcoin`. The registry inspector in the public demo runs the same reader in the browser. A failed RPC or inconsistent result is explicitly displayed as unconfirmed.

Evidence: `evidence/registry-testnet-execution-2026-09-07.json`, `evidence/registry-public-config.json`, and `evidence/attestcoin-read-only-proof-2026-09-07.json`.

## Scope

All three registry transactions had zero value and used free testnet gas. There is no escrow release or mainnet deployment. VERIFIED means inclusion of exact owner-selected source data. The source transaction is an unrelated public benchmark; it does not prove ownership, work completion or quality. The separate escrow interface is a synthetic DEMO_REPLAY.

Older September 6 handoffs and receipts are retained as historical evidence. They describe the earlier local-only state and are superseded by this execution record. Organizer acceptance, personal eligibility and submission are separate from this technical result.
