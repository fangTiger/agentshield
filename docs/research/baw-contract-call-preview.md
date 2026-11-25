# baw contract-call preview 实测（2026-11-24，baw 1.12.0）

## 前置条件

- 用 `baw auth signin` 生成二维码和配对码，在 App 内确认，然后运行 `auth verify`。验证结果为 SUCCESS，`wallet status` 显示 CONNECTED。
- 在 App 内开启开发者模式后，`wallet settings --json` 返回如下：

```json
{ "enabled": true, "expiresAt": "2026-12-01T21:11:09+08:00", "dailyLimit": 1000, "balanceExceeded": false }
```

注意：`expiresAt` 是 **ISO 8601 字符串**，不是时间戳；有效期为 7 天。

## 预览样例

对 Agent ID 合约的 `balanceOf(self)` 只做预览，不执行。

```bash
baw contract-call preview --binanceChainId 56 --from 0xe494…2e99 \
  --to 0x60b9262456de011f7d15a54cdd8c48baaa8b022f --value 0 --inputData 0x70a08231… --json
```

返回字段（完整输出见 `log/baw_preview_sample_20261124.json`）：

| 字段 | 实测值 / 说明 |
| --- | --- |
| `requestId` | 32 位十六进制字符串，例如 `60eb4b94…` |
| `parsedTx` | `{ transactionType: "ContractInteraction", action: "0x70a08231"（函数选择器）, contractAddress, contractAddressList: null }` |
| `simulationResult` | `{ simulationCode: "000000000"（表示成功）, simulationErrorDetail, gasTokenFromData, balanceChanges[], allowanceChanges[], authorityChanges[], preCheckCode }` |
| `risks` | `{ addresses: {}, riskDetails: [], riskBehaviors: [] }` |
| `requireConfirmation` | `false`（无风险的调用） |
| `expiresAt` | 毫秒时间戳，大约是预览后 5 分钟 |
| `gasLimit` | `null`：后端没有直接给出 gas，Skill 需要回退到自行估算 |

## 对 Skill 的影响

- 解析 `requestId`、`parsedTx`、`risks` 和 `simulationResult.authorityChanges` 的方式与实测一致。
- `gasLimit` 为 null，Skill 已经回退到 `estimateGas`。
- `requireDeveloperMode` 把 `expiresAt` 当成秒级数字来处理。实测返回的是 ISO 字符串，相乘得到 NaN，检查因此被跳过，结果碰巧没出错。需要改成按 ISO 字符串解析。
