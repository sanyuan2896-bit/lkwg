# 洛克王国远行商人提醒小程序

这是一个微信小程序 MVP，目标是做远行商人当前商品展示和订阅提醒。

## 当前范围

- 展示远行商人当前时间段商品
- 固定提醒 `炫彩蛋`、`棱镜球`、`血脉秘药`
- 通过微信订阅消息 + 云开发实现提醒次数累计和定时推送

明确不做：

- 预测
- 攻略
- 本场记录

## 已实现能力

- 首页展示当前时间段商品、价格、限购和剩余时间
- 商品数据抓取自 onebiji 远行商人页面
- 商品数量不写死，有几个展示几个
- 抓取失败时显示“数据更新中”
- 固定 4 个时间段：
  - `08:00-12:00`
  - `12:00-16:00`
  - `16:00-20:00`
  - `20:00-24:00`
- 订阅按钮可拉起微信订阅授权
- 用户每同意一次，`remainingCount +1`
- 定时命中固定商品后，发送一次订阅消息并扣减一次次数
- 广告位保留，后续可接入变现

## 项目结构

- `app.*`：全局配置和云开发初始化
- `pages/index/*`：首页、商品展示、订阅入口
- `pages/settings/*`：提醒设置、云环境和模板配置
- `utils/merchant.js`：抓取、时间计算、本地配置
- `cloudfunctions/*`：云函数

## 本地运行

1. 打开微信开发者工具
2. 导入项目目录 `E:\AAAdocument\project\lkwg`
3. 使用当前 AppID：`wxebd25e88fd861502`
4. 在开发设置里放行 `https://www.onebiji.com`
5. 编译运行

## 云开发配置

- 环境名称：`cloudbase`
- 环境 ID：`cloudbase-d9gfw4fls7375ca47`
- 模板 ID：`zwPG3DQvU8Zji6R4MPhu7vOlURBk1_7Nq6sZ6USEuWA`

### 云函数

- `createMerchantSubscription`
- `getMerchantSubscriptionStatus`
- `syncMerchantSnapshot`
- `sendMerchantNotifications`

### 数据库集合

- `merchant_subscriptions`
- `merchant_snapshots`

## merchant_subscriptions 建议字段

- `openid`
- `templateId`
- `goodsNames`
- `currentGoods`
- `remainingCount`
- `slotKey`
- `rangeText`
- `stageText`
- `lastSentSlotKey`
- `status`
- `createdAt`
- `updatedAt`

## merchant_snapshots 建议字段

- `slotKey`
- `goods`
- `rangeText`
- `fetchedAt`

## 当前状态

- CloudBase MCP 已配置并可用
- 云函数已部署到 `cloudbase-d9gfw4fls7375ca47`
- 定时触发器已创建
- 时间段展示、模板时间字段、去重键已统一
