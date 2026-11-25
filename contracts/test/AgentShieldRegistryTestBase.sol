// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {AgentShieldRegistry} from "../src/AgentShieldRegistry.sol";

contract MockAgentId {
    mapping(address => uint256) public balanceOf;

    function mint(address holder) external {
        balanceOf[holder] = 1;
    }
}

abstract contract AgentShieldRegistryTestBase is Test {
    address internal constant SEEDER = address(0x5EED);
    address internal constant RELAYER = address(0xDE1A);
    uint256 internal constant THRESHOLD = 2;
    uint256 internal constant COOLDOWN = 1 days;
    bytes32 internal constant TARGET = keccak256("example.test");
    bytes32 internal constant EVIDENCE = keccak256("evidence");
    AgentShieldRegistry.TargetType internal constant DOMAIN = AgentShieldRegistry.TargetType.DOMAIN;
    AgentShieldRegistry.VoteType internal constant DANGER = AgentShieldRegistry.VoteType.Danger;
    AgentShieldRegistry.VoteType internal constant FALSE_POSITIVE = AgentShieldRegistry.VoteType.FalsePositive;

    Semaphore internal semaphore;
    AgentShieldRegistry internal registry;

    function deployRegistry(address agentId) internal {
        // Foundry 为 Semaphore 部署并链接真实的 PoseidonT3 库。
        semaphore = new Semaphore(ISemaphoreVerifier(address(new SemaphoreVerifier())));
        registry = new AgentShieldRegistry(agentId, address(semaphore), THRESHOLD, COOLDOWN, SEEDER);
    }

    function seedOne(bytes32 id) internal {
        AgentShieldRegistry.SeedItem[] memory items = new AgentShieldRegistry.SeedItem[](1);
        items[0] = AgentShieldRegistry.SeedItem(DOMAIN, id, keccak256("feed"));
        vm.prank(SEEDER);
        registry.seedBatch(items);
    }

    function assertCounts(
        bytes32 id,
        uint256 danger,
        uint256 falsePositive,
        uint256 seeds,
        uint256 firstDangerAt,
        uint256 appeals,
        AgentShieldRegistry.Status status
    ) internal view {
        assertEq(uint256(registry.statusOf(DOMAIN, id)), uint256(status));
        (
            uint256 actualDanger,
            uint256 actualFalsePositive,
            uint256 actualSeeds,
            uint256 actualFirstDangerAt,
            uint256 actualAppeals,
            AgentShieldRegistry.Status actualStatus
        ) = registry.signalsOf(DOMAIN, id);
        assertEq(actualDanger, danger);
        assertEq(actualFalsePositive, falsePositive);
        assertEq(actualSeeds, seeds);
        assertEq(actualFirstDangerAt, firstDangerAt);
        assertEq(actualAppeals, appeals);
        assertEq(uint256(actualStatus), uint256(status));
    }

    function identityCommitments() internal returns (uint256[3] memory) {
        string[] memory command = new string[](3);
        command[0] = "node";
        command[1] = "test/ffi/semaphore.mjs";
        command[2] = "commitments";
        return abi.decode(vm.ffi(command), (uint256[3]));
    }

    function prove(
        uint256 signer,
        uint256[] memory members,
        AgentShieldRegistry.TargetType targetType,
        bytes32 id,
        AgentShieldRegistry.VoteType voteType,
        bytes32 evidenceHash
    ) internal returns (ISemaphore.SemaphoreProof memory) {
        uint256 scope =
            uint256(keccak256(abi.encode(block.chainid, address(registry), targetType, id))) >> 8;
        uint256 message = uint256(keccak256(abi.encode(voteType, evidenceHash))) >> 8;

        string memory csv = vm.toString(members[0]);
        for (uint256 i = 1; i < members.length; ++i) {
            csv = string.concat(csv, ",", vm.toString(members[i]));
        }

        string[] memory command = new string[](7);
        command[0] = "node";
        command[1] = "test/ffi/semaphore.mjs";
        command[2] = "prove";
        command[3] = vm.toString(signer);
        command[4] = csv;
        command[5] = vm.toString(message);
        command[6] = vm.toString(scope);
        return abi.decode(vm.ffi(command), (ISemaphore.SemaphoreProof));
    }
}
