# AgentShield 链上风险信号库

在仓库根目录运行 `pnpm install --frozen-lockfile`，再进入 `contracts/` 执行以下命令。

```sh
forge build
forge test
RUN_SEMAPHORE_FFI=true forge test --ffi
RUN_BSC_FORK=true forge test --ffi --fork-url https://bsc-rpc.publicnode.com \
  --match-contract AgentShieldRegistryBscForkTest --gas-report
```

默认测试可离线运行。启用真实证明测试时，Node 脚本首次按需下载 Semaphore 电路到 `cache/semaphore/`。BSC fork 测试读取主网 Agent ID，交易在本地分叉执行。

## 登记与投票

每个 Agent ID 持有地址只能通过 `join` 登记一次，身份承诺永久有效。再次提交新承诺会触发 `AlreadyJoined`。身份秘密丢失后只能通过本地加密备份恢复。

`vote` 比对证明中的 scope 和 message 后，调用 Semaphore 的只读 `verifyProof`。Registry 自己记录已经计票的 nullifier，重复提交会触发 `DuplicateVote`。其他地址直接调用 Semaphore 的 `validateProof` 后，同一份证明仍可在 Registry 中计入一次。

新成员加入后，被替换的历史根在一小时内有效。Semaphore 通过群组的 `merkleTreeDuration` 检查此期限。

## 部署

从仓库根目录运行下列命令。脚本从环境读取 `RPC_URL`、`DEPLOYER_PRIVATE_KEY`、`SEEDER_ADDRESS`，以及可选的 `CHAIN_ID`、`AGENT_ID_ADDRESS`、`N`（默认 3）和 `T`（默认 86,400 秒）。本地 Anvil 使用临时测试密钥和 `CHAIN_ID=31337`，BSC 测试网用 `CHAIN_ID=97` 和 `T=600` 可缩短演示等待时间。

```sh
node contracts/script/deploy.mjs
```

Forge 自动部署并链接 PoseidonT3，脚本部署 SemaphoreVerifier、Semaphore 与 Registry。Registry 创建由自身管理的 Semaphore 群组，将历史根有效期设为 3,600 秒。部署成功后脚本打印所有合约地址、Registry 交易和实际部署区块，并保存到 `contracts/deployments/<chainId>.json`。

非主网可省略 `AGENT_ID_ADDRESS`，脚本会部署 `MockAgentIdTestnet`。调用者可用 `claim()` 领取一次。BSC 主网必须显式提供 `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`。完整流程见[部署手册](../docs/dev/deploy-runbook.md)。

部署参数指定的 `seeder` 是唯一特权角色。它可增加种子计数、通过 `Seeded` 事件记录来源，以及通过 `renounceSeeder()` 永久放弃种子权限。社区投票按证明单独计数。对象计数可通过 `signalsOf(t, id)` 查询，登记总人数可通过 `registeredCount()` 查询。
