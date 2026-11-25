# Agentic Wallet 授权链接格式（实测）

> 实测时间：2026-11-24 ｜ baw CLI 1.12.0 ｜ 官方 Skill binance-agentic-wallet 1.15.0
> 本次发起的登录请求**未确认**，5 分钟后自动过期。所有标识符都已脱敏，只记录结构。

## `baw auth signin --json` 返回的字段
| 字段 | 格式 |
|---|---|
| `urlForWeb` | `https://app.binance.com/uni-qr/<8 位短码>` |
| `qrCodeId` | 36 位 UUID |
| `pairingCode` | 6 位数字 |
| `expireAt` | 13 位毫秒时间戳，有效期约 5 分钟 |

注意：官方文档示例中写的是 `https://web3.binance.com/en/agent-login?expireAt=…&url=…`，**和实测的格式不一样**。规则必须同时覆盖这两种形式。

## 跳转链（用移动端 UA 请求，共 2 次跳转）
```
https://app.binance.com/uni-qr/<短码>
  → https://www.binance.com/bapi/fe/qrcode/share_link_page/uni-qr/<短码>
  → https://web3.binance.com/agent-login?_ul=<52 字符>&expireAt=<13 位>
```

## 对授权体检的影响（关键结论）
1. **登录链接本身就在官方域名上**。钓鱼者在自己的机器上执行 `baw auth signin`，然后把这个**货真价实的官方链接或二维码**发给受害者，域名检查会全部通过。所以「是不是官方域名」这一项判断不出这种钓鱼。
2. 因此授权体检对以下几种链接，必须判定为「Agentic Wallet 登录授权请求」：
   - `app.binance.com/uni-qr/*`（需要展开跳转，看最终是否指向 agent-login；`uni-qr` 也被问卷等其他用途共用）
   - `www.binance.com/bapi/fe/qrcode/share_link_page/uni-qr/*`
   - `web3.binance.com/[语言/]agent-login*`

   然后结合本机登录记录给出结论：
   - 本机近期没有发起过登录 → 高风险：「这是别人发起的登录请求，确认等于把钱包交给对方的 Agent」
   - 本机近期发起过登录 → 提示：「请确认 App 上显示的配对码，与你本机 Agent 显示的配对码一致」
3. 出现在非官方页面上、并且指向上述地址的二维码，是典型的「钓鱼页嵌入官方授权码」，判定为高风险。
4. `expireAt` 可以用来判断链接是否已经过期：已过期的链接没有危险，但说明有人在批量投放。

## 其他发现
- `baw wallet agent-id --json` 可以查询当前钱包是否已领取 Agent ID，并返回 handle。
- `baw wallet resolve-domain --name alice.ai --binanceChainId 56` 支持把 `.ai` 名字解析为地址。
