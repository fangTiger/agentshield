# 参赛提交材料（Agent ID 黑客松）

截止时间：2026-12-09 16:00（UTC+8）。赛方要求提交项目名称、官网、合约地址、Agent ID 使用说明。目标奖项：应用创新奖（门槛：活动期内至少 30 个 Agent ID 地址与合约交互）。

## 项目名称

AgentShield

## 一句话介绍

给 Agentic Wallet 用户的防骗 Skill：扫码、装 Skill 前，让 Agent 先查一遍；持有 Agent ID 的真人匿名共建链上风险信号库。

## 官网与代码

- 官网：https://agentshield-bsc.vercel.app
- GitHub（开源）：https://github.com/fangTiger/agentshield
- 一句话安装：`npx skills add fangTiger/agentshield`

## 合约地址（BSC 主网，BscScan 已验证源码）

- AgentShieldRegistry（主合约）：`0xb7e67aaf211cc4c0b05a427ad4b1f802355ce56f`
  https://bscscan.com/address/0xb7e67aaf211cc4c0b05a427ad4b1f802355ce56f#code
- Semaphore：`0x5fA3459467a490b8Ed7e6659ab802a197FEfFfF3`
- SemaphoreVerifier：`0x5adafa85b2fc09c1769f5bcc9f216d5104ccb688`
- PoseidonT3：`0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9`
- 使用的 Agent ID 合约：`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`

## Agent ID 使用说明

AgentShield 把 Agent ID 当作「真人凭证」，用来搭建一个抗女巫、匿名、由 Agent 自动运转的风险信号网络。

1. **准入**：`join(commitment)` 在链上检查 `AgentID.balanceOf(msg.sender) > 0`，非持有者回滚 `NotAgentIdHolder`。只有 Agent ID 持有者能进入投票成员树。
2. **抗女巫**：Agent ID 不可转让，每人只能领一个；每个地址只能登记一次身份，登记后无法更换。「社区确认」要求至少 N=3 位不同的真人投危险票、危险票不少于误报票的两倍，且首票已满 T=24 小时冷静期，批量小号刷不出结论。
3. **匿名投票**：登记的是 Semaphore 身份承诺。投票时，Agent 在本机生成零知识证明，证明「我是某个 Agent ID 持有者」而不暴露是哪一个；合约用 nullifier 阻止同一身份对同一对象重复投票。匿名票由中继代付 gas 提交，链上看不到投票者地址。
4. **Agent 完成链上操作**：加入通过官方 Agentic Wallet 的 `baw contract-call preview` 生成预览，用户在对话中确认后再 `execute`，调用金额为零，不涉及授权。
5. **加入后自动运转**：持有者的 Agent 在授权体检或 Skill 扫描中，根据本机独立证据得出高风险结论时，会自动匿名上报（默认开启，可关闭）。只因社区信号得出的高风险不会再次上报，防止自我强化。所有用户的 Agent 查询同一份链上信号，一人发现、全网提醒。

主网首个真实加入：captainbtc.ai，交易 https://bscscan.com/tx/0x766a83f8a1e8422127387b3c005b2f85e1d9321168f887b04e99ff6a99a97089
主网首张匿名票（经中继，发送方为中继地址）：https://bscscan.com/tx/0x4a316a9b56b88dc029d9342faf956ac0abc5bf5af74b4411c4d630401513f1e0

## 合规自查（对照赛事红线）

- 不做网页扫码登录 Agentic Wallet；不绕过用户确认，每次链上调用都有完整预览和确认。
- 不转移资产、不请求授权，合约拒收资产，调用金额为零。
- 权限披露：合约没有 owner、不可升级；唯一特权角色 seeder 只能写入种子计数，可永久放弃。披露页：https://agentshield-bsc.vercel.app/disclosure/
- 不冒用币安品牌，网站和 README 均注明「独立社区项目」。
- 不收集私钥、助记词或配对码。

## 演示视频

待录制（主网 4 幕：授权体检、恶意 Skill 扫描并上报、第二个 Agent 秒拒、匿名投票与重复投票回滚）。链接：＿＿＿＿

## 提交前检查

- [ ] 网站首页「已登记真人数」≥ 30（创新奖门槛）
- [ ] 演示视频链接已填写
- [ ] README、官网、合约地址三处一致
- [ ] 提交回执截图存档
