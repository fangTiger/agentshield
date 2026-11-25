// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreGroups} from "@semaphore-protocol/contracts/interfaces/ISemaphoreGroups.sol";
import {IAgentId} from "./IAgentId.sol";

/// @title AgentShield 链上风险信号库
/// @notice Agent ID 持有者一次性登记身份承诺，社区通过 Semaphore 证明提交风险信号。
/// @dev 唯一特权角色 seeder 可累计种子计数、记录来源，以及永久放弃自身权限。
///      社区票数仅由有效的成员证明增加，与种子计数独立。
contract AgentShieldRegistry {
    enum TargetType {
        DOMAIN,
        ADDRESS,
        SKILL
    }

    enum VoteType {
        Danger,
        FalsePositive
    }

    enum Status {
        None,
        Pending,
        Confirmed,
        Disputed
    }

    struct SeedItem {
        TargetType targetType;
        bytes32 id;
        bytes32 sourceId;
    }

    struct SignalCounts {
        uint256 dangerVotes;
        uint256 falsePositiveVotes;
        uint256 seedCount;
        uint256 firstDangerAt;
        uint256 appealCount;
    }

    error NotAgentIdHolder();
    error AlreadyJoined();
    error NotSeeder();
    error InvalidScope();
    error InvalidMessage();
    error InvalidProof();
    error DuplicateVote();

    event Joined(address indexed account, uint256 commitment);
    event Voted(
        TargetType indexed targetType, bytes32 indexed id, VoteType voteType, bytes32 evidenceHash, uint256 nullifier
    );
    event Appealed(TargetType indexed targetType, bytes32 indexed id, address indexed appellant, string evidenceURI);
    event Seeded(TargetType indexed targetType, bytes32 indexed id, bytes32 indexed sourceId);

    uint256 public immutable N;
    uint256 public immutable T;
    uint256 public immutable groupId;
    ISemaphore public immutable semaphore;
    IAgentId private immutable AGENT_ID;

    address public seeder;
    mapping(address => uint256) public commitmentOf;
    mapping(TargetType => mapping(bytes32 => SignalCounts)) private signals;
    mapping(uint256 => bool) public usedNullifiers;

    constructor(
        address agentIdAddress,
        address semaphoreAddress,
        uint256 threshold,
        uint256 cooldown,
        address initialSeeder
    ) {
        AGENT_ID = IAgentId(agentIdAddress);
        semaphore = ISemaphore(semaphoreAddress);
        N = threshold;
        T = cooldown;
        seeder = initialSeeder;
        groupId = semaphore.createGroup(address(this), 1 hours);
    }

    /// @notice 永久登记调用者的身份承诺。身份秘密丢失后只能通过本地加密备份恢复。
    function join(uint256 commitment) external {
        if (commitmentOf[msg.sender] != 0) revert AlreadyJoined();
        if (AGENT_ID.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();

        semaphore.addMember(groupId, commitment);
        commitmentOf[msg.sender] = commitment;
        emit Joined(msg.sender, commitment);
    }

    /// @notice 提交绑定风险对象和投票内容的成员证明。
    /// @dev Semaphore 只读校验证明及一小时历史根有效期，投票去重由本合约记录。
    function vote(TargetType t, bytes32 id, VoteType v, bytes32 evidenceHash, ISemaphore.SemaphoreProof calldata proof)
        external
    {
        if (proof.scope != uint256(keccak256(abi.encode(block.chainid, address(this), t, id))) >> 8) {
            revert InvalidScope();
        }
        if (proof.message != uint256(keccak256(abi.encode(v, evidenceHash))) >> 8) revert InvalidMessage();
        if (usedNullifiers[proof.nullifier]) revert DuplicateVote();
        if (!semaphore.verifyProof(groupId, proof)) revert InvalidProof();
        usedNullifiers[proof.nullifier] = true;

        SignalCounts storage counts = signals[t][id];
        if (v == VoteType.Danger) {
            if (counts.dangerVotes == 0) counts.firstDangerAt = block.timestamp;
            ++counts.dangerVotes;
        } else {
            ++counts.falsePositiveVotes;
        }
        emit Voted(t, id, v, evidenceHash, proof.nullifier);
    }

    function appeal(TargetType t, bytes32 id, string calldata evidenceURI) external {
        ++signals[t][id].appealCount;
        emit Appealed(t, id, msg.sender, evidenceURI);
    }

    function seedBatch(SeedItem[] calldata items) external {
        if (msg.sender != seeder) revert NotSeeder();
        for (uint256 i = 0; i < items.length; ++i) {
            SeedItem calldata item = items[i];
            ++signals[item.targetType][item.id].seedCount;
            emit Seeded(item.targetType, item.id, item.sourceId);
        }
    }

    function renounceSeeder() external {
        if (msg.sender != seeder) revert NotSeeder();
        seeder = address(0);
    }

    function statusOf(TargetType t, bytes32 id) external view returns (Status) {
        return deriveStatus(signals[t][id]);
    }

    /// @notice 查询社区票数、种子计数、首张危险票时间、申诉数和当前状态。
    /// @dev 种子来源可通过 Seeded 事件查询。
    function signalsOf(TargetType t, bytes32 id)
        external
        view
        returns (
            uint256 dangerVotes,
            uint256 falsePositiveVotes,
            uint256 seedCount,
            uint256 firstDangerAt,
            uint256 appealCount,
            Status status
        )
    {
        SignalCounts storage counts = signals[t][id];
        return (
            counts.dangerVotes,
            counts.falsePositiveVotes,
            counts.seedCount,
            counts.firstDangerAt,
            counts.appealCount,
            deriveStatus(counts)
        );
    }

    function registeredCount() external view returns (uint256) {
        return ISemaphoreGroups(address(semaphore)).getMerkleTreeSize(groupId);
    }

    function deriveStatus(SignalCounts storage counts) private view returns (Status) {
        uint256 danger = counts.dangerVotes;
        uint256 falsePositive = counts.falsePositiveVotes;
        if (falsePositive != 0 && falsePositive >= N && falsePositive >= danger) return Status.Disputed;
        if (danger == 0) return Status.None;
        if (danger >= N && danger / 2 >= falsePositive && block.timestamp - counts.firstDangerAt >= T) {
            return Status.Confirmed;
        }
        return Status.Pending;
    }
}
