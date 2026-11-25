# AgentShield 种子流水线

从工作区根目录运行。使用 Node.js 22+、Git与 unzip。先安装工作区依赖并构建 core，再构建和测试流水线。

```bash
pnpm --filter @agentshield/core build
pnpm --filter @agentshield/intel build
pnpm --filter @agentshield/intel typecheck
pnpm --filter @agentshield/intel test
```

构建可在工作区并行转译。类型检查和运行使用已构建的 core。

| 命令（加在 `pnpm --filter @agentshield/intel pipeline` 后） | 用途 |
| --- | --- |
| `clawhub` | 按创建时间分页取最新 500 个公开条目，按发布者和版本下载，使用 core 离线扫描。支持 `--limit 1000` 和 `--delay-ms 500`。默认四个并发任务，HTTP 请求启动间隔 300 毫秒。 |
| `baseline` | 浅克隆 Binance Skills Hub，扫描缓存提交中每个 `SKILL.md` 所在目录。报告记录提交号，换用新快照时清理本地基线缓存再运行。 |
| `sync` | 调用 core 同步公开情报到 `intel/.cache/intel/`。 |
| `domains` | 读取上述缓存的黑名单并筛选候选域名。已有 core 缓存可指定 `--cache-dir "$HOME/.agentshield/intel"`。 |
| `seeds` | 合并人工复核确认为恶意的 Skill、仿冒域名和 `iocs.json`，按目标类型、ID、来源 ID 去重。 |
| `submit` | 读取种子并打印各批条数和离线预估 gas。可用 `--batch-size` 调整默认的 50 条。 |

ClawHub 的公开目录用 `nextCursor` 翻页，下载端点返回托管 ZIP 或带固定提交和 Skill 路径的 GitHub 归档描述。下载与扫描在本地完成。目录数、已扫描数和失败数分别计入报告。遇到 HTTP 429 时当前扫描停止，并记录上游给出的等待时间。再次运行会复用已下载的同版本文件。

`out/` 包含 `clawhub-scan.json`、`review-queue.json`、`binance-baseline.json`、`lookalike-domains.json` 和 `seeds.json`。扫描报告记录命中规则及文件和行号。`review-queue.json` 列出 ClawHub 高风险结果中尚未按 slug 和内容哈希复核的版本。域名报告使用 core 的品牌相似度与币安、agentic、agent-id 关键字筛选，只使用黑名单中的域名条目。常见词 `finance` 不单独构成仿冒证据。一个域名可保留多个名单来源。下载文件、情报缓存和生成结果由本目录的 Git 忽略规则管理。

## IOC 与提交

`iocs.json` 按 `type`、`value`、`sourceName`、`sourceUrl` 人工维护。类型和取值如下。

| 类型 | 取值 |
| --- | --- |
| `DOMAIN` | 报告明确列出的域名，恢复其中的 `[.]` |
| `ADDRESS` | 带链 ID 的 EVM 地址，格式为 `链 ID:0x 地址` |

`reviewed-skills.json` 保存人工复核记录，包含 `slug`、被复核版本的 `contentHash`、`verdict`（`malicious` 或 `false-positive`）、`reason` 和 `reviewedAt`。ClawHub 记录使用 `发布者/Skill 名称` 作为 `slug`，公开报告可用 `sourceUrl` 记录报告出处。可以按待复核清单中的命中位置查看原文，复核后将结论写入该文件。只有 `malicious` 记录生成 `SKILL` 种子，来源名为「AgentShield 主动扫描（人工复核）」，完整的复核记录随种子保存在本地 `seeds.json` 中。

`sourceId` 对来源名的 UTF-8 字节计算 keccak256。提交脚本使用 core 的 Registry ABI，每批发送前模拟 `seedBatch` 并等待交易确认后处理下一批。只有同时设置 `SEEDER_PRIVATE_KEY`、`REGISTRY_ADDRESS`、`RPC` 并显式运行 `submit --broadcast` 才会发送。dry-run 全程离线，按交易基础费、实际 ABI calldata 和每条种子的首次存储与事件成本估算 gas。

## 验收边界

Skill 种子使用 core 对下载归档或固定提交源码目录算出的内容哈希。core 在扫描和哈希中排除 `.clawhub/`、`.git/`、`node_modules/`，以统一安装目录和下载归档的内容口径。

Registry 的 `Seeded` 事件记录目标和来源 ID。网页可用来源名 `Palo Alto Networks Unit 42` 映射报告来源。种子标签与出处链接保存在本地清单中。

## 数据来源和许可证

| 来源 | 许可证与使用方式 |
| --- | --- |
| [ClawHub API 文档](https://github.com/openclaw/clawhub/blob/main/docs/http-api.md) | [注册表代码 MIT](https://github.com/openclaw/clawhub/blob/main/LICENSE)，[托管 Skill MIT-0](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md)。GitHub 源码归档按各原仓库声明处理。 |
| [Binance Skills Hub](https://github.com/binance/binance-skills-hub) | 基线快照无仓库级 LICENSE，部分 Skill 单独声明 MIT。运行时拉取，源码只作本地扫描。 |
| [ScamSniffer 黑名单](https://github.com/scamsniffer/scam-database/tree/main/blacklist) | [GPL-3.0](https://github.com/scamsniffer/scam-database/blob/main/LICENSE)，运行时拉取，上游名单及生成结果仅留在本地。 |
| [MetaMask eth-phishing-detect 黑名单](https://github.com/MetaMask/eth-phishing-detect/blob/main/src/config.json) | [DBAD 1.2](https://github.com/MetaMask/eth-phishing-detect/blob/main/LICENSE)，运行时拉取。 |
| [Palo Alto Networks Unit 42 报告](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/#indicators-of-compromise) | 公开可读的原始安全报告。人工录入少量域名指标并保留出处。 |
