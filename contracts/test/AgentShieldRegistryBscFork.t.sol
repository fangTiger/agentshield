// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {IAgentId} from "../src/IAgentId.sol";
import {AgentShieldRegistry} from "../src/AgentShieldRegistry.sol";
import {AgentShieldRegistryTestBase} from "./AgentShieldRegistryTestBase.sol";

contract AgentShieldRegistryBscForkTest is AgentShieldRegistryTestBase {
    address private constant BSC_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address private constant HOLDER = 0x4ADdD575Cd033603B7Da427354c8725765fd5Eb4;

    function testBscHolderCanJoinAndVoteAnonymouslyAndPublicly() external {
        vm.skip(!vm.envOr("RUN_BSC_FORK", false), unicode"设置 RUN_BSC_FORK=true 并传入 BSC RPC 和 --ffi");
        assertEq(block.chainid, 56, unicode"测试需要 BSC 主网分叉");
        assertGt(IAgentId(BSC_AGENT_ID).balanceOf(HOLDER), 0);

        deployRegistry(BSC_AGENT_ID);
        uint256[] memory members = new uint256[](1);
        members[0] = identityCommitments()[0];
        vm.prank(HOLDER);
        registry.join(members[0]);
        assertEq(registry.registeredCount(), 1);

        ISemaphore.SemaphoreProof memory anonymousProof = prove(0, members, DOMAIN, TARGET, DANGER, EVIDENCE);
        vm.prank(RELAYER);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, anonymousProof);
        vm.expectRevert(AgentShieldRegistry.DuplicateVote.selector);
        vm.prank(HOLDER);
        registry.vote(DOMAIN, TARGET, DANGER, EVIDENCE, anonymousProof);

        bytes32 other = keccak256("public.example.test");
        ISemaphore.SemaphoreProof memory disclosed = prove(0, members, DOMAIN, other, DANGER, EVIDENCE);
        vm.prank(HOLDER);
        registry.vote(DOMAIN, other, DANGER, EVIDENCE, disclosed);

        seedOne(TARGET);
        assertCounts(TARGET, 1, 0, 1, block.timestamp, 0, AgentShieldRegistry.Status.Pending);
        assertCounts(other, 1, 0, 0, block.timestamp, 0, AgentShieldRegistry.Status.Pending);
    }
}
