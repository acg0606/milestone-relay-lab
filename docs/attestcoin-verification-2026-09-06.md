# Attestcoin proof admission: verified testnet evidence

## Result

On September 6, 2026, the v0.3 adapter obtained a real proof from the official
Creditcoin testnet ProofBuilder and verified it using the native precompile
`0x0000000000000000000000000000000000000FD2` through `eth_call`.
The positive result was `true`; an altered byte caused the precompile to revert
with `Merkle proof validation failed`. The original replay app remains offline.

## Reproduce

Install the pinned dependencies with `pnpm install --frozen-lockfile`, then run
`pnpm verify:attestcoin`. No API key, wallet or token is required. The command
uses only public source reads, one proof-service GET, and read-only Creditcoin
calls. Network/service availability and historical proof retention can change;
a failure returns an error and never falls back to a fixture.

Receipt: `evidence/attestcoin-read-only-receipt-2026-09-06.json`.
Full proof: `evidence/attestcoin-read-only-proof-2026-09-06.json`.
Re-running overwrites those two files with the new observation; archive an
existing receipt before rerunning when a historical comparison is required.

## Trust model and verification sequence

1. Confirm the public source is Sepolia (`11155111`) and the destination is CC3
   Testnet (`102031`). The destination chain-info precompile must identify
   Sepolia as chain key `1`, encoding version `1`.
2. Read the exact public transaction and receipt selected by a versioned local
   benchmark policy. Its block must already be attested on Creditcoin.
3. Fetch its official Merkle/continuity proof. Require matching source chain,
   transaction identifier and block height.
4. Re-encode the source transaction and receipt with the pinned official SDK.
   Those bytes must exactly equal the proof's transaction bytes. This prevents
   independently fetched, unverified RPC fields from becoming policy evidence.
5. Require a successful source transaction, matching sender and recipient, and
   consistent transaction/receipt block hashes.
6. Verify the bound bytes in Creditcoin's precompile using `verifySingle`, which
   the official SDK implements as a static call. Only a boolean `true` permits
   local evidence admission. There is no release or money operation.
7. Reject a modified proof and a repeated evidence ID. A network error does not
   count as successful rejection: the negative proof check requires `false` or
   an EVM call exception. Repeated-evidence protection is process-local only.

The public transaction was selected from already-attested Sepolia block
`11649780`. It is a benchmark unrelated to this project's actual milestones.
The expected sender/recipient were pinned after observing the benchmark; this
tests exact binding, and does not establish ownership or prior business intent.

## Proven and unproven claims

| Claim | Result |
|---|---|
| Official proof generation and native verification | PASS, real read-only testnet |
| Source success and field binding to verified bytes | PASS |
| Modified proof rejected by the native verifier | PASS |
| Duplicate admission rejected | PASS within one process |
| Existing release/dispute/timeout app | PASS, synthetic offline replay |
| Project-owned source milestone event | NOT IMPLEMENTED |
| On-chain escrow, release or refund | NOT IMPLEMENTED |
| Persistent replay protection across runs | NOT IMPLEMENTED |
| Mandatory core Attestcoin integration | Implemented; live registry deployment/state evidence pending |
| Public repository, video hosting and form submission | Root publishing workflow |

## Current official references

- [Organizer event and schedule](https://buidl.creditcoin.org/): current browser
  review on September 6 shows final submission September 13, 23:59 ET, equivalent
  to September 14, 03:59 UTC and September 14, 00:59 Sao Paulo time.
- [DoraHacks event](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail):
  unauthenticated web retrieval returned HTTP 405. Registration and submission
  form status require separate browser evidence.
- [Official Attestcoin SDK guide](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk):
  current name is Attestcoin; package and repository names still use USC.
- [Official end-to-end example](https://github.com/gluwa/cc-next-query-builder/blob/main/examples/end-to-end.ts).
- [Public source transaction](https://sepolia.etherscan.io/tx/0x94971d0d11d401a8868118d5735db920095833b66c4f588e810171329c6abb4c).

## Concrete completion path

The proof service and native verifier are usable without credentials. The
Milestone Relay Evidence Registry is now implemented: owner-selected immutable
source commitments, native proof verification and persistent evidence records
with global uniqueness. Deploy this registry on CC3 Testnet and record its real
configuration, verification event and storage transition. This is the concrete
remaining product gate. A new project-owned source transaction is not required
for the public benchmark, and financial settlement is outside this MVP.

The official event requires "Must be deployed on a testnet." and "Must integrate
the Attestcoin Protocol as a core feature." These clauses were checked in the
DoraHacks Project Requirements on September 6. Public-source records are a valid
technical design input; no claim is made that the benchmark proves task
completion or that judges have accepted the product.
