# AgentShield Core 威胁情报

从仓库根目录运行以下命令。同步的目录参数省略时使用 `~/.agentshield/intel/`。可以定期调用同一个同步命令，服务端支持 ETag 时复用未变更的数据。缓存文件请放在仓库和发布目录之外。

```sh
pnpm --filter @agentshield/core build
pnpm --filter @agentshield/core intel:sync /tmp/agentshield-intel
pnpm --filter @agentshield/core intel:eval
```

`loadIntelCache(cacheDir)` 返回本地域名和地址查询函数，支持 `{ domain }` 和 `{ address }` 两种输入。每条命中带来源和获取时间，相关缓存超过七天时返回「情报可能过期」。MetaMask 域名白名单仅影响 MetaMask 的匹配结果，其 URL 路径条目不参与域名查询。

`checkAuth(input, { recentLocalLogins: [], intel: { cacheDir } })` 在授权体检中启用本地情报。在 `intel` 内加上 `goPlus: {}` 可显式开启 GoPlus。体检会向 GoPlus 提交网站来源地址及链接之外的 EVM 地址。网站来源地址仅包括协议、主机名和端口。独立调用 `queryGoPlus({ site: url })` 时会提交指定的完整 URL，也可用 `queryGoPlus({ address })` 查询 BSC 地址。

## 数据来源与许可证

| 来源 | 许可证或使用条款 | 用途 |
| --- | --- | --- |
| [ScamSniffer 域名和地址名单](https://github.com/scamsniffer/scam-database/tree/main/blacklist) | [GPL-3.0](https://github.com/scamsniffer/scam-database/blob/main/LICENSE) | 运行时从上游下载 |
| [MetaMask eth-phishing-detect 配置](https://github.com/MetaMask/eth-phishing-detect/blob/main/src/config.json) | [DON'T BE A DICK PUBLIC LICENSE v1.2](https://github.com/MetaMask/eth-phishing-detect/blob/main/LICENSE) | 运行时从上游下载 |
| [GoPlus Security API](https://docs.gopluslabs.io/reference/phishingsiteusingget) | 上游在线服务 | 按需查询网站和 BSC 地址 |
| [币安官方来源](src/intel/official-hosts.ts) | 每个域名附上游依据链接 | 人工维护严格匹配白名单 |

评测在内存中读取 Hugging Face 测试样本，输出 `docs/eval/YYYY-MM-DD-report.md`。报告记录数据集版本、许可证、样本数和两类规则的指标。
