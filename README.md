# AgentShield

AgentShield 是为 Binance Agentic Wallet 用户设计的独立开源 Skill，用于检查授权风险、扫描第三方 Skill，并共享可复核的链上社区风险信号。

## 三项能力

- **授权体检**检查链接、二维码截图和文本，提示仿冒域名和可疑授权话术。
- **Skill 红线扫描**在安装第三方 Skill 前检查 R1–R6，展示本地规则证据和社区信号。
- **社区风险信号**支持查询链上风险记录，已登记成员可以通过零知识证明匿名投票。

## 安装与加入

AgentShield CLI 需要 Node.js 20 或更高版本。

1. 在币安 App 的 Agentic Wallet 中领取 Agent ID。
2. 在自己的 Agent（如 Claude Code）中安装官方 Agentic Wallet Skill，并按官方指引完成 baw 登录。[币安官方 Skill 仓库](https://github.com/binance/binance-skills-hub)
3. 在币安 App 的 Agentic Wallet 设置中开启开发者模式。
4. 安装 AgentShield Skill。

   ```sh
   npx skills add fangTiger/agentshield
   ```

   如果安装器列出多个 Skill，选择 `agentshield`。也可在命令后加上 `--skill agentshield` 直接选择。

5. 对 Agent 说「加入 AgentShield」，核对合约、调用参数和预估 Gas 后确认。加入只登记匿名身份承诺，合约调用金额为零，不涉及资产授权。AgentShield 不收集助记词、私钥或配对码，也不提供网页扫码登录。
6. 建议让 Agent 引导你在终端使用 `identity export` 创建加密备份，并妥善保管备份和口令。

CLI 默认使用 BSC 主网，部署信息已内置，无需手写配置。设置 `AGENTSHIELD_NETWORK=testnet` 可切换到内置测试网配置。测试网使用 Mock Agent ID 合约，登记资格以该合约为准。[Skill 使用说明](skill/SKILL.md)

## 合约地址

网站：https://agentshield-bsc.vercel.app（主网） · 匿名中继：https://agentshield-relayer.vercel.app

所有合约都已在 BscScan 验证源码。部署清单：[主网](contracts/deployments/56.json) · [测试网](contracts/deployments/97.json)

| 合约 | BSC 主网（56） | BSC 测试网（97） |
| --- | --- | --- |
| AgentShieldRegistry | [`0xb7e67aaf211cc4c0b05a427ad4b1f802355ce56f`](https://bscscan.com/address/0xb7e67aaf211cc4c0b05a427ad4b1f802355ce56f#code) | `0xac18215c87c6d4d0f1c1ed090ee54d9a8ee6e5da` |
| Agent ID | `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`（官方合约） | `0x5ADAFA85b2fc09c1769F5bcc9F216D5104CCB688`（Mock） |
| Semaphore | [`0x5fA3459467a490b8Ed7e6659ab802a197FEfFfF3`](https://bscscan.com/address/0x5fA3459467a490b8Ed7e6659ab802a197FEfFfF3#code) | `0xb7e67Aaf211cC4c0B05a427aD4B1F802355CE56F` |
| SemaphoreVerifier | [`0x5adafa85b2fc09c1769f5bcc9f216d5104ccb688`](https://bscscan.com/address/0x5adafa85b2fc09c1769f5bcc9f216d5104ccb688#code) | `0x5fa3459467a490b8ed7e6659ab802a197feffff3` |
| PoseidonT3 | [`0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9`](https://bscscan.com/address/0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9#code) | `0x12ff2aeaac947cF1dD2ED29bF83b85dfBF3c8ca9` |

部署区块：主网 `135603954`，测试网 `144594402`。主网参数 N=3、T=86400 秒；唯一特权角色 seeder 为 `0x45f5F8d2BBb9cF1BC02c68829BEACa0f38382C45`，只能写入种子计数，可永久放弃权限。合约没有 owner，不接收资产。

## 目录结构

| 目录 | 用途 |
| --- | --- |
| `skill/` | Agent Skill、CLI 源码及独立发布包 |
| `packages/core/` | 授权体检、红线扫描、链上读写与证明 |
| `contracts/` | Solidity 合约、部署清单与 Foundry 测试 |
| `relayer/` | 匿名投票中继 |
| `intel/` | 威胁情报与种子流水线 |
| `web/` | 风险信号观测台及安装指南 |
| `openspec/` | 规范、设计与验收任务 |

## 本地开发

开发工作区使用 Node.js 22、pnpm 9.15 和 Foundry。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm test
pnpm --filter @agentshield/web test:export
node skill/bin/shield.mjs status
```

`pnpm build` 会重新生成 `skill/bin/` 下的发布包。网页静态文件位于 `web/out/`。

## 许可证

项目自有源码采用 MIT 许可证。独立 CLI 含有以 GPL-3.0 分发的 snarkjs 等依赖，组合发行文件适用 GPL-3.0。对应源码与构建脚本位于本仓库，依赖的版本与源码位置见许可清单。[MIT 许可证](LICENSE) · [打包依赖及版权声明](skill/bin/THIRD_PARTY_NOTICES.txt)
