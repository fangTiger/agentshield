// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {AgentShieldRegistry} from "../src/AgentShieldRegistry.sol";
import {MockAgentIdTestnet} from "../src/testnet/MockAgentIdTestnet.sol";

/// @notice 部署 Semaphore v4 和 AgentShield 风险信号库。
/// @dev Registry 创建并管理群组，身份承诺一次性登记，投票 nullifier 由 Registry 记录。
contract DeployAgentShield is Script {
    address private constant BSC_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external returns (AgentShieldRegistry registry) {
        string memory agentIdEnv = vm.envOr("AGENT_ID_ADDRESS", string(""));
        address agentId = bytes(agentIdEnv).length == 0 ? address(0) : vm.parseAddress(agentIdEnv);
        require(block.chainid != 56 || agentId == BSC_AGENT_ID, unicode"BSC 主网必须设置真实 Agent ID 地址");
        // 保留既有本地分叉测试使用的 Anvil 解锁账户入口。
        bool legacy = vm.envExists("AGENTSHIELD_SEEDER");
        address seeder = vm.envAddress(legacy ? "AGENTSHIELD_SEEDER" : "SEEDER_ADDRESS");
        uint256 threshold = vm.envOr(legacy ? "AGENTSHIELD_N" : "N", uint256(3));
        uint256 cooldown = vm.envOr(legacy ? "AGENTSHIELD_T" : "T", uint256(1 days));
        if (legacy) vm.startBroadcast();
        else vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        if (agentId == address(0)) agentId = address(new MockAgentIdTestnet());
        // Forge 随脚本部署并链接 Semaphore 依赖的 PoseidonT3 库。
        SemaphoreVerifier verifier = new SemaphoreVerifier();
        Semaphore semaphore = new Semaphore(ISemaphoreVerifier(address(verifier)));
        registry = new AgentShieldRegistry(agentId, address(semaphore), threshold, cooldown, seeder);
        vm.stopBroadcast();

        console2.log(unicode"Agent ID 地址", agentId);
        console2.log(unicode"验证器地址", address(verifier));
        console2.log(unicode"Semaphore 地址", address(semaphore));
        console2.log(unicode"风险信号库地址", address(registry));
        uint256 groupId = registry.groupId();
        console2.log(unicode"Semaphore 群组 ID", groupId);
        console2.log(unicode"Semaphore 历史根有效期（秒）", semaphore.groups(groupId));
    }
}
