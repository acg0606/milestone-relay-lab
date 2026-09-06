// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @dev Signature and structs match the official @gluwa/usc-sdk verifier ABI.
interface IAttestcoinVerifier {
    struct Sibling { bytes32 hash; bool isLeft; }
    struct MerkleProof { bytes32 root; Sibling[] siblings; }
    struct ContinuityProof { bytes32 lowerEndpointDigest; bytes32[] roots; }
    function verify(uint64 chainKey, uint64 height, bytes calldata transactionBytes,
        MerkleProof calldata merkleProof, ContinuityProof calldata continuityProof) external view returns (bool);
}

/// @notice Records inclusion of exact owner-selected source evidence. No payable operations.
/// @dev VERIFIED means inclusion verified; it does not mean work quality or settlement.
contract MilestoneEvidenceRegistry {
    address public constant VERIFIER = 0x0000000000000000000000000000000000000FD2;
    uint256 public constant DESTINATION_CHAIN_ID = 102031;
    uint64 public constant SOURCE_CHAIN_KEY = 1; // Sepolia on CC3 Testnet
    address public immutable owner;

    struct Milestone {
        bytes32 expectedBytesHash;
        uint64 sourceHeight;
        bool configured;
        bool verified;
    }
    mapping(bytes32 => Milestone) public milestones;
    mapping(bytes32 => bool) public consumedEvidence;

    error WrongDestinationChain();
    error OwnerOnly();
    error InvalidPolicy();
    error PolicyAlreadyConfigured();
    error MilestoneNotConfigured();
    error MilestoneAlreadyVerified();
    error SourceBindingMismatch();
    error EvidenceAlreadyConsumed();
    error NativeProofRejected();

    event MilestoneConfigured(bytes32 indexed milestoneId, uint64 sourceHeight, bytes32 expectedBytesHash);
    event EvidenceVerified(bytes32 indexed milestoneId, bytes32 indexed evidenceKey, address indexed relayer,
        uint64 sourceHeight, bytes32 transactionBytesHash);

    constructor() {
        if (block.chainid != DESTINATION_CHAIN_ID) revert WrongDestinationChain();
        owner = msg.sender;
    }

    /// @notice Owner commits the exact source bytes and height before proof admission.
    /// @dev Immutable policy; callers must inspect what the committed source bytes mean.
    function configureMilestone(bytes32 milestoneId, uint64 sourceHeight, bytes32 expectedBytesHash) external {
        if (msg.sender != owner) revert OwnerOnly();
        if (milestoneId == bytes32(0) || sourceHeight == 0 || expectedBytesHash == bytes32(0)) revert InvalidPolicy();
        if (milestones[milestoneId].configured) revert PolicyAlreadyConfigured();
        milestones[milestoneId] = Milestone(expectedBytesHash, sourceHeight, true, false);
        emit MilestoneConfigured(milestoneId, sourceHeight, expectedBytesHash);
    }

    /// @notice Anyone may relay the exact proof; only the native verifier authorizes state change.
    function verifyMilestone(bytes32 milestoneId, uint64 chainKey, uint64 sourceHeight,
        bytes calldata transactionBytes, IAttestcoinVerifier.MerkleProof calldata merkleProof,
        IAttestcoinVerifier.ContinuityProof calldata continuityProof) external {
        Milestone storage milestone = milestones[milestoneId];
        if (!milestone.configured) revert MilestoneNotConfigured();
        if (milestone.verified) revert MilestoneAlreadyVerified();
        bytes32 bytesHash = keccak256(transactionBytes);
        if (chainKey != SOURCE_CHAIN_KEY || sourceHeight != milestone.sourceHeight || bytesHash != milestone.expectedBytesHash)
            revert SourceBindingMismatch();
        bytes32 evidenceKey = keccak256(abi.encode(chainKey, bytesHash));
        if (consumedEvidence[evidenceKey]) revert EvidenceAlreadyConsumed();
        if (!IAttestcoinVerifier(VERIFIER).verify(chainKey, sourceHeight, transactionBytes, merkleProof, continuityProof))
            revert NativeProofRejected();
        consumedEvidence[evidenceKey] = true;
        milestone.verified = true;
        emit EvidenceVerified(milestoneId, evidenceKey, msg.sender, sourceHeight, bytesHash);
    }
}
