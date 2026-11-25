// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @notice 本地中继集成测试用的 Agent ID。
contract MockAgentId {
    function balanceOf(address) external pure returns (uint256) {
        return 1;
    }
}
