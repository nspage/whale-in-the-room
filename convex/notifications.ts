import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendTelegramAlert = action({
  args: {
    whaleName: v.string(),
    protocol: v.string(),
    dashboardUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variable is not set");
    }

    const text = `🚨 *Whale Activity Detected* 🚨

` +
      `*Whale:* ${args.whaleName}
` +
      `*Protocol:* ${args.protocol}

` +
      `🔗 [View Dashboard](${process.env.DASHBOARD_URL || args.dashboardUrl})

` +
      `_Powered by Allium_`;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${errorText}`);
    }

    return { success: true };
  },
});
