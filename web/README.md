# AgentShield 观测网页

在仓库根目录用 `pnpm install --frozen-lockfile` 安装工作区依赖。在 `web/` 运行：

```sh
pnpm build
pnpm test
pnpm test:export
pnpm lint
pnpm typecheck
```

`pnpm build` 将页面导出到 `out/`。静态托管应为以 `/` 结尾的路径提供目录下的 `index.html`。可运行 `python3 -m http.server --directory out` 本地预览。

## 部署配置

在 Vercel 创建独立网页项目，把 Root Directory 设为 `web`，框架选 Next.js，Node.js 版本选 22.x。启用对根目录工作区配置与锁文件的访问，保留默认构建命令。`next.config.mjs` 已设置 `output: "export"` 和 `trailingSlash: true`，Vercel 使用 Next.js 集成处理静态产物。[Next.js 静态导出文档](https://nextjs.org/docs/app/guides/static-exports)

将公开配置写入 `web/.env.local`，或在 Vercel 项目的对应环境中设置。改动配置后重新构建。

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | 测试网填 `97`，主网填 `56`（默认）。决定客户端链配置与 BscScan 链接。 |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | BSC 上的 AgentShieldRegistry 地址。 |
| `NEXT_PUBLIC_DEPLOYMENT_BLOCK` | 信号库的部署区块，用十进制填写。地址或区块缺失时，页面显示「尚未部署」。 |
| `NEXT_PUBLIC_RPC_URL` | 浏览器可访问的 BSC RPC，须支持跨域请求。用于信号状态、投票明细、披露参数和回退统计。 |
| `NEXT_PUBLIC_RELAYER_URL` | 中继服务根地址，可选。网页优先读取其 `/api/stats`。 |
| `NEXT_PUBLIC_POSEIDON_T3_ADDRESS` | 可选。披露页展示 Semaphore 部署时链接的 PoseidonT3 库地址。 |
| `NEXT_PUBLIC_AGENT_ID_ADDRESS` | 披露页展示的外部合约地址。测试网填部署清单中的 Mock 地址。主网默认使用真实 Agent ID 合约。 |

## 数据口径

已登记真人数来自信号库的加入事件。首页每分钟刷新一次，状态取自合约的 `signalsOf`。中继不可用时浏览器从部署区块起以每段最多 5,000 块读取信号库事件。投票的 24 小时窗口按区块时间计算。

域名和地址在事件中只存对象哈希。信号库展示收到的哈希，详情链接用对象类型和哈希定位。投票与申诉记录的交易链接指向 BscScan。
