## Context

项目动机见 proposal.md 的 Why 部分；三方讨论记录见 `docs/discussions/2026-11-24-agentshield/`。以下是对技术方案起决定作用的现状和约束，均为已核实信息，核实时间是 2026-11-22 至 2026-11-24。

- **Agent ID 合约**：`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`，部署在 BSC，不是代理合约。
  - 不可转让，转让会触发 `Soulbound()` 错误；`tokenId = keccak256(handle)`。
  - 提供 `balanceOf`、`ownerOfHandle(string)`，以及事件 `Registered(bytes32,address,string)`。
  - 没有反向解析，也没有 totalSupply。
- **持有者画像**：大多是新钱包，余额约 0.0001 BNB。gas 价格约 0.12 gwei，出块时间约 0.45 秒。
- **Agentic Wallet 的能力边界**：
  - 调用任意合约必须先在 App 内开启开发者模式，再执行 `baw contract-call preview/execute`。
  - 只支持 EIP-712 签名，不支持 personal_sign。
  - 转账对象只能是地址簿里的地址。
  - App 内的扫码和配对码确认流程，Skill 看不到。
- **公开 RPC**：`bsc-rpc.publicnode.com` 支持每次 5,000 个区块的 getLogs。本机 Python 的 urllib 有 SSL 证书问题；这不影响 Node 技术栈。
- **黑客松硬性要求**：合约在 BscScan 验证开源；安全红线 6 条；Agent 应用创新奖要求至少 30 个 Agent ID 地址与合约交互。
- **开发方式**：一个人加 AI 协作完成。

## Goals / Non-Goals

**Goals:**
- 持有者只需一次人工加入（一笔 `join` 交易）。之后的扫描、体检、匿名上报全部自动完成，不再动用钱包，也不消耗用户的 gas。
- 公开投票和匿名投票共用一套合约校验逻辑。同一个身份对同一个对象只能投一票，靠的是密码学保证，而不是靠运营。
- 所有对外结论都能追溯证据，并且明确告诉用户工具的能力边界。
- 合约不可升级、不托管资金，特权最小化，并且全部披露。

**Non-Goals:**
- 不拦截 App 内的扫码和确认流程，也不接管或读取 App 会话。
- 首版不做个人信誉和名字排行榜，不做浏览器插件，不做交易执行前的检查（GoPlus 和 baw preview 已经覆盖）。
- 不实现「通过转账触发 `receive()` 来加入」的路径：首版合约拒收资产。第 0 号任务中仍会做实测，仅作为后续评估的参考。
- 不支持 BSC 以外的链。

## Decisions

### D1. 总体架构：本地 Skill + BSC 合约 + 匿名中继 + 静态网页

```
用户的 Agent（Claude Code / OpenClaw 等）
  └─ AgentShield Skill（SKILL.md + shield CLI，Node/TypeScript）
       ├─ core 引擎：授权体检 / Skill 红线扫描 / 情报缓存（纯本地，可离线）
       ├─ 身份：~/.agentshield/identity（Semaphore 身份，仅存本机）
       ├─ join / 公开投票 ──▶ baw contract-call ──▶ AgentShieldRegistry（BSC）
       └─ 匿名投票 ──▶ Relayer（HTTP）──▶ AgentShieldRegistry（BSC）
                                         └─ Semaphore v4（成员树 + 验证器 + nullifier）
Web（静态站点）◀── 链上事件（RPC getLogs，可选的中继缓存 API）
```

- **为什么不做成传统 dApp**：红线第 1 条禁止网页扫码登录 Agentic Wallet。持有者唯一合规的链上入口，是 Agent 通过 `baw` 调用合约。
- **为什么用 Skill + CLI，而不是 MCP 服务**：Skill 是 Agentic Wallet 官方的分发形态（`npx skills add`）。CLI 可以在任意 Agent 框架中复用，也方便做确定性测试。

### D2. 链下全部使用 TypeScript，并采用 monorepo 结构
- **结构**：pnpm workspace，包括：
  - `contracts/`（Foundry）
  - `packages/core`（规则引擎，供 Skill、中继和种子脚本共用）
  - `skill/`（shield CLI + SKILL.md）
  - `relayer/`
  - `web/`
  - `intel/`（种子流水线）
- **理由**：Semaphore v4 的身份、证明和 LeanIMT 库都是 TypeScript 的一等公民。用同一种语言，可以让 Skill、中继、网页、种子流水线共享规则引擎和 ABI。
- **备选方案**：Python。不选，因为 ZK 证明生成和 Semaphore 库在 Python 生态中不成熟。代码注释和日志按项目规范使用中文。

### D3. 匿名层采用 Semaphore v4 官方合约
- 在 BSC 部署 Semaphore v4 的 `Semaphore`、`SemaphoreVerifier` 和 PoseidonT3。结论（0.5，2026-11-24）：**部署脚本自行部署**，不依赖外部的 Semaphore 地址。正式上线前，再核对一次官方部署列表中是否已经加入 BSC。
- `AgentShieldRegistry` 在构造函数中创建一个 group，自己担任该 group 的 admin。
- **作用域与消息**：
  - `scope = uint256(keccak256(abi.encode(chainid, address(this), targetType, targetId))) >> 8`，右移 8 位是为了落在 SNARK 域内。
  - `message = uint256(keccak256(abi.encode(voteType, evidenceHash))) >> 8`。
  - 合约会重新计算这两个值，并与证明中的值比对。
  - nullifier 的唯一性由 Registry 自己的 nullifier 映射保证（原因见 D5）：因为 nullifier = H(scope, secret)，所以「同一个身份对同一个对象只能投一票」天然成立，不管交易是谁发送的。
- **历史根**：使用 Semaphore v4 group 的 `merkleTreeDuration`，设为 1 小时，这样有新成员加入时，旧的证明在一段时间内仍然有效。
- **备选方案**：
  - 自己写 Noir 电路：验证约 200 万 gas，成本太高。
  - 链下计算 Merkle 根再提交上链：需要信任提交者，与「无特权」的目标冲突。

### D4. 身份由本地随机生成，不从签名派生
- 使用 `new Identity()` 随机生成身份，保存到 `~/.agentshield/identity.json`，文件权限为 0600。导出时用口令加密（scrypt + AES-256-GCM）。
- **备选方案**：用 EIP-712 签名派生身份。不选，原因有三：
  1. 需要开发者模式下的签名权限；
  2. MPC 签名是否确定性未知，同一条消息可能签出不同结果，身份就无法稳定复现；
  3. 签名一旦泄露，等于身份泄露。
- **丢失恢复**：只能通过加密备份恢复。**合约不提供身份更换接口**（2026-11-24 用户决策）。原因是更换身份会改变 nullifier，同一个人就能对同一个对象重复投票；而要让旧身份立即失效，只能让所有成员手上的证明一起失效，这又会形成 DoS 入口。

### D5. Registry 合约接口（不可升级、无 owner、拒收资产）
- `join(uint256 commitment)`：检查 `IAgentId.balanceOf(msg.sender) > 0`，并且该地址尚未加入；调用 `semaphore.addMember`；记录 `commitmentOf[msg.sender]`；触发 `Joined` 事件。
- `vote(TargetType t, bytes32 id, VoteType v, bytes32 evidenceHash, ISemaphore.SemaphoreProof proof)`：
  1. 校验 scope 和 message；
  2. 调用只读的 `semaphore.verifyProof`，nullifier 由 Registry 自己用 `mapping(uint256 => bool)` 记录并去重。**不使用 `validateProof`**：Semaphore v4 的 `validateProof` 没有调用方限制，任何人都能拿截获的证明抢先调用它，把 nullifier 标记为已使用，原投票就再也无法计入。
  3. 累计票数，首张「危险」票记录 `firstDangerAt`；
  4. 触发 `Voted(t, id, v, evidenceHash, nullifier)` 事件，事件里不含发送者字段。
- `appeal(TargetType t, bytes32 id, string evidenceURI)`：任何人都可以调用，只计数并触发事件。
- `seedBatch(SeedItem[] items)`：只有 `seeder` 可以调用，写入种子计数和来源 ID。`renounceSeeder()` 可以让 seeder 永久放弃权限。
- `statusOf(t, id)`：只读函数，按 spec 定义的状态机推导状态。N 和 T 在构造函数中写成 `immutable`，默认 N=3、T=24 小时，与黑客松期间的规模匹配。
- 合约不实现 `receive` 和 `fallback`，转入 BNB 会自动回滚。
- **备选方案**：使用 owner 加可暂停或可升级的结构。不选，因为它违背「特权最小」，评委的红线第 4 条要求披露这类权限，会削弱信任。

### D6. 匿名中继
- **技术栈**：Node + Hono，部署在一台小型 VPS 或 Fly.io 上，需要长驻进程来做 snarkjs 验证。
- **处理流程**：先用 `@semaphore-protocol/proof` 的 `verifyProof` 在链下校验证明；再检查 nullifier 是否已被链上使用；然后用 `eth_call` 模拟交易；最后才真正发送。
- **限流**：针对同一个 nullifier、全局 QPS、每日 gas 预算分别限流。
- **隐私**：关闭访问日志中的 IP 记录，代码开源。
- **热钱包**：只存放少量 BNB。主网实测（2026-11-25，gas 价格 0.05 gwei）：匿名投票 342,181 gas，1,000 票约 0.017 BNB；join 130,399 gas；seedBatch 50 条 1,329,546 gas。交易记录见 `docs/dev/mainnet-deployment.md`。
- **中继宕机时**：CLI 允许用户改用公开模式（自己付 gas 发送），或者稍后重试。

### D7. Skill 与 CLI 的交互模型
- **分发**：兼容 `npx skills add` 的目录结构，即 SKILL.md 加 scripts。CLI 通过 npm 发布，用 `npx` 调用，包名在实现阶段确认是否可用。
- **主要命令**：
  - `shield join`：加入
  - `shield check <url|text|image>`：授权体检
  - `shield scan <path|repo>`：Skill 红线扫描
  - `shield vote --public|--anon`：投票
  - `shield status`：查看状态
  - `shield intel sync`：同步情报
  - `shield login`：包装官方 `baw` 登录流程，并记录本机发起的登录
  - `shield config auto-report on|off`：开关自动上报
- **链上写操作**（join 和公开投票）的固定流程：CLI 调用 `baw contract-call preview` 拿到 requestId 和风险信息 → 输出结构化摘要 → SKILL.md 要求 Agent 在对话中向用户展示，并得到明确确认 → 再调用 `execute`。CLI 本身不提供「跳过确认」的参数。
- **自动触发**：主要靠 SKILL.md 中的行为指令。对 Claude Code 额外提供一个可选的 PreToolUse hook 安装器，匹配 `skills add`、`git clone` 这类安装 Skill 的命令。其他框架只依靠指令触发，并在文档中如实说明这一点。

### D8. 授权体检引擎（packages/core）
- **URL 解析**：使用 `tldts` 取得可注册域。
- **伪装识别**：对同形字，结合 punycode 解码和 Unicode confusables 映射；对品牌相似度，计算与 binance 等受保护词的编辑距离和包含关系。
- **短链**：最多跟随 5 次跳转，超时 3 秒，无法展开时标记为「未知」。
- **二维码解码**：用 `jsQR` 配合 `sharp` 读取像素。
- **话术规则**：中英文正则加关键词组合，规则以带版本号的 YAML 维护。
- **授权请求识别**：依据 `docs/research/auth-link-format.md` 中的实测结果（2026-11-24），以下三种链接都识别为 Agentic Wallet 登录授权请求：
  - `app.binance.com/uni-qr/*`：需要展开跳转确认最终落点，因为问卷等其他用途也共用 uni-qr；
  - `www.binance.com/bapi/fe/qrcode/share_link_page/uni-qr/*`；
  - `web3.binance.com/[语言/]agent-login*`。

  **登录链接本身就在官方域名上**：钓鱼者可以直接转发自己发起的真实登录链接。所以这类链接不能因为「是官方域名」就放行，必须结合本机登录记录来判断。其余形态不明的类授权内容，一律输出「未知」。

### D9. Skill 红线扫描与「LLM 只升不降」
- **内容哈希**：文件按路径排序，换行统一为 `\n`，对 `path\0content` 依次拼接后做 sha256，输出为 bytes32。
- **静态规则**：针对 R1 到 R6 的正则和启发式规则，扫描范围包括代码和注释，因为注入指令常常就藏在注释里。
- **等级判定**（2026-11-24 修订）：自然语言类命中一律判为「可疑」，因为文本规则无法可靠区分防御性说明和恶意指令。实测中，ClawHub 有 3 个、币安官方有 3 个误报，全部是「不要泄露私钥」这类说明。只有代码层面的确定性特征（最大额 approve、凭据经网络外发）才判为「高风险」。可疑结论需要经过 LLM 审查，才能升为高风险。
- **LLM 审查不需要 API Key**：CLI 输出一个审查包，内容是固定的审查准则，加上用分隔符包裹、并标注为「数据」的 Skill 内容。宿主 Agent 按准则给出结构化结论，再通过 `shield scan --merge-llm <json>` 合并回来。合并逻辑在代码中强制执行：等级取两者中的最大值，静态命中不可撤销。所以即使宿主 Agent 被注入，也只能让结论更严格，不能放宽。
- **备选方案**：CLI 直接调用某家模型的 API。不选，因为这要求用户额外提供 API Key，会增加门槛。

### D10. 威胁情报与种子流水线
- **运行时拉取**（不在仓库中再分发，以满足 GPL 等许可证）：
  - ScamSniffer 的 `blacklist/domains.json`（约 9 MB）和 `address.json`，GPL-3.0；
  - MetaMask eth-phishing-detect 的 `src/config.json`，许可证已核实为 DBAD Public License v1.2（宽松许可证）；
  - 下载后缓存到 `~/.agentshield/intel/`，按 7 天判断是否过期。
- **在线查询**：GoPlus 的 `phishing_site` 和 `address_security`（chain_id=56），带超时，失败时降级为不使用。
- **种子上链**（由我们执行，seeder 签名）：
  1. 只把与币安、Agentic Wallet、Agent ID 相关的仿冒域名写上链，筛选条件是品牌相似度，以控制数据量并保证相关性。完整名单只在链下使用。
  2. 对 ClawHub 公开 Skill（MIT）和 binance-skills-hub 做批量扫描。高风险结果先进入待复核队列，**只有人工复核确认为恶意的才写上链**，复核记录保存在 `intel/reviewed-skills.json`。binance-skills-hub 同时作为良性基线，用于测量误报率。
  3. 从公开安全报告中整理恶意 Skill 相关的 IOC（例如 ClawHavoc 事件中的域名和地址），作为 DOMAIN 或 ADDRESS 类型的种子。
- **评测集**：
  - deepset/prompt-injections（Apache-2.0）
  - Lakera/gandalf_ignore_instructions（MIT）
  - jackhhao/jailbreak-classification（Apache-2.0）
  - 自建的 Agentic Wallet 场景样本：钓鱼话术和恶意 Skill

### D11. 网页
- **技术栈**：Next.js 静态导出，加上 viem 读取链上数据，部署在 Cloudflare Pages 或 Vercel。
- **数据来源**：优先读取中继提供的 `/api/stats` 缓存（中继聚合链上事件）；中继不可用时，回退到直接用 RPC 分块拉取 getLogs。
- **隐私**：不读取、也不展示 Agent ID 的 `Registered` 事件，不在任何地方做名字与地址的关联。
- **加入指南**：Agentic Wallet 无法在币安 App 的 DApp 浏览器中使用，因此移除网页一键加入。持有者在自己的 Agent 中安装 AgentShield Skill，通过 CLI 完成登记。

### D12. 测试策略
- **合约**：Foundry 单元测试，加上 BSC 主网 fork 测试，后者使用真实的 Agent ID 合约和真实的持有者地址。
- **引擎**：vitest 测试，配合样本库。恶意 Skill 样本由我们自己编写，每条红线至少 3 个；良性样本取自 binance-skills-hub。
- **端到端**：fork 环境下，完整跑通 join、匿名投票、公开投票，以及重复投票被回滚这几条路径。
- **评测脚本**：输出检出率和误报率报告。

## Risks / Trade-offs

- **[参与人数达不到 30 个地址]**
  - 加入只需一笔交易，门槛已经压到最低。
  - 重点向其他参赛者推广：提供「通过红线扫描」的说明，供他们证明自己的 Skill 合规。
  - 同时在 X 和币安广场做安全科普传播。
  - **严禁**批量注册账号或代人操作。
- **[开发者模式门槛]** 加入时必须开启开发者模式。缓解办法：如实说明用途，建议把开发者模式额度设到最低。加入之后，日常使用完全不依赖开发者模式。
- **[中继能关联 IP 和时间]** 中继不记录 IP，代码开源。文档中如实说明匿名性的边界：交易时间和网络层面的元数据仍可能被用于关联。
- **[Agent 多数用的是同一家模型，导致结论相似，社区信号失去独立性]** 状态机只把票数当作「信号」，不当作「事实」。展示时同时给出证据，让用户自己判断。
- **[假举报、恶意抹黑]**
  - 信号只能标记「危险」；
  - 设冷静期；
  - 「社区确认」要求危险票数不少于误报票数的 2 倍；
  - 提供申诉通道；
  - 统一使用「社区信号」措辞，不定性。
- **[被扫描的内容对宿主 Agent 做提示词注入]** 合并逻辑在代码中强制执行「只升不降」。SKILL.md 规定被扫描的内容只是数据。另外，注入文本本身也会作为风险证据报告出来。
- **[Agent ID 被销毁或回收，但成员身份仍留在树里]** 影响有限。暂不处理，记录在 Open Questions 中。
- **[第三方数据源许可证或可用性变化]** 运行时拉取，带来源标注和降级策略。任何单一数据源失效都不影响主流程。
- **[gas 估算不准]** 第 0 号任务在主网实测，结果写回本文档和网页的披露页。

## Migration Plan

全新项目，没有需要迁移的内容。部署顺序如下：

1. 部署前置合约：Semaphore 相关合约（或复用已有部署），然后部署 Registry，构造参数为 Agent ID 地址、N、T、seeder。
2. 在 BscScan 验证所有合约。
3. 执行种子流水线，写入第一批种子。
4. 部署中继。
5. 发布 CLI 和 Skill。
6. 上线网页。

**回滚**：合约不可升级。如果出现严重问题，就部署一个新的 Registry，把 Skill 配置指向新地址，旧数据只读保留。网页同时标注新旧版本。

## Open Questions

- Agent ID 被销毁或回收后，是否需要提供「移除成员」的路径？等观察到官方是否存在回收机制之后再决定。
- 赛方统计「交互地址」时，是否把中继发送的匿名票（发送方不是持有者）排除在外？这不影响本设计，因为指标统计依赖的是 `join` 交易和公开投票。确认结果只影响对外的宣传口径。
