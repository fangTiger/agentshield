# BSC 主网部署记录（2026-11-25）

## 合约地址（chainId 56，均已在 BscScan 验证源码）

| 合约 | 地址 |
| --- | --- |
| AgentShieldRegistry | [0xb7e67aaf211cc4c0b05a427ad4b1f802355ce56f](https://bscscan.com/address/0xb7e67aaf211cc4c0b05a427ad4b1f802355ce56f#code) |
| Agent ID（官方合约） | [0x60b9262456de011f7d15a54cdd8c48baaa8b022f](https://bscscan.com/address/0x60b9262456de011f7d15a54cdd8c48baaa8b022f) |
| Semaphore | [0x5fA3459467a490b8Ed7e6659ab802a197FEfFfF3](https://bscscan.com/address/0x5fA3459467a490b8Ed7e6659ab802a197FEfFfF3#code) |
| SemaphoreVerifier | [0x5adafa85b2fc09c1769f5bcc9f216d5104ccb688](https://bscscan.com/address/0x5adafa85b2fc09c1769f5bcc9f216d5104ccb688#code) |
| PoseidonT3 | [0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9](https://bscscan.com/address/0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9#code) |

- 部署区块：135603954；Registry 部署交易：`0x2350e23b3840bd209772470c9202b0aac3d864a14cb901e4bdf95e6a15e152bc`
- 参数：N=3，T=86400 秒，seeder 为 `0x45f5F8d2BBb9cF1BC02c68829BEACa0f38382C45`
- 地址和测试网的部分合约地址相同：两条链用的是同一个部署钱包，nonce 顺序也一样，属于正常现象
- 完整清单：`contracts/deployments/56.json`

部署后的检查：

- 链上 `N`、`T`、`seeder` 和预期一致。
- 用持有者地址模拟 `join`，调用成功。
- 用非持有者地址模拟 `join`，回滚，错误为 `NotAgentIdHolder`（0xea11784e）。

## Vercel 服务

| 服务 | 地址 | 项目 |
| --- | --- | --- |
| 网页 | https://agentshield-bsc.vercel.app（另有 agentshield-topaz.vercel.app） | agentshield（prj_pACrKuvr5ZfURaTyTLB9mU94LAyp） |
| 匿名中继 | https://agentshield-relayer.vercel.app | agentshield-relayer（prj_E6n7dVN5eIv6gpncR4lBttNe2Gyt） |

`agentshield.vercel.app` 归他人所有，与本项目无关。中继私钥以 sensitive 变量保存，只对 Production 环境生效。中继限流为 2 QPS，每日 gas 预算为 2000 万。

## 种子

与测试网是同一批人工复核过的 1551 条 DOMAIN 种子，分 32 批写入，覆盖 1542 个不同对象。中继 `/api/stats` 返回 1542 个对象。

## 主网 gas 实测

主网 gas 价格为 0.05 gwei。

| 操作 | gas |
| --- | --- |
| 部署 PoseidonT3 | 5,251,193 |
| 部署 SemaphoreVerifier | 3,795,266 |
| 部署 Semaphore | 2,864,272 |
| 部署 AgentShieldRegistry | 1,599,206 |
| seedBatch，50 条 | 1,329,546 |
| seedBatch，1 条 | 50,142 |
| join（第 1 位成员 captainbtc.ai，经 baw contract-call，[交易](https://bscscan.com/tx/0x766a83f8a1e8422127387b3c005b2f85e1d9321168f887b04e99ff6a99a97089)） | 130,399 |
| 匿名投票（第 1 票，经主网中继，发送方为中继地址，[交易](https://bscscan.com/tx/0x4a316a9b56b88dc029d9342faf956ac0abc5bf5af74b4411c4d630401513f1e0)） | 342,181 |

实际花费：部署约 0.00068 BNB，种子约 0.00205 BNB。首张匿名票投给种子域名 `0013008-binance.ph`，链上信号变为危险票 1、种子 1、状态「待验证」；同一身份再次投票时，本机预检拦截，提示「已投过」。

## 资金

| 钱包 | 用途 | 部署后余额 |
| --- | --- | --- |
| 部署 `0xB576…2f28` | 支付部署费，部署后没有任何合约权限 | 约 0.0093 BNB（可退回给用户） |
| 种子 `0x45f5…2C45` | 写入种子 | 约 0.0019 BNB |
| 中继 `0x1959…051F` | 代付匿名投票 | 0.003 BNB |
