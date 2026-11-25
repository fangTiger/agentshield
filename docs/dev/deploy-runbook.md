# AgentShield 部署手册

先在 BSC 测试网（97）完成验收，再用主网（56）的参数从第一步重新执行。两条链各自保留部署清单和 Vercel 项目。以下命令从仓库根目录执行，除非步骤另行注明。

## 1. 选择网络并注资

准备 Node.js 22、pnpm 9、Foundry、jq 和 Vercel CLI。加载仓库根目录的 `.env`。

~~~bash
pnpm install --frozen-lockfile
git check-ignore .env
set -a
. ./.env
set +a
~~~

测试网参数如下。给 `DEPLOYER_ADDRESS`、`SEEDER_ADDRESS` 和 `RELAYER_ADDRESS` 领取 tBNB。[BNB Chain 测试网水龙头](https://www.bnbchain.org/en/testnet-faucet)

~~~bash
export RPC_URL="$BSC_TESTNET_RPC" CHAIN_ID=97
export EXPLORER=https://testnet.bscscan.com
unset AGENT_ID_ADDRESS
export N=3 T=600
~~~

主网参数如下。从有资金的账户通过 BSC 转出 BNB，分别转给部署、种子和中继地址。部署账户支付合约部署费，种子账户支付写入费，中继账户持有用于代付的少量 BNB。

~~~bash
export RPC_URL="$BSC_MAINNET_RPC" CHAIN_ID=56
export EXPLORER=https://bscscan.com
export AGENT_ID_ADDRESS=0x60b9262456de011f7d15a54cdd8c48baaa8b022f
export N=3 T=86400
~~~

在主网从已有资金的钱包转账时，逐笔设置收款地址 `TO_ADDRESS` 和金额 `FUNDING_AMOUNT`（如带 `ether` 单位的 BNB 值），由资金账户交互签名。

~~~bash
cast send "$TO_ADDRESS" --value "$FUNDING_AMOUNT" --rpc-url "$RPC_URL" --interactive
~~~

验证 RPC 链 ID 和三个账户的余额。主网还要确认真实 Agent ID 地址有字节码。私钥留在本地 `.env`；中继项目仅在后续步骤接收中继私钥。

~~~bash
test "$(cast chain-id --rpc-url "$RPC_URL")" = "$CHAIN_ID"
for address in "$DEPLOYER_ADDRESS" "$SEEDER_ADDRESS" "$RELAYER_ADDRESS"; do
  cast balance "$address" --ether --rpc-url "$RPC_URL"
done
if [ "$CHAIN_ID" = 56 ]; then
  test "$(cast code "$AGENT_ID_ADDRESS" --rpc-url "$RPC_URL")" != "0x"
fi
~~~

## 2. 部署合约

~~~bash
node contracts/script/deploy.mjs
MANIFEST="contracts/deployments/$CHAIN_ID.json"
export REGISTRY_ADDRESS="$(jq -er .registry "$MANIFEST")"
export DEPLOYMENT_BLOCK="$(jq -er .deploymentBlock "$MANIFEST")"
AGENT_ID="$(jq -er .agentId "$MANIFEST")"
SEMAPHORE="$(jq -er .semaphore "$MANIFEST")"
VERIFIER="$(jq -er .semaphoreVerifier "$MANIFEST")"
POSEIDON_T3="$(jq -er .poseidonT3 "$MANIFEST")"
~~~

验证各地址有字节码、Registry 部署交易成功，回执区块与清单一致。核对 N、T、种子账户，以及测试网与主网的 Agent ID 类型。

~~~bash
(
  set -e
  for address in "$AGENT_ID" "$REGISTRY_ADDRESS" "$SEMAPHORE" "$VERIFIER" "$POSEIDON_T3"; do
    test "$(cast code "$address" --rpc-url "$RPC_URL")" != "0x"
  done
)
cast receipt "$(jq -er .deploymentTxHash "$MANIFEST")" --rpc-url "$RPC_URL"
cast call "$REGISTRY_ADDRESS" 'N()(uint256)' --rpc-url "$RPC_URL"
cast call "$REGISTRY_ADDRESS" 'T()(uint256)' --rpc-url "$RPC_URL"
cast call "$REGISTRY_ADDRESS" 'seeder()(address)' --rpc-url "$RPC_URL"
jq '{chainId, deploymentBlock, mockAgentId}' "$MANIFEST"
~~~

测试网演示账户可调用 `claim()` 领取一次 Mock Agent ID。用该账户签名，再查询持有量，预期结果为 `1`。

~~~bash
cast send "$AGENT_ID" 'claim()' --rpc-url "$RPC_URL" --interactive
cast call "$AGENT_ID" 'balanceOf(address)(uint256)' "$DEMO_ADDRESS" --rpc-url "$RPC_URL"
~~~

## 3. 在 BscScan 验证源码

由用户提供 Etherscan V2 API Key，将其作为环境变量 `ETHERSCAN_API_KEY` 导入本地终端。Forge 从环境中读取该变量。使用与部署相同的提交、锁文件和 Foundry 配置。[Etherscan 的 Foundry 验证文档](https://docs.etherscan.io/contract-verification/verify-with-foundry)

~~~bash
(
  set -e
  cd contracts || exit 1
  : "${ETHERSCAN_API_KEY:?请先设置 Etherscan V2 API Key}"
  verify_contract() {
    forge verify-contract --chain "$CHAIN_ID" --verifier etherscan --watch "$@"
  }

  verify_contract "$POSEIDON_T3" ../node_modules/poseidon-solidity/PoseidonT3.sol:PoseidonT3
  verify_contract "$VERIFIER" ../node_modules/@semaphore-protocol/contracts/base/SemaphoreVerifier.sol:SemaphoreVerifier
  verify_contract "$SEMAPHORE" ../node_modules/@semaphore-protocol/contracts/Semaphore.sol:Semaphore \
    --libraries "poseidon-solidity/PoseidonT3.sol:PoseidonT3:$POSEIDON_T3" \
    --constructor-args "$(cast abi-encode 'constructor(address)' "$VERIFIER")"
  verify_contract "$REGISTRY_ADDRESS" src/AgentShieldRegistry.sol:AgentShieldRegistry \
    --constructor-args "$(cast abi-encode 'constructor(address,address,uint256,uint256,address)' \
      "$AGENT_ID" "$SEMAPHORE" "$(jq -er .n "deployments/$CHAIN_ID.json")" \
      "$(jq -er .t "deployments/$CHAIN_ID.json")" "$(jq -er .seeder "deployments/$CHAIN_ID.json")")"
  if jq -e .mockAgentId "deployments/$CHAIN_ID.json" >/dev/null; then
    verify_contract "$AGENT_ID" src/testnet/MockAgentIdTestnet.sol:MockAgentIdTestnet
  fi
)
~~~

确认每条 `--watch` 返回验证成功，逐个打开 `${EXPLORER}/address/<地址>#code` 检查源码与编译设置。主网的 Agent ID 使用该外部合约的现有 BscScan 页面。

## 4. 导出 ABI

~~~bash
forge build --root contracts
node contracts/script/export-abi.mjs
node packages/core/src/chain/export-abi.mjs
pnpm -r build
pnpm test
~~~

确认两个 ABI 导出脚本、工作区构建和测试均成功。

## 5. 生成种子并上链

~~~bash
pnpm --filter @agentshield/intel pipeline sync
pnpm --filter @agentshield/intel pipeline domains
pnpm --filter @agentshield/intel pipeline clawhub
pnpm --filter @agentshield/intel pipeline baseline
~~~

查看 `intel/out/review-queue.json` 并按命中位置人工复核 Skill，将结论写到 `intel/reviewed-skills.json`。种子流水线只从标为 `malicious` 的复核记录生成 Skill 种子。[复核记录格式](../../intel/README.md#ioc-与提交)

~~~bash
${EDITOR:-vi} intel/reviewed-skills.json
jq -e 'type == "array"' intel/reviewed-skills.json
pnpm --filter @agentshield/intel pipeline seeds
pnpm --filter @agentshield/intel pipeline submit
~~~

检查 `intel/out/seeds.json` 的目标、来源和条数，核对 dry-run 输出的批次数和预估 gas。确认链和种子账户后广播一次。每批确认后才会发送下一批，重跑广播会再次增加已提交条目的种子计数。

~~~bash
RPC="$RPC_URL" pnpm --filter @agentshield/intel pipeline submit --broadcast
cast logs --rpc-url "$RPC_URL" --from-block "$DEPLOYMENT_BLOCK" --to-block latest \
  --address "$REGISTRY_ADDRESS" 'Seeded(uint8,bytes32,bytes32)'
~~~

用流水线输出的交易哈希打开 `${EXPLORER}/tx/<哈希>`，核对交易成功和 `Seeded` 事件中的来源 ID。

## 6. 部署 Vercel 中继

在 Vercel 创建中继项目。Root Directory 为 `relayer`，框架选 Hono。允许访问根目录工作区源文件和 `pnpm-lock.yaml`。在项目的 Production 环境填写变量，部署地址和区块使用本次清单。将 `RELAYER_PRIVATE_KEY` 设置为敏感变量，并设置实例的 QPS 和 UTC 每日 gas 单位预算。在终端导出 `VERCEL_ORG_ID`（所属团队 ID），将 `RELAYER_PROJECT_ID` 设为中继项目 ID。[中继环境变量](../../relayer/README.md) [Vercel CLI 项目选择](https://vercel.com/docs/cli/global-options)

从待发布的 Git 提交导出 Vercel 源码。以下用 `HEAD`，部署前核对它包含已验收的代码，并确认导出副本里没有仓库根目录的私钥文件。

~~~bash
VERCEL_SOURCE="$(mktemp -d)"
(git archive HEAD | tar -xf - -C "$VERCEL_SOURCE") &&
  test -f "$VERCEL_SOURCE/pnpm-lock.yaml" &&
  test ! -f "$VERCEL_SOURCE/.env" &&
  VERCEL_PROJECT_ID="$RELAYER_PROJECT_ID" vercel deploy --cwd "$VERCEL_SOURCE" --prod
~~~

将命令返回的公开 HTTPS 根地址设为 `RELAYER_URL`。验证统计返回 200，跨域头为 `Access-Control-Allow-Origin: *`，`targets` 中的种子条数能和上一步链上事件对应。

~~~bash
curl --fail-with-body -si "$RELAYER_URL/api/stats" -H 'Origin: https://dashboard.example'
~~~

## 7. 部署 Vercel 网页

创建另一个 Vercel 项目，Root Directory 为 `web`，框架选 Next.js，Node.js 选 22.x。允许访问根目录工作区源文件和锁文件。在 Production 环境设置网页变量。`NEXT_PUBLIC_RPC_URL` 使用允许浏览器跨域调用的 RPC，`NEXT_PUBLIC_RELAYER_URL` 使用上一步的 HTTPS 根地址，链 ID 和合约地址使用同一份清单。保留 Next.js 默认构建设置，将 `WEB_PROJECT_ID` 设为网页项目 ID。[网页环境变量](../../web/README.md) [Vercel 单仓库文档](https://vercel.com/docs/monorepos)

~~~bash
test -f "$VERCEL_SOURCE/pnpm-lock.yaml" &&
  test ! -f "$VERCEL_SOURCE/.env" &&
  VERCEL_PROJECT_ID="$WEB_PROJECT_ID" vercel deploy --cwd "$VERCEL_SOURCE" --prod
~~~

将公开 HTTPS 根地址设为 `WEB_URL`。确认首页、信号库与详情、指南、披露页都能直接访问。

~~~bash
(
  set -e
  for path in / /signals/ /signals/detail/ /guide/ /disclosure/; do
    curl -fsS -o /dev/null "$WEB_URL$path"
  done
)
~~~

在浏览器确认信号库显示种子，首页统计与中继响应一致，披露页的地址链接指向对应网络的 BscScan。

## 8. 配置本机 Skill

~~~bash
mkdir -p ~/.agentshield
${EDITOR:-vi} ~/.agentshield/config.json
~~~

将该网络的四个值填入 JSON，保留文件内已有的其他设置。以下为字段示例。

~~~json
{
  "registryAddress": "0x填入部署清单的Registry地址",
  "deploymentBlock": "填入部署清单的十进制区块",
  "rpcUrl": "https://替换为该网络的RPC",
  "relayerUrl": "https://替换为Vercel中继根地址"
}
~~~

校验 JSON 和本机 CLI 状态，再按网页指南完成钱包连接和登记演示。测试网 Mock 只提供链上领取和余额查询，官方钱包的 Agent ID 查询由钱包服务提供。

~~~bash
jq -e 'has("registryAddress") and has("deploymentBlock") and has("rpcUrl") and has("relayerUrl")' \
  ~/.agentshield/config.json
node skill/dist/index.js status
~~~
