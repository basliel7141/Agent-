
export interface Env {
  BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_TELEGRAM_ID: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  BOT_LANGUAGE_DEFAULT?: string;
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id: number;
    chat: { id: number; type?: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
};

const AM = {
  welcome: "እንኳን ወደ Agent Manager በደህና መጡ።\n\nቋንቋ ይምረጡ።",
  saved: "ቋንቋዎ ተቀምጧል። የAgent ምዝገባና የመግቢያ አገልግሎት በሚቀጥለው ደረጃ ይጨመራል။",
  help: "ይህ የAgent/BetShop Manager ቦት ነው። አሁን /start እና የቋንቋ ምርጫ ብቻ ተዘጋጅተዋል።"
};

const EN = {
  welcome: "Welcome to Agent Manager.\n\nPlease choose your language.",
  saved: "Your language preference was saved. Agent registration and login will be added in the next implementation step.",
  help: "This is the Agent/BetShop Manager bot. Currently /start and language selection are implemented."
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        ok: true,
        service: "agent-telegram-bot",
        version: "0.2.0"
      });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.BOT_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response("Server configuration missing", { status: 500 });
    }

    let update: TelegramUpdate;

    try {
      update = await request.json() as TelegramUpdate;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
  if (update.callback_query) {
    await answerCallback(env, update.callback_query.id);
  }

  if (typeof update.update_id === "number") {
    const isNew = await registerUpdate(env, update.update_id);

        if (!isNew) {
          return new Response("ok", { status: 200 });
        }
      }

      if (update.message?.chat?.id && update.message.text) {
        const chatId = update.message.chat.id;
        const messageText = update.message.text.trim();
        const command = messageText.split(/\s+/)[0].split("@")[0].toLowerCase();

        if (command === "/start") {
          await sendMessage(env, chatId, AM.welcome, languageKeyboard());

          if (update.message.from) {
            await saveLanguage(env, update.message.from.id, "am");
          }
        } else if (command === "/help") {
          await sendMessage(env, chatId, EN.help);
        } else {
          await sendMessage(
            env,
            chatId,
            "Use /start to begin. / ለመጀመር /start ይጫኑ።",
            languageKeyboard()
          );
        }
      }

      if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message?.chat.id;
        const lang = cq.data === "lang_en" ? "en" : "am";


        if (chatId) {
          await saveLanguage(env, cq.from.id, lang);
          await sendMessage(env, chatId, lang === "en" ? EN.saved : AM.saved);
        }
      }

      return new Response("ok", { status: 200 });
    } catch (error) {
      console.error(
        "Telegram update handling failed:",
        error instanceof Error ? error.message : "unknown"
      );

      // Acknowledge the webhook to avoid Telegram retry loops.
      return new Response("ok", { status: 200 });
    }
  }
};

function languageKeyboard() {
  return {
    inline_keyboard: [[
      { text: "አማርኛ 🇪🇹", callback_data: "lang_am" },
      { text: "English 🇬🇧", callback_data: "lang_en" }
    ]]
  };
}

async function telegramCall(
  env: Env,
  method: string,
  body: Record<string, unknown>
) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with status ${response.status}`);
  }

  return response.json();
}

async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: unknown
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await telegramCall(env, "sendMessage", body);
}

async function answerCallback(env: Env, callbackQueryId: string) {
  await telegramCall(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId
  });
}

async function registerUpdate(
  env: Env,
  updateId: number
): Promise<boolean> {
  const endpoint =
    `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/telegram_updates`;

  const response = await fetch(
    `${endpoint}?on_conflict=update_id`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "prefer": "resolution=ignore-duplicates,return=representation"
      },
      body: JSON.stringify({ update_id: updateId })
    }
  );

  if (!response.ok) {
    const details = (await response.text()).slice(0, 200);
    console.error("Supabase update registration failed:", response.status, details);
    throw new Error(`Supabase update registration failed with status ${response.status}`);
  }

  const rows = await response.json() as Array<{ update_id: number }>;
  return Array.isArray(rows) && rows.length > 0;
}

async function saveLanguage(
  env: Env,
  telegramUserId: number,
  language: "am" | "en"
) {
  const endpoint =
    `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/telegram_profiles`;

  const response = await fetch(
    `${endpoint}?on_conflict=telegram_user_id`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        language,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!response.ok) {
    const details = (await response.text()).slice(0, 200);
    console.error("Supabase profile save failed:", response.status, details);
    throw new Error(`Supabase profile save failed with status ${response.status}`);
  }
}
