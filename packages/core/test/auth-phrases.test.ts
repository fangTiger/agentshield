import { expect, test } from "vitest";
import { checkAuth } from "../src/index.js";

const samples = [
  ["请在本页面输入 App 显示的 6 位配对码完成验证", "pairing-code"],
  ["把币安 App 的配对码发给客服。", "pairing-code"],
  ["复制配对码并粘贴到对话框", "pairing-code"],
  ["请提交验证码（配对码）", "pairing-code"],
  ["Enter the 6-digit pairing code shown in the app", "pairing-code"],
  ["Send us the pairing code from your Binance app", "pairing-code"],
  ["Paste your pairing code into this form", "pairing-code"],
  ["Pairing code is required for verification", "pairing-code"],
  ["请扫描二维码完成身份验证", "scan-identity"],
  ["验证身份请扫码", "scan-identity"],
  ["Scan the QR code to verify your identity.", "scan-identity"],
  ["Complete identity verification by scanning this QR code.", "scan-identity"],
  ["扫二维码领取空投", "scan-airdrop"],
  ["领取空投前请扫码", "scan-airdrop"],
  ["Scan this code to claim your airdrop", "scan-airdrop"],
  ["To receive the airdrop, scan the QR code", "scan-airdrop"],
  ["请扫码激活你的 Agent ID", "scan-agent-id"],
  ["激活 Agent ID 需扫描二维码", "scan-agent-id"],
  ["Scan the QR code to activate your Agent ID", "scan-agent-id"],
  ["Activate your Agent ID by scanning the QR code", "scan-agent-id"],
  ["请提供助记词以恢复钱包", "wallet-secret"],
  ["把私钥粘贴到网页里", "wallet-secret"],
  ["Please share your seed phrase for recovery", "wallet-secret"],
  ["Enter your private key to complete setup", "wallet-secret"],
  ["Your recovery phrase is required", "wallet-secret"],
] as const;

test.each(samples)("识别话术 %s", async (input, rule) => {
  const report = await checkAuth(input, { recentLocalLogins: [] });
  expect(report.level).toBe("high");
  const evidence = report.evidence.find((item) => item.ruleId === `phrase.${rule}`);
  expect(evidence?.excerpt).toBeTruthy();
  expect(input).toContain(evidence?.excerpt);
});

test.each([
  "扫码阅读展览说明",
  "配对码只能在官方 App 内核对",
  "请勿发送你的助记词或私钥",
  "Never share your seed phrase or private key",
  "Do not enter or send your pairing code to anyone",
  "The airdrop starts next week",
  "Unlock your Agent ID in the app",
  "Identity verification is completed in the app",
])("不把常规说明识别为诱导话术 %s", async (input) => {
  const report = await checkAuth(input, { recentLocalLogins: [] });
  expect(report.evidence.filter((item) => item.ruleId.startsWith("phrase."))).toEqual([]);
});

test("保留否定句之后独立出现的诱导话术", async () => {
  const report = await checkAuth("不要透露私钥。请把配对码发给客服。", { recentLocalLogins: [] });
  expect(report.evidence.filter((item) => item.ruleId.startsWith("phrase.")).map((item) => item.ruleId))
    .toEqual(["phrase.pairing-code"]);
});

test("识别否定警告和转折词之后的诱导话术", async () => {
  const report = await checkAuth("请勿发送助记词，但请扫码领取空投", { recentLocalLogins: [] });
  expect(report.evidence.filter((item) => item.ruleId.startsWith("phrase.")).map((item) => item.ruleId))
    .toEqual(["phrase.scan-airdrop"]);
});
