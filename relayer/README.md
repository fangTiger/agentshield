# AgentShield 匿名中继

使用 Node.js 22 或更新版本。在仓库根目录安装工作区依赖，然后构建中继。

```sh
pnpm install --frozen-lockfile
pnpm --dir relayer build
```

设置以下环境变量后运行 `pnpm --dir relayer start`。

| 环境变量 | 用途 |
| --- | --- |
| `RPC_URL` | 目标链的 HTTP RPC |
| `CHAIN_ID` | BSC 测试网填 `97`，主网填 `56`，本地 Anvil 填 `31337` |
| `REGISTRY_ADDRESS` | Registry 合约地址 |
| `RELAYER_PRIVATE_KEY` | 代付 gas 的钱包私钥，使用带 `0x` 的十六进制 |
| `DEPLOYMENT_BLOCK` | Registry 部署区块高度，十进制，从该区块开始统计事件 |
| `RELAYER_MAX_QPS` | 每个实例每秒允许的请求数 |
| `RELAYER_DAILY_GAS_BUDGET` | UTC 自然日内允许发送的 gas 单位上限 |
| `PORT` | 本地 Node HTTP 端口，默认为 `3000` |

旧的 `RELAYER_RPC_URL`、`RELAYER_REGISTRY_ADDRESS` 和 `RELAYER_DEPLOYMENT_BLOCK` 仍可用于本地启动。

## Vercel Functions

创建 Vercel 项目，把 Root Directory 设为 `relayer`，框架选 Hono。允许构建访问根目录的工作区配置与锁文件。Vercel 用 `src/app.ts` 的默认 Hono 导出创建 Node.js Function，并根据 `engines.node` 选择其支持的 Node.js 版本。将上表变量添加到对应环境，省略 `PORT`。把 `RELAYER_PRIVATE_KEY` 保存为敏感变量。[Hono 的 Vercel 文档](https://hono.dev/docs/getting-started/vercel) [Vercel Node.js 版本选择](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

QPS、每日 gas 预算和统计缓存都保存在实例内存中。广播前按估算的 gas 预留额度。不同实例分别计数，实例回收或重启后重置。所有实例共用中继钱包余额，余额是实际可花费 BNB 的硬上限。

## HTTP 接口

- `POST /vote` 接收 JSON 对象 `{ targetType, id, voteType, evidenceHash, proof }`。`targetType` 为 `0`（域名）、`1`（地址）或 `2`（Skill），`voteType` 为 `0`（危险）或 `1`（误报）。`id` 和 `evidenceHash` 使用 `0x` 开头的 32 字节十六进制字符串。`proof` 使用 Semaphore 4.14.5 的 `generateProof` 返回值。
- 投票发送后返回 `{ txHash }`。证明或模拟失败返回 400，合约自定义错误通过 `errorName` 返回。已上链的重复投票返回 409，超过频率或预算返回 429。
- `GET /api/stats` 允许任意来源跨域读取，返回 `{ joinedCount, votesLast24h, targets }`，结果缓存 60 秒。`targets` 的每一项包含 `targetType`、`id`、`dangerVotes`、`falsePositiveVotes`、`seedCount` 和 `appealCount`。

## ABI 与测试

重新编译 Registry 时，在仓库根目录运行以下命令，同步中继和 core 的 ABI。中继通过合约的 `usedNullifiers(nullifier)` getter 检查投票是否重复。

```sh
forge build --root contracts
node contracts/script/export-abi.mjs
node packages/core/src/chain/export-abi.mjs
```

默认测试使用模拟的 viem 客户端。集成测试需要 PATH 中的 Anvil、Cast 和 Forge。它用一次性密钥部署本地合约、提交真实证明，检查本地 Node 与 Vercel 入口返回的统计。首次生成证明时可能下载 Semaphore 电路。

```sh
pnpm --dir relayer test
RUN_RELAYER_INTEGRATION=true pnpm --dir relayer test
```
