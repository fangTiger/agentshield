# BSC 测试网部署记录（2026-11-24）

## 合约地址（chainId 97，已在 BscScan 验证源码）

| 合约 | 地址 |
| --- | --- |
| AgentShieldRegistry | [0xac18215c87c6d4d0f1c1ed090ee54d9a8ee6e5da](https://testnet.bscscan.com/address/0xac18215c87c6d4d0f1c1ed090ee54d9a8ee6e5da#code) |
| MockAgentIdTestnet（仅测试网） | [0x5ADAFA85b2fc09c1769F5bcc9F216D5104CCB688](https://testnet.bscscan.com/address/0x5ADAFA85b2fc09c1769F5bcc9F216D5104CCB688#code) |
| Semaphore | [0xb7e67Aaf211cC4c0B05a427aD4B1F802355CE56F](https://testnet.bscscan.com/address/0xb7e67Aaf211cC4c0B05a427aD4B1F802355CE56F#code) |
| SemaphoreVerifier | [0x5fa3459467a490b8ed7e6659ab802a197feffff3](https://testnet.bscscan.com/address/0x5fa3459467a490b8ed7e6659ab802a197feffff3#code) |
| PoseidonT3 | [0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9](https://testnet.bscscan.com/address/0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9#code) |

- 部署区块：144594402
- 参数：N=3，T=600 秒（测试网缩短冷静期），种子地址 `0x45f5F8d2BBb9cF1BC02c68829BEACa0f38382C45`
- 完整清单：`contracts/deployments/97.json`

## Vercel 服务

| 服务 | 地址 | 项目 |
| --- | --- | --- |
| 匿名中继 | https://agentshield-relayer-testnet.vercel.app | agentshield-relayer-testnet（Root：relayer，Hono，Node 22） |
| 网页 | https://agentshield-testnet.vercel.app | agentshield-testnet（Root：web，Next.js，Node 22） |

中继限流参数：每个实例 2 QPS，每日 gas 预算 2000 万。中继私钥以 sensitive 变量的形式保存在 Vercel 上，只对 Production 环境生效。

部署源码通过 `git checkout-index` 从暂存区导出到临时目录，导出结果不包含 `.env`。

## 种子

- 共 1551 条 DOMAIN 种子，分 32 批写入，覆盖 1542 个不同的对象（有 9 条在多个情报源中重复出现）。
- 来源：MetaMask eth-phishing-detect、ScamSniffer 和 Unit 42 IOC，均为经仿冒筛选后的结果。
- 没有写入 Skill 种子：人工复核后，所有候选都判定为误报。

## 端到端验收（3 个一次性演示账户，均领取了 Mock Agent ID）

| 步骤 | 结果 |
| --- | --- |
| 非持有者 `join` | 回滚，错误为 `NotAgentIdHolder`（0xea11784e） |
| 直接向合约转 BNB | 回滚 |
| 3 个持有者 `join` | 成功，`registeredCount=3` |
| 3 张匿名「危险」票（经 Vercel 中继提交） | 成功；交易发送方是中继地址，事件中不含投票者信息 |
| 同一身份再次投票（客户端） | 本机预检提示「已投过」 |
| 同一证明直接提交给中继 | HTTP 409，错误为 `DuplicateVote` |
| 同一证明由持有者地址以公开模式提交 | 合约回滚，错误为 `DuplicateVote` |
| 冷静期内查询状态 | 待验证 |
| 冷静期 T 过后查询状态 | 社区确认（`statusOf=2`） |
| 对种子域名做体检 | 命中链上种子：「情报源：AgentShield Registry… 种子计数 1」 |
| 扫描恶意 Skill（r3 样本），2 票后由另一个 Agent 扫描 | 结论为高风险，并显示「社区信号：2 位真人确认（待验证）」。这次扫描的静态规则判为高风险，默认开启的自动上报经中继匿名投出了第 3 票（交易 0xb4f726…），这个 Skill 随后进入「社区确认」 |

## 测试网 gas 实测

| 操作 | gas |
| --- | --- |
| join | 130,606 / 169,255 / 181,998（随成员树深度增长） |
| 匿名投票（第 1 票） | 342,157 |
| 匿名投票（后续） | 约 302,950 |
| seedBatch，50 条 | 1,307,694（约 26k/条） |
| seedBatch，1 条 | 50,142 |

测试网 gas 价格为 0.1 gwei。
