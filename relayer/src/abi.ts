// 由 contracts/script/export-abi.mjs 生成。
export const agentShieldRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "agentIdAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "semaphoreAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "threshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cooldown",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "initialSeeder",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "N",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "T",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "appeal",
    "inputs": [
      {
        "name": "t",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "evidenceURI",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "commitmentOf",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "groupId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "join",
    "inputs": [
      {
        "name": "commitment",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registeredCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceSeeder",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "seedBatch",
    "inputs": [
      {
        "name": "items",
        "type": "tuple[]",
        "internalType": "struct AgentShieldRegistry.SeedItem[]",
        "components": [
          {
            "name": "targetType",
            "type": "uint8",
            "internalType": "enum AgentShieldRegistry.TargetType"
          },
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "sourceId",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "seeder",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "semaphore",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ISemaphore"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "signalsOf",
    "inputs": [
      {
        "name": "t",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "dangerVotes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "falsePositiveVotes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "seedCount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "firstDangerAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "appealCount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.Status"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "statusOf",
    "inputs": [
      {
        "name": "t",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.Status"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usedNullifiers",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vote",
    "inputs": [
      {
        "name": "t",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "v",
        "type": "uint8",
        "internalType": "enum AgentShieldRegistry.VoteType"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "proof",
        "type": "tuple",
        "internalType": "struct ISemaphore.SemaphoreProof",
        "components": [
          {
            "name": "merkleTreeDepth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "merkleTreeRoot",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nullifier",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "message",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "scope",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "points",
            "type": "uint256[8]",
            "internalType": "uint256[8]"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Appealed",
    "inputs": [
      {
        "name": "targetType",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "appellant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "evidenceURI",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Joined",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "commitment",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Seeded",
    "inputs": [
      {
        "name": "targetType",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "sourceId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Voted",
    "inputs": [
      {
        "name": "targetType",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum AgentShieldRegistry.TargetType"
      },
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "voteType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum AgentShieldRegistry.VoteType"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "nullifier",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyJoined",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateVote",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidMessage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidProof",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidScope",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAgentIdHolder",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotSeeder",
    "inputs": []
  }
] as const;
