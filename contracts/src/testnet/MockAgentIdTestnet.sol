// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IAgentId} from "../IAgentId.sol";

/// @notice 仅用于测试网和本地链的 Agent ID 模拟合约，主网不部署。
/// @dev 任意地址均可免费领取一次，不能用于证明真人身份。
contract MockAgentIdTestnet is IAgentId {
    error AlreadyClaimed();
    error ERC721InvalidOwner(address owner);

    mapping(address => uint256) private balances;

    /// @notice 为调用地址领取一个测试 Agent ID。
    function claim() external {
        if (balances[msg.sender] != 0) revert AlreadyClaimed();
        balances[msg.sender] = 1;
    }

    /// @notice 返回地址持有量，零地址和真实 Agent ID 一样会回滚。
    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ERC721InvalidOwner(account);
        return balances[account];
    }
}
