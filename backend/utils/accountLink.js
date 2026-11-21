// Linking a website account to Telegram through the shop bot — see the
// AccountLinkCode model and bot/shopBot.js ("👤 គណនីរបស់ខ្ញុំ").
const crypto = require("crypto");
const { AccountLinkCode } = require("../models/TelegramBot");
const { getBotInfo } = require("./telegramApi");

// New code for `account` (older unused codes for it are dropped).
async function createLinkCode(account, createdBy) {
  await AccountLinkCode.deleteMany({ account: account._id });
  const code = String(crypto.randomInt(100000, 1000000));
  const token = crypto.randomBytes(12).toString("hex");
  const row = await AccountLinkCode.create({ account: account._id, code, token, createdBy: createdBy || null });
  const bot = await getBotInfo();
  return {
    username: account.username,
    code,
    botUsername: bot?.username || null,
    url: bot?.username ? `https://t.me/${bot.username}?start=acct_${token}` : null,
    expiresAt: new Date(row.createdAt.getTime() + 15 * 60 * 1000),
  };
}

module.exports = { createLinkCode };
