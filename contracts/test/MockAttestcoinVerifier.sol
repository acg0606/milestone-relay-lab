// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;
import '../MilestoneEvidenceRegistry.sol';

/// @dev Local-EVM-only stand-in. Never deployed to a public network.
contract MockAttestcoinVerifier is IAttestcoinVerifier {
    uint256 public mode;
    function setMode(uint256 value) external { mode = value; }
    function verify(uint64, uint64, bytes calldata, MerkleProof calldata, ContinuityProof calldata)
        external view returns (bool) {
        require(mode != 2, 'MOCK_INVALID_PROOF');
        return mode == 1;
    }
}
