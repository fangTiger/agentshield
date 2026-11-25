// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {DeployAgentShield} from "../script/DeployAgentShield.s.sol";

contract DeployAgentShieldTest is Test {
    function test_MainnetRequiresRealAgentId() external {
        vm.chainId(56);
        DeployAgentShield script = new DeployAgentShield();
        vm.setEnv("AGENT_ID_ADDRESS", "");
        bytes memory invalidAgentId = abi.encodeWithSignature("Error(string)", unicode"BSC 主网必须设置真实 Agent ID 地址");
        vm.expectRevert(invalidAgentId);
        script.run();

        vm.setEnv("AGENT_ID_ADDRESS", "0x0000000000000000000000000000000000000001");
        vm.expectRevert(invalidAgentId);
        script.run();
    }
}
