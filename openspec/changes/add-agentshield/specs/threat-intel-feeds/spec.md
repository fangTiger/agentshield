## Purpose

威胁情报源负责从公开数据源和我们自己的主动扫描中获取初始风险数据，解决冷启动问题，保证第一个用户安装当天就能获得保护。同时要保证每条数据都标注来源，并且符合数据源的许可证要求。

## ADDED Requirements

### Requirement: 钓鱼域名与恶意地址情报
系统 SHALL 至少接入以下数据源：
- ScamSniffer 公开黑名单：域名和地址
- MetaMask eth-phishing-detect：黑名单、模糊匹配名单、白名单
- GoPlus 公开 API：钓鱼网站查询，以及 BSC 链上的地址安全查询

每条命中结果 MUST 注明来源名称和数据获取时间。

#### Scenario: 命中 ScamSniffer
- **WHEN** 授权体检解析出的域名出现在 ScamSniffer 黑名单中
- **THEN** 结论中显示「情报源：ScamSniffer（数据时间 X）」

#### Scenario: 外部 API 不可用
- **WHEN** GoPlus API 请求超时或失败
- **THEN** 体检继续使用其他数据源，并在结论中注明「GoPlus 未查询」

### Requirement: 本地缓存与同步
Skill SHALL 在本地缓存体积较大的名单，并定期增量更新。缓存超过 7 天未更新时，Skill MUST 在结论中提示「情报可能过期」。

#### Scenario: 缓存过期
- **WHEN** 本地缓存的最近一次更新已超过 7 天
- **THEN** 体检结论附带「情报可能过期」的提示

### Requirement: 许可证合规
对于 GPL 等传染性许可证的数据源，系统 SHALL 在运行时直接从原始来源拉取，MUST NOT 把这些数据复制进本项目仓库或打包进发布物。所有数据源的许可证和来源 SHALL 在项目文档中列出。

#### Scenario: 发布包检查
- **WHEN** 检查 Skill 的发布包
- **THEN** 发布包中不包含任何 GPL 数据源的数据副本

### Requirement: 恶意 Skill 种子
系统 SHALL 通过两种方式建立初始的恶意 Skill 样本：
- 从公开安全报告中整理已知恶意 Skill 的标识；
- 对公开 Skill 仓库（例如 ClawHub 的公开 Skill）批量运行红线扫描。

批量扫描的结果 MUST 经过人工复核：只有被复核确认为恶意的 Skill，才 SHALL 以种子信号的形式写入链上信号库，并标注来源和复核记录。未经复核的扫描结果 MUST NOT 上链。

#### Scenario: 复核确认后才产生种子
- **WHEN** 批量扫描发现某个公开 Skill 为「高风险」，且人工复核确认它确实包含恶意指令
- **THEN** 该 Skill 的内容哈希以「来源：AgentShield 主动扫描（人工复核）」种子信号的形式上链

#### Scenario: 防御性文字被误判
- **WHEN** 人工复核发现命中内容实际上是防御性说明，例如「不要粘贴私钥」
- **THEN** 该 Skill 不进入种子，复核记录中注明误报原因

### Requirement: 注入检测评测集
系统 SHALL 使用公开的提示词注入数据集，以及自己构造的 Agentic Wallet 场景样本，来评测话术识别和 Skill 扫描的检出率和误报率，并公开评测结果。

#### Scenario: 评测报告
- **WHEN** 运行评测脚本
- **THEN** 输出每类规则的检出率和误报率，以及使用的数据集名称和版本

### Requirement: 官方白名单维护
官方域名白名单 SHALL 由项目人工维护，并硬编码在 Skill 中。白名单的每一项 MUST 注明依据，例如来自币安官方公告或官方文档链接。社区信号和外部数据源 MUST NOT 修改白名单。

#### Scenario: 外部名单不影响白名单
- **WHEN** 某个外部数据源把一个官方域名列入了黑名单
- **THEN** 白名单判定不变，结论中同时展示这个冲突，并提示人工复核
