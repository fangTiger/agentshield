import mainnet from "../../contracts/deployments/56.json" with { type: "json" };
import testnet from "../../contracts/deployments/97.json" with { type: "json" };

// 内置部署信息：地址和部署区块取自部署清单，用户无需手写配置
export const deployments = {
  mainnet: {
    agentIdAddress: mainnet.agentId,
    rpcUrl: "https://bsc-rpc.publicnode.com",
    registryAddress: mainnet.registry,
    deploymentBlock: mainnet.deploymentBlock,
    relayerUrl: "https://agentshield-relayer.vercel.app",
  },
  testnet: {
    agentIdAddress: testnet.agentId,
    rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
    registryAddress: testnet.registry,
    deploymentBlock: testnet.deploymentBlock,
    relayerUrl: "https://agentshield-relayer-testnet.vercel.app",
  },
};
