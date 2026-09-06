# MilestoneEvidenceRegistry: concrete deployment handoff

## What is complete locally

The Solidity registry stores immutable per-milestone source evidence policies.
Only its deployment sender may configure a milestone. A policy commits an
exact source block height and keccak256 hash of the SDK-encoded transaction and
receipt. Sepolia source chain key 1 is fixed, and deployment is restricted to
Creditcoin testnet chain 102031.

Anyone can relay the matching proof. The contract calls the official native
verifier at `0x0000000000000000000000000000000000000FD2`. Only a successful
boolean result writes verified state and emits `EvidenceVerified`. A global
chain-and-bytes identifier prevents the same evidence being admitted to a
different milestone. Policy overwrite and replay are rejected. There are no
payable functions, token calls, balance management, releases or refunds.

`VERIFIED` means inclusion of the exact owner-selected evidence. It does not
mean work quality, task completion, source-address ownership or settlement.
The owner is trusted to choose an appropriate source commitment. The contract
does not independently decode business semantics or require a particular
project-owned event. Its MVP purpose is a verifiable record of the exact
owner-selected cross-chain evidence. Financial settlement is outside scope.

## Evidence

- Compiler: Solidity 0.8.36; optimizer 200; EVM Paris; zero warnings.
- Deployment bytecode: 2,447 bytes; artifact in `output/contracts/`.
- `test/registry-contract.test.cjs`: two EVM tests cover 16 policy, state,
  replay and boundary cases. In-memory mock at the native address; no external
  calls. Ganache generated only deterministic synthetic VM accounts in memory.
- The mock validates application behavior. Actual native verification was
  separately confirmed by `src/proof-admission.cjs` through public testnet reads.
- No public deployment, public wallet creation, faucet request, signature or
  transaction was performed.

## Unsigned plan

`evidence/registry-testnet-unsigned-plan-2026-09-06.json` contains exact deployment
bytecode plus encoded configuration and proof-verification calls. Deployment
has no constructor argument; the sender becomes the immutable owner.

The deployment estimate returned by CC3 Testnet's actual `eth_estimateGas` was
**594,343 gas**, with an observed gas price of **500,000,000 wei** on September
6 at 21:47 UTC. Multiplication gives **297,171,500,000,000 wei** of testnet gas
for deployment at that price. This is not a guaranteed fee or a total budget.
Configuration and proof-verification gas are still unknown until the contract
is deployed and their exact call contexts can be estimated. A testnet gas
balance is required; no asset principal is transferred by any planned call.

`node prepare-testnet-plan.cjs` defaults to disabled. Use
`--write-plan` to generate unsigned JSON and optionally `--estimate-read-only`
for public RPC estimates. The script has no signing or broadcast path.

## Exact next owner action

1. Select a dedicated, empty testnet identity in the owner's trusted wallet.
   Verify chain 102031 and obtain only testnet gas through the official faucet.
2. Review the source, compiler settings and deployment bytecode. Deploy through
   the owner's wallet/tool and preserve its real transaction receipt.
3. Run the planner again with `--write-plan --registry CONTRACT_ADDRESS` so
   steps 2 and 3 have a verified destination. Never sign a configuration or
   verification call whose destination is null.
4. Inspect the exact benchmark digest and submit owner configuration, then
   proof verification. Both use value zero; gas fees are still required.
5. Preserve explorer links, the `EvidenceVerified` log and queried storage.
   Confirm repeated evidence reverts through a read-only call.

No transaction is executed by this handoff. Root coordinates the owner's
wallet step separately. The existing public benchmark can verify the registry
path but cannot prove project work was performed. After real testnet deployment
and the verified persistent-state transition, this registry can be the complete
technical MVP; no escrow/payment feature is required by its scope.

## Exact event requirement

The official DoraHacks Project Requirements say "Must be deployed on a testnet."
and "Must integrate the Attestcoin Protocol as a core feature." The root's
official-browser review confirmed these clauses on September 6, 2026:
https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail . Eligibility declarations
and authenticated submission remain separate owner/portal gates. The rules do
not require this project to implement financial settlement.

## Primary references

- [Official environments and precompile address](https://docs.attestcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments).
- [Official Attestcoin SDK and proof workflow](https://docs.attestcoin.org/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-sdk-usc-sdk).
- [Solidity compiler release](https://www.soliditylang.org/blog/2026/07/09/solidity-0.8.36-release-announcement/).

The current SDK guide's working prover endpoint and the environment page's
listed proof endpoint differ. The saved successful integration uses the SDK
guide's `https://prover.cc3-testnet.creditcoin.network` and keeps that exact host.
