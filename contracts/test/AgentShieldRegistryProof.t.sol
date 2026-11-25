// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {AgentShieldRegistry} from "../src/AgentShieldRegistry.sol";
import {AgentShieldRegistryTestBase, MockAgentId} from "./AgentShieldRegistryTestBase.sol";

contract AgentShieldRegistryProofTest is AgentShieldRegistryTestBase {
    address private constant FIRST_HOLDER = address(0xA11CE);
    address private constant SECOND_HOLDER = address(0xB0B);
    address private constant THIRD_HOLDER = address(0xC0C);
    uint256[3] private commitments;
    bool private runProofs;

    modifier withProofs() {
        vm.skip(!runProofs, unicode"设置 RUN_SEMAPHORE_FFI=true 并启用 --ffi");
        _;
    }

    function setUp() public {
        MockAgentId agentId = new MockAgentId();
        agentId.mint(FIRST_HOLDER);
        agentId.mint(SECOND_HOLDER);
        agentId.mint(THIRD_HOLDER);
        deployRegistry(address(agentId));

        runProofs = vm.envOr("RUN_SEMAPHORE_FFI", false);
        if (runProofs) commitments = identityCommitments();
        vm.warp(100);
    }

    function testRealProofRecordsAnonymousDangerVote() external withProofs {
        uint256[] memory members = joinTwo();
        seedOne(TARGET);
        ISemaphore.SemaphoreProof memory proof = prove(0, members, DOMAIN, TARGET, DANGER, EVIDENCE);
        assertFalse(registry.usedNullifiers(proof.nullifier));

        vm.expectEmit(true, true, false, true, address(registry));
        emit AgentShieldRegistry.Voted(DOMAIN, TARGET, DANGER, EVIDENCE, proof.nullifier);
        vm.prank(RELAYER);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, proof);

        assertTrue(registry.usedNullifiers(proof.nullifier));
        assertCounts(TARGET, 1, 0, 1, block.timestamp, 0, AgentShieldRegistry.Status.Pending);
        vm.warp(block.timestamp + COOLDOWN);
        assertEq(uint256(registry.statusOf(DOMAIN, TARGET)), uint256(AgentShieldRegistry.Status.Pending));
    }

    function testInvalidProofAndMismatchedPayloadRevert() external withProofs {
        uint256[] memory members = joinTwo();
        ISemaphore.SemaphoreProof memory proof = prove(0, members, DOMAIN, TARGET, DANGER, EVIDENCE);

        vm.expectRevert(AgentShieldRegistry.InvalidScope.selector);
        registry.vote(AgentShieldRegistry.TargetType.SKILL, TARGET, DANGER, EVIDENCE, proof);
        vm.expectRevert(AgentShieldRegistry.InvalidMessage.selector);
        registry.vote(DOMAIN, TARGET, FALSE_POSITIVE, EVIDENCE, proof);
        vm.expectRevert(AgentShieldRegistry.InvalidMessage.selector);
        registry.vote(DOMAIN, TARGET, DANGER, bytes32(0), proof);

        delete proof.points;
        vm.expectRevert(AgentShieldRegistry.InvalidProof.selector);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, proof);
        assertCounts(TARGET, 0, 0, 0, 0, 0, AgentShieldRegistry.Status.None);
    }

    function testPublicVoteAfterAnonymousVoteRevertsForSameNullifier() external withProofs {
        uint256[] memory members = joinTwo();
        ISemaphore.SemaphoreProof memory anonymousProof = prove(0, members, DOMAIN, TARGET, DANGER, EVIDENCE);
        ISemaphore.SemaphoreProof memory disclosed = prove(0, members, DOMAIN, TARGET, FALSE_POSITIVE, bytes32(0));
        assertEq(anonymousProof.nullifier, disclosed.nullifier);
        vm.prank(RELAYER);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, anonymousProof);

        vm.expectRevert(AgentShieldRegistry.DuplicateVote.selector);
        vm.prank(FIRST_HOLDER);
        registry.vote(DOMAIN, TARGET, FALSE_POSITIVE, bytes32(0), disclosed);
        assertCounts(TARGET, 1, 0, 0, block.timestamp, 0, AgentShieldRegistry.Status.Pending);
    }

    function testVoteCountsOnceAfterThirdPartyValidatesProofInSemaphore() external withProofs {
        uint256[] memory members = joinTwo();
        ISemaphore.SemaphoreProof memory proof = prove(0, members, DOMAIN, TARGET, DANGER, EVIDENCE);

        vm.prank(RELAYER);
        semaphore.validateProof(registry.groupId(), proof);
        assertCounts(TARGET, 0, 0, 0, 0, 0, AgentShieldRegistry.Status.None);

        vm.prank(FIRST_HOLDER);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, proof);

        vm.expectRevert(AgentShieldRegistry.DuplicateVote.selector);
        vm.prank(FIRST_HOLDER);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, proof);
        assertCounts(TARGET, 1, 0, 0, block.timestamp, 0, AgentShieldRegistry.Status.Pending);
    }

    function testOldProofRemainsValidForOneHourAfterJoin() external withProofs {
        uint256[] memory members = new uint256[](1);
        members[0] = commitments[0];
        vm.prank(FIRST_HOLDER);
        registry.join(members[0]);

        bytes32 other = keccak256("other.test");
        ISemaphore.SemaphoreProof memory valid = prove(0, members, DOMAIN, TARGET, DANGER, EVIDENCE);
        ISemaphore.SemaphoreProof memory expired = prove(0, members, DOMAIN, other, DANGER, EVIDENCE);
        vm.prank(SECOND_HOLDER);
        registry.join(commitments[1]);

        uint256 rootSupersededAt = block.timestamp;
        vm.warp(rootSupersededAt + 1 hours - 1);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, valid);
        vm.warp(rootSupersededAt + 1 hours);
        vm.expectRevert(ISemaphore.Semaphore__MerkleTreeRootIsExpired.selector);
        registry.vote(DOMAIN, other, DANGER, EVIDENCE, expired);
    }

    function testCommunityConfirmationWaitsForCooldownFromFirstDangerVote() external withProofs {
        uint256[] memory members = joinTwo();
        uint256 firstDangerAt = block.timestamp;
        castVote(0, members, TARGET, DANGER);
        vm.warp(firstDangerAt + COOLDOWN - 1);
        castVote(1, members, TARGET, DANGER);
        assertCounts(TARGET, 2, 0, 0, firstDangerAt, 0, AgentShieldRegistry.Status.Pending);

        vm.warp(firstDangerAt + COOLDOWN);
        assertCounts(TARGET, 2, 0, 0, firstDangerAt, 0, AgentShieldRegistry.Status.Confirmed);
    }

    function testFalsePositiveVotesDisputeWhenTheyReachThreshold() external withProofs {
        joinTwo();
        vm.prank(THIRD_HOLDER);
        registry.join(commitments[2]);
        uint256[] memory members = new uint256[](3);
        members[0] = commitments[0];
        members[1] = commitments[1];
        members[2] = commitments[2];
        uint256 firstDangerAt = block.timestamp;
        castVote(0, members, TARGET, DANGER);
        castVote(1, members, TARGET, FALSE_POSITIVE);
        assertCounts(TARGET, 1, 1, 0, firstDangerAt, 0, AgentShieldRegistry.Status.Pending);
        castVote(2, members, TARGET, FALSE_POSITIVE);
        assertCounts(TARGET, 1, 2, 0, firstDangerAt, 0, AgentShieldRegistry.Status.Disputed);
    }

    function testFalsePositiveOnlyCanBeDisputedWithoutADangerTimestamp() external withProofs {
        uint256[] memory members = joinTwo();
        castVote(0, members, TARGET, FALSE_POSITIVE);
        assertCounts(TARGET, 0, 1, 0, 0, 0, AgentShieldRegistry.Status.None);
        castVote(1, members, TARGET, FALSE_POSITIVE);
        assertCounts(TARGET, 0, 2, 0, 0, 0, AgentShieldRegistry.Status.Disputed);
    }

    function joinTwo() private returns (uint256[] memory members) {
        members = new uint256[](2);
        members[0] = commitments[0];
        members[1] = commitments[1];
        vm.prank(FIRST_HOLDER);
        registry.join(members[0]);
        vm.prank(SECOND_HOLDER);
        registry.join(members[1]);
    }

    function castVote(uint256 signer, uint256[] memory members, bytes32 id, AgentShieldRegistry.VoteType voteType)
        private
    {
        registry.vote(DOMAIN, id, voteType, EVIDENCE, prove(signer, members, DOMAIN, id, voteType, EVIDENCE));
    }
}
