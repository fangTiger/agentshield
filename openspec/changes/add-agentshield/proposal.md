## Why

Agentic Wallet 让 AI Agent 可以直接操作链上资产。新的攻击面也随之出现，最典型的有两类：一是诱导用户扫码确认、交出配对码的**授权钓鱼**；二是暗藏「绕过用户确认」「转走资产」指令的**恶意 Skill**（2026-02 的一次审计发现，ClawHub 上 2,857 个 Skill 中有 341 个是恶意的）。目前每个 Agent 只能各自判断，缺少一个能共享、可复核、又防得住女巫攻击的风险信号源。

Agent ID 一个 KYC 只能领一个，而且不可转让。基于这一点，我们第一次可以在链上实现「每个风险信号都由不同的真人确认、一人一票」。再结合零知识证明，举报者可以保持匿名，不必担心被报复。Agent ID 从 2026-11-22 开始大规模铸造，这也是币安钱包 × BNB Chain「Agent ID 黑客松」的参赛作品（截止 2026-12-09）。

## What Changes

- 新增 **AgentShield Skill**（本地守卫）：装在用户自己的 Agent 中运行。持有者只需人工完成一次「加入」，之后扫描、体检、匿名上报全部自动进行。
- 新增**授权体检**：分析用户或 Agent 遇到的链接、二维码和话术，识别仿冒官方域名、他人发起的钱包授权请求、诱导输入配对码等风险。产品只做体检和解释，**不宣称拦截**。
- 新增 **Skill 红线扫描**：安装第三方 Skill 之前，逐条对照币安官方 6 条安全红线进行扫描。先跑静态规则，再做 LLM 审查，而且 LLM 只能把风险调高，不能调低。
- 新增**链上风险信号库**（BSC 合约）：
  - Agent ID 持有者通过 `join` 登记 Semaphore 身份承诺；
  - 每一票都附带 ZK 证明，并使用按议题隔离的 nullifier；
  - 持有者自己发送交易是公开投票，由中继代发是匿名投票；
  - 社区只能标记「危险」，信号默认处于「待验证」状态，可以申诉。
- 新增**匿名中继**：替匿名投票代付 gas 并提交交易，用户不需要动用钱包。
- 新增**威胁情报种子**：导入公开钓鱼库、恶意地址库、已知恶意 Skill，并对公开的 Skill 仓库做主动扫描，解决冷启动问题。
- 新增**观测网页**：展示信号库、各项统计和授权体检演示。网页上不展示任何 Agent ID 与地址之间的对应关系。

## Capabilities

### New Capabilities
- `shield-skill`：Skill 本体，包括安装、一次性加入流程、自动化触发、用户确认边界、对不可信数据的处理、本地身份管理
- `wallet-auth-checkup`：授权体检，覆盖链接、二维码、话术的解析与风险判定，以及能力边界的展示
- `skill-redline-scan`：Skill 红线扫描，包括静态规则、LLM 只升不降的审查、内容哈希与结果报告
- `risk-signal-registry`：链上风险信号库，包括 Agent ID 准入、Semaphore 身份、投票与 nullifier、信号状态机、申诉、种子信号、匿名中继
- `threat-intel-feeds`：威胁情报源，包括种子数据来源、同步与缓存、许可证合规、来源标注
- `shield-dashboard`：观测网页，包括信号库浏览、统计、隐私约束

### Modified Capabilities
（无。本项目是全新项目，`openspec/specs/` 目前为空。）

## Impact

- **新增代码**：
  - `contracts/`：Solidity + Foundry，基于 Semaphore v4
  - `skill/`：SKILL.md 以及 TypeScript 编写的 `shield` CLI
  - `relayer/`：匿名中继服务
  - `web/`：观测网页
  - `intel/`：情报同步脚本
- **外部依赖**：
  - Agent ID 合约 `0x60b9…022f`（只读调用 `balanceOf` / `ownerOfHandle`）
  - Agentic Wallet `baw` CLI，执行 `contract-call` 需要用户开启开发者模式
  - Semaphore v4（MIT）
  - BSC 公共 RPC
  - GoPlus API
  - ScamSniffer（GPL-3.0）和 MetaMask 钓鱼库（运行时拉取，不在仓库内再分发）
  - ClawHub 公开 Skill（MIT）
- **链上部署**：在 BSC 主网部署信号库合约和 Semaphore 相关合约，并在 BscScan 上验证开源。不设可以动用资金的权限：合约里本来就没有资金。
- **合规**：所有设计都必须遵守黑客松的 6 条安全红线；对外措辞一律使用「社区信号」，不下「诈骗」的定性。
