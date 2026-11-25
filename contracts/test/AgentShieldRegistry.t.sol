// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AgentShieldRegistry} from "../src/AgentShieldRegistry.sol";
import {AgentShieldRegistryTestBase, MockAgentId} from "./AgentShieldRegistryTestBase.sol";

contract AgentShieldRegistryTest is AgentShieldRegistryTestBase {
    address private constant HOLDER = address(0xA11CE);

    function setUp() public {
        MockAgentId agentId = new MockAgentId();
        agentId.mint(HOLDER);
        deployRegistry(address(agentId));
    }

    function testJoinAddsMemberAndEmitsEvent() external {
        assertEq(semaphore.getGroupAdmin(registry.groupId()), address(registry));
        assertEq(semaphore.groups(registry.groupId()), 1 hours);
        assertEq(registry.N(), THRESHOLD);
        assertEq(registry.T(), COOLDOWN);
        assertEq(registry.registeredCount(), 0);

        vm.expectEmit(true, false, false, true, address(registry));
        emit AgentShieldRegistry.Joined(HOLDER, 123);
        vm.prank(HOLDER);
        registry.join(123);

        assertEq(registry.commitmentOf(HOLDER), 123);
        assertTrue(semaphore.hasMember(registry.groupId(), 123));
        assertEq(registry.registeredCount(), 1);
    }

    function testRejectsNonHolder() external {
        vm.expectRevert(AgentShieldRegistry.NotAgentIdHolder.selector);
        registry.join(123);
    }

    function testRegisteredAddressCannotJoinWithNewCommitment() external {
        vm.startPrank(HOLDER);
        registry.join(123);
        vm.expectRevert(AgentShieldRegistry.AlreadyJoined.selector);
        registry.join(456);
        vm.stopPrank();
        assertEq(registry.commitmentOf(HOLDER), 123);
        assertTrue(semaphore.hasMember(registry.groupId(), 123));
        assertFalse(semaphore.hasMember(registry.groupId(), 456));
        assertEq(registry.registeredCount(), 1);
    }

    function testSeedsAndAppealsHaveSeparateCounts() external {
        bytes32 source = keccak256("feed");
        vm.expectEmit(true, true, true, true, address(registry));
        emit AgentShieldRegistry.Seeded(DOMAIN, TARGET, source);
        seedOne(TARGET);

        assertCounts(TARGET, 0, 0, 1, 0, 0, AgentShieldRegistry.Status.None);

        vm.expectEmit(true, true, true, true, address(registry));
        emit AgentShieldRegistry.Appealed(DOMAIN, TARGET, RELAYER, "ipfs://evidence");
        vm.prank(RELAYER);
        registry.appeal(DOMAIN, TARGET, "ipfs://evidence");

        assertCounts(TARGET, 0, 0, 1, 0, 1, AgentShieldRegistry.Status.None);
        assertCounts(keccak256("other.test"), 0, 0, 0, 0, 0, AgentShieldRegistry.Status.None);
        (,, uint256 addressSeeds,, uint256 addressAppeals,) =
            registry.signalsOf(AgentShieldRegistry.TargetType.ADDRESS, TARGET);
        assertEq(addressSeeds, 0);
        assertEq(addressAppeals, 0);
    }

    function testOnlySeederCanSeedOrRenounce() external {
        vm.expectRevert(AgentShieldRegistry.NotSeeder.selector);
        registry.seedBatch(new AgentShieldRegistry.SeedItem[](0));
        vm.expectRevert(AgentShieldRegistry.NotSeeder.selector);
        registry.renounceSeeder();
    }

    function testSeederRenunciationIsPermanent() external {
        seedOne(TARGET);
        vm.prank(SEEDER);
        registry.renounceSeeder();
        assertEq(registry.seeder(), address(0));

        vm.expectRevert(AgentShieldRegistry.NotSeeder.selector);
        seedOne(TARGET);
        assertCounts(TARGET, 0, 0, 1, 0, 0, AgentShieldRegistry.Status.None);
    }

    function testRejectsBNBTransfer() external {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(registry).call{value: 1 ether}("");
        assertFalse(success);
        assertEq(address(registry).balance, 0);
    }
}
