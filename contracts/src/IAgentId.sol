// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice 登记时用于检查调用者是否持有 Agent ID。
interface IAgentId {
    function balanceOf(address account) external view returns (uint256);
}
