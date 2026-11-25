import testnet from "../../contracts/deployments/97.json" with { type: "json" };

export const deployments = {
  mainnet: {
    agentIdAddress: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
    rpcUrl: "https://bsc-rpc.publicnode.com",
    registryAddress: "",
    deploymentBlock: "",
    relayerUrl: "",
  },
  testnet: {
    agentIdAddress: testnet.agentId,
    rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
    registryAddress: testnet.registry,
    deploymentBlock: testnet.deploymentBlock,
    relayerUrl: "https://agentshield-relayer-testnet.vercel.app",
  },
};
