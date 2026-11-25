/** 由项目人工维护的官方主机名与核验依据。 */
const officialHosts = new Map([
  ["binance.com", "https://binance.com/"], // 币安官网入口
  ["www.binance.com", "https://www.binance.com/en/official-verification"], // 币安官方来源验证页
  ["web3.binance.com", "https://web3.binance.com/en/defiwallet/term-of-use"], // 币安钱包服务条款
  ["app.binance.com", "https://www.binance.com/en/square/post/372962296152608"], // 官方公告中的 App 问卷链接
  ["accounts.binance.com", "https://accounts.binance.com/en/login"], // 币安账户登录入口
  ["binanceapi.com", "https://developers.binance.com/en/docs/products/binance-pay-merchant/api-common"], // 币安 Pay API 的可注册域
  ["bpay.binanceapi.com", "https://developers.binance.com/en/docs/products/binance-pay-merchant/api-common"], // 币安 Pay 官方 API 主机
]);

export function isOfficialHost(host: string): boolean {
  return officialHosts.has(host);
}
