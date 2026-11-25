## Purpose

观测网页是 AgentShield 的公开页面，作为提交材料中的「官网」：它展示链上风险信号库的状态、网络统计和产品介绍，便于评委和用户直观了解系统运行情况，同时严格保护参与者隐私。

## ADDED Requirements

### Requirement: 信号库浏览
网页 SHALL 列出链上风险对象，每个对象展示以下内容：
- 类型
- 标识（域名、地址或内容哈希）
- 危险票数、误报票数、种子信号来源
- 状态
- 首票时间
- 申诉记录

网页 SHALL 支持按类型和状态筛选。

#### Scenario: 查看某个恶意 Skill
- **WHEN** 访客打开某个 Skill 对象的详情页
- **THEN** 页面展示该对象的票数、状态、证据哈希列表和申诉记录，并给出 BscScan 上相关交易的链接

### Requirement: 网络统计
网页 SHALL 展示以下统计数据：已登记的 Agent ID 持有者数量、风险对象总数、各状态的对象数量、最近 24 小时新增的票数。所有数据 MUST 来自链上，并且可以复核。

#### Scenario: 统计与链上一致
- **WHEN** 访客查看已登记人数
- **THEN** 显示的数字与链上登记事件的数量一致

### Requirement: 隐私约束
网页 MUST NOT 展示任何 Agent ID 名称与钱包地址之间的对应关系，MUST NOT 提供按名字查询地址或资产的功能，也 MUST NOT 把公开投票的地址与该地址的其他行为关联展示。

#### Scenario: 不提供按名字查询
- **WHEN** 访客在搜索框输入一个 `name.ai`
- **THEN** 网页不返回该名字对应的地址或资产信息

### Requirement: 产品说明与合规披露
网页 SHALL 包含以下内容：
- 产品说明和能力边界（明确写出「不拦截 App 内的流程」）；
- 安装与加入指南，说明由用户自己的 Agent 使用 AgentShield Skill 通过 CLI 完成登记，这是持有者的唯一加入路径；
- 合约地址和 BscScan 验证链接；
- 特权角色披露；
- 数据源与许可证列表；
- 风险提示。

网页 MUST NOT 使用币安品牌冒充官方，MUST NOT 出现任何收益承诺。

#### Scenario: 披露页面
- **WHEN** 访客打开「安全与披露」页面
- **THEN** 页面列出所有合约地址、种子地址的权限说明，以及所有数据源的许可证

#### Scenario: 从首页了解如何加入
- **WHEN** 访客点击首页的主行动按钮
- **THEN** 网页打开安装指南，说明领取 Agent ID、安装并登录官方 Agentic Wallet Skill、在 App 内开启开发者模式、从 GitHub 安装 AgentShield Skill、确认登记预览及加密备份的步骤
