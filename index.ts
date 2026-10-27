export interface Env {
  BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_TELEGRAM_ID: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  BOT_LANGUAGE_DEFAULT?: string;
}

type TgUser = { id: number; username?: string; first_name?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  from?: TgUser;
  text?: string;
};
type TgCallback = {
  id: string;
  from: TgUser;
  message?: { chat: { id: number } };
  data?: string;
};
type TelegramUpdate = {
  update_id?: number;
  message?: TgMessage;
  callback_query?: TgCallback;
};

type Lang = "am" | "en";

const AM: Record<string, string> = {
  welcome: "እንኳን ወደ Agent Manager በደህና መጡ።\nቋንቋ ይምረጡ።",
  menu: "ዋና ምናሌ",
  register: "📝 Agent መመዝገብ",
  login: "🔐 መግቢያ",
  adminLogin: "👑 Admin መግቢያ",
  myShops: "🏪 የእኔ BetShop-ዎች",
  reports: "📊 ሪፖርት",
  help: "ℹ️ እገዛ",
  enterUser: "Username ያስገቡ።",
  enterPass: "Password ያስገቡ።",
  enterShopName: "የAgent/BetShop ስም ያስገቡ።",
  enterAmount: "መጠኑን በቁጥር ያስገቡ።",
  pending: "ጥያቄዎ ተልኳል። Admin ሲያጸድቅ ይጠቀማሉ።",
  denied: "መግባት አልተፈቀደም። መረጃዎን ያረጋግጡ ወይም Admin ያነጋግሩ።",
  adminOnly: "ይህን ተግባር Admin ብቻ ሊያደርግ ይችላል።",
  noShops: "የተመዘገቡ BetShop-ዎች አልተገኙም።",
  chooseShop: "BetShop ይምረጡ።",
  chooseAction: "Deposit ወይም Withdraw ይምረጡ።",
  deposit: "➕ Deposit",
  withdraw: "➖ Withdraw",
  success: "ተሳክቷል።",
  cancelled: "ተሰርዟል።",
  helpText: "/start — ዋና ምናሌ\n/register — Agent ምዝገባ\n/login — Agent መግቢያ\n/adminlogin — Admin መግቢያ\n/cancel — ሂደቱን መሰረዝ",
};

const EN: Record<string, string> = {
  welcome: "Welcome to Agent Manager.\nChoose your language.",
  menu: "Main menu",
  register: "📝 Register Agent",
  login: "🔐 Agent Login",
  adminLogin: "👑 Admin Login",
  myShops: "🏪 My BetShops",
  reports: "📊 Reports",
  help: "ℹ️ Help",
  enterUser: "Enter your username.",
  enterPass: "Enter your password.",
  enterShopName: "Enter the agent/BetShop name.",
  enterAmount: "Enter the amount as a number.",
  pending: "Your request was submitted. Admin approval is required.",
  denied: "Access denied. Check your details or contact Admin.",
  adminOnly: "Only Admin can perform this action.",
  noShops: "No BetShops found.",
  chooseShop: "Choose a BetShop.",
  chooseAction: "Choose Deposit or Withdraw.",
  deposit: "➕ Deposit",
  withdraw: "➖ Withdraw",
  success: "Completed.",
  cancelled: "Cancelled.",
  helpText: "/start — main menu\n/register — register as agent\n/login — agent login\n/adminlogin — admin login\n/cancel — cancel current step",
};export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      return Response.json({
        ok: true,
        name: "Agent Manager Bot",
        version: "1.0.0",
      });
    }

    if (url.pathname !== "/telegram" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    let update: TelegramUpdate;

    try {
      update = await request.json() as TelegramUpdate;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      if (
        update.update_id !== undefined &&
        !(await registerUpdate(env, update.update_id))
      ) {
        return Response.json({ ok: true, duplicate: true });
      }

      if (update.message) await handleMessage(env, update.message);
      if (update.callback_query) await handleCallback(env, update.callback_query);

      return Response.json({ ok: true });
    } catch (error) {
      console.error("Update failed", error);
      return Response.json({ ok: false }, { status: 200 });
    }
  },
};

function t(lang: Lang, key: string): string {
  return (lang === "am" ? AM : EN)[key] ?? key;
}

function keyboard(rows: { text: string; callback_data: string }[][]) {
  return {
    inline_keyboard: rows.map(row =>
      row.map(button => ({
        text: button.text,
        callback_data: button.callback_data,
      }))
    ),
  };
}

function mainKeyboard(lang: Lang, admin = false) {
  const rows = [
    [
      { text: t(lang, "register"), callback_data: "register" },
      { text: t(lang, "login"), callback_data: "login" },
    ],
    [
      { text: t(lang, "myShops"), callback_data: "shops" },
      { text: t(lang, "reports"), callback_data: "reports" },
    ],
    [{ text: t(lang, "adminLogin"), callback_data: "adminlogin" }],
    [
      { text: "🌐 Amharic", callback_data: "lang_am" },
      { text: "🌐 English", callback_data: "lang_en" },
    ],
  ];

  if (admin) {
    rows.splice(2, 0, [
      { text: "💳 Transactions", callback_data: "admin_transactions" },
      { text: "✅ Pending requests", callback_data: "admin_pending" },
    ]);
  }

  return { inline_keyboard: rows };
}

async function tg(
  env: Env,
  method: string,
  body: Record<string, unknown>
) {
  const r = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await r.json() as {
    ok?: boolean;
    description?: string;
  };

  if (!r.ok || !data.ok) {
    console.error("Telegram API error", data.description ?? r.status);
  }

  return data;
}

async function send(
  env: Env,
  chatId: number,
  text: string,
  reply_markup?: unknown
) {
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    ...(reply_markup ? { reply_markup } : {}),
  });
}

async function answerCb(env: Env, id: string, text = "") {
  return tg(env, "answerCallbackQuery", {
    callback_query_id: id,
    text,
  });
}

function sbHeaders(env: Env, extra: Record<string, string> = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function sb(env: Env, path: string, init: RequestInit = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...sbHeaders(env),
      ...(init.headers as Record<string, string> ?? {}),
    },
  });

  const text = await r.text();

  if (!r.ok) {
    console.error("Supabase error", r.status, text);
    throw new Error(`Database error ${r.status}`);
  }

  return text ? JSON.parse(text) : null;
}

async function registerUpdate(
  env: Env,
  updateId: number
): Promise<boolean> {
  try {
    const result = await sb(
      env,
      "telegram_updates?on_conflict=update_id",
      {
        method: "POST",
        headers: {
          prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({ update_id: updateId }),
      }
    ) as unknown[];

    return Array.isArray(result) && result.length > 0;
  } catch {
    return true;
  }
}

async function getProfile(env: Env, userId: number) {
  const rows = await sb(
    env,
    `telegram_profiles?telegram_user_id=eq.${userId}&select=language`,
    { method: "GET" }
  ) as { language?: string }[];

  return (rows[0]?.language === "en" ? "en" : "am") as Lang;
}

async function saveLanguage(
  env: Env,
  userId: number,
  lang: Lang
) {
  await sb(
    env,
    "telegram_profiles?on_conflict=telegram_user_id",
    {
      method: "POST",
      headers: {
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        telegram_user_id: userId,
        language: lang,
        updated_at: new Date().toISOString(),
      }),
    }
  );
}

async function getSession(env: Env, userId: number) {
  const rows = await sb(
    env,
    `bot_sessions?telegram_user_id=eq.${userId}&select=state,data`,
    { method: "GET" }
  ) as {
    state: string;
    data: Record<string, unknown>;
  }[];

  return rows[0] ?? { state: "idle", data: {} };
}

async function setSession(
  env: Env,
  userId: number,
  state: string,
  data: Record<string, unknown> = {}
) {
  await sb(
    env,
    "bot_sessions?on_conflict=telegram_user_id",
    {
      method: "POST",
      headers: {
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        telegram_user_id: userId,
        state,
        data,
        updated_at: new Date().toISOString(),
      }),
    }
  );
}

async function clearSession(env: Env, userId: number) {
  await setSession(env, userId, "idle", {});
}async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return [...new Uint8Array(hash)]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("");
}

async function findAgent(env: Env, username: string) {
  const q = encodeURIComponent(`eq.${username}`);

  const rows = await sb(
    env,
    `agents?user_name=${q}&select=id,user_name,password_hash,telegram_user_id,status,language`,
    { method: "GET" }
  ) as any[];

  return rows[0] ?? null;
}

async function findAdmin(
  env: Env,
  username: string,
  password: string,
  telegramId: number
) {
  if (String(telegramId) !== String(env.ADMIN_TELEGRAM_ID)) {
    return false;
  }

  if (username !== env.ADMIN_USERNAME) return false;

  return (await sha256Hex(password)) ===
    env.ADMIN_PASSWORD_HASH.toLowerCase();
}

async function handleMessage(env: Env, m: TgMessage) {
  const chatId = m.chat.id;
  const userId = m.from?.id ?? chatId;
  const text = (m.text ?? "").trim();
  const lang = await getProfile(env, userId);

  if (text === "/start") {
    await clearSession(env, userId);
    await send(
      env,
      chatId,
      t(lang, "welcome"),
      keyboard([[
        { text: "አማርኛ", callback_data: "lang_am" },
        { text: "English", callback_data: "lang_en" },
      ]])
    );
    return;
  }

  if (text === "/help") {
    await send(env, chatId, t(lang, "helpText"));
    return;
  }

  if (text === "/cancel") {
    await clearSession(env, userId);
    await send(
      env,
      chatId,
      t(lang, "cancelled"),
      mainKeyboard(lang)
    );
    return;
  }

  let session = await getSession(env, userId);

  if (text === "/register") {
    await setSession(env, userId, "agent_register_user");
    await send(env, chatId, t(lang, "enterUser"));
    return;
  }

  if (text === "/login") {
    await setSession(env, userId, "agent_login_user");
    await send(env, chatId, t(lang, "enterUser"));
    return;
  }

  if (text === "/adminlogin") {
    await setSession(env, userId, "admin_login_user");
    await send(env, chatId, t(lang, "enterUser"));
    return;
  }

  if (session.state === "agent_register_user") {
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(text)) {
      await send(
        env,
        chatId,
        "Username 3–32 characters: letters, numbers, _ . -"
      );
      return;
    }

    await setSession(
      env,
      userId,
      "agent_register_pass",
      { username: text }
    );

    await send(env, chatId, t(lang, "enterPass"));
    return;
  }

  if (session.state === "agent_register_pass") {
    const username = String(session.data.username ?? "");
    const exists = await findAgent(env, username);

    if (exists) {
      await clearSession(env, userId);
      await send(
        env,
        chatId,
        "Username already exists. Use /register again."
      );
      return;
    }

    await sb(env, "agents", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        user_name: username,
        password_hash: await sha256Hex(text),
        telegram_user_id: userId,
        status: "pending",
        language: lang,
      }),
    });

    await clearSession(env, userId);
    await send(
      env,
      chatId,
      t(lang, "pending"),
      mainKeyboard(lang)
    );
    return;
  }

  if (session.state === "agent_login_user") {
    await setSession(
      env,
      userId,
      "agent_login_pass",
      { username: text }
    );
    await send(env, chatId, t(lang, "enterPass"));
    return;
  }

  if (session.state === "agent_login_pass") {
    const agent = await findAgent(
      env,
      String(session.data.username ?? "")
    );

    if (
      !agent ||
      agent.status !== "approved" ||
      agent.password_hash !== await sha256Hex(text)
    ) {
      await clearSession(env, userId);
      await send(env, chatId, t(lang, "denied"));
      return;
    }

    await setSession(env, userId, "agent_logged_in", {
      role: "agent",
      agent_id: agent.id,
      username: agent.user_name,
    });

    await send(
      env,
      chatId,
      `${t(lang, "success")}\n${t(lang, "menu")}`,
      mainKeyboard(lang)
    );
    return;
  }

  if (session.state === "admin_login_user") {
    await setSession(
      env,
      userId,
      "admin_login_pass",
      { username: text }
    );
    await send(env, chatId, t(lang, "enterPass"));
    return;
  }

  if (session.state === "admin_login_pass") {
    const ok = await findAdmin(
      env,
      String(session.data.username ?? ""),
      text,
      userId
    );

    await clearSession(env, userId);

    if (!ok) {
      await send(env, chatId, t(lang, "denied"));
      return;
    }

    await setSession(env, userId, "admin_logged_in", {
      role: "admin",
    });

    await send(
      env,
      chatId,
      `${t(lang, "success")}\n${t(lang, "menu")}`,
      mainKeyboard(lang, true)
    );
    return;
  }

  if (session.state === "amount") {
    const amount = Number(text);

    if (!Number.isFinite(amount) || amount <= 0) {
      await send(env, chatId, t(lang, "enterAmount"));
      return;
    }

    await clearSession(env, userId);
    await send(
      env,
      chatId,
      "Amount received, but no balance was changed. A secure database transaction is required."
    );
    return;
  }

  session = await getSession(env, userId);

  if (session.state === "agent_logged_in") {
    await send(env, chatId, t(lang, "menu"), mainKeyboard(lang));
    return;
  }

  if (session.state === "admin_logged_in") {
    await send(
      env,
      chatId,
      t(lang, "menu"),
      mainKeyboard(lang, true)
    );
    return;
  }

  await send(env, chatId, t(lang, "welcome"), mainKeyboard(lang));
}async function handleCallback(env: Env, q: TgCallback) {
  const chatId = q.message?.chat.id;

  if (!chatId) {
    await answerCb(env, q.id);
    return;
  }

  const userId = q.from.id;
  const data = q.data ?? "";
  const lang = await getProfile(env, userId);

  await answerCb(env, q.id);

  if (data === "lang_am" || data === "lang_en") {
    const next: Lang = data === "lang_en" ? "en" : "am";

    await saveLanguage(env, userId, next);
    await send(
      env,
      chatId,
      t(next, "menu"),
      mainKeyboard(next)
    );
    return;
  }

  if (data === "register") {
    await setSession(env, userId, "agent_register_user");
    await send(env, chatId, t(lang, "enterUser"));
    return;
  }

  if (data === "login") {
    await setSession(env, userId, "agent_login_user");
    await send(env, chatId, t(lang, "enterUser"));
    return;
  }

  if (data === "adminlogin") {
    await setSession(env, userId, "admin_login_user");
    await send(env, chatId, t(lang, "enterUser"));
    return;
  }

  const session = await getSession(env, userId);

  if (data === "shops" || data === "reports") {
    if (
      session.state !== "agent_logged_in" &&
      session.state !== "admin_logged_in"
    ) {
      await send(env, chatId, t(lang, "denied"));
      return;
    }

    const isAdmin = session.state === "admin_logged_in";
    const agentId = session.data.agent_id;

    const filters = isAdmin
      ? "select=id,betshop_name,betshop_id,balance,status&deleted_at=is.null&order=created_at.desc"
      : `agent_id=eq.${encodeURIComponent(String(agentId))}&select=id,betshop_name,betshop_id,balance,status&deleted_at=is.null&order=created_at.desc`;

    const shops = await sb(
      env,
      `betshops?${filters}`,
      { method: "GET" }
    ) as any[];

    if (!shops.length) {
      await send(env, chatId, t(lang, "noShops"));
      return;
    }

    const lines = shops.slice(0, 30).map(
      s =>
        `${s.betshop_name ?? "BetShop"} (#${s.betshop_id ?? "—"})\nBalance: ${s.balance ?? 0} | Status: ${s.status ?? "unknown"}`
    );

    await send(
      env,
      chatId,
      data === "reports"
        ? `📊 Reports\n${lines.join("\n\n")}`
        : `${t(lang, "myShops")}\n\n${lines.join("\n\n")}`
    );
    return;
  }

  if (data === "admin_pending" || data === "admin_transactions") {
    if (
      session.state !== "admin_logged_in" ||
      String(userId) !== String(env.ADMIN_TELEGRAM_ID)
    ) {
      await send(env, chatId, t(lang, "adminOnly"));
      return;
    }

    if (data === "admin_pending") {
      const agents = await sb(
        env,
        "agents?status=eq.pending&select=id,user_name,telegram_user_id,created_at&order=created_at.asc",
        { method: "GET" }
      ) as any[];

      const shops = await sb(
        env,
        "betshops?status=eq.pending&select=id,betshop_name,betshop_id,agent_id,created_at&order=created_at.asc",
        { method: "GET" }
      ) as any[];

      const rows: {
        text: string;
        callback_data: string;
      }[][] = [];

      agents.slice(0, 20).forEach(a =>
        rows.push([{
          text: `Approve agent: ${a.user_name}`,
          callback_data: `approve_agent:${a.id}`,
        }])
      );

      shops.slice(0, 20).forEach(s =>
        rows.push([{
          text: `Approve shop: ${s.betshop_name ?? s.betshop_id}`,
          callback_data: `approve_shop:${s.id}`,
        }])
      );

      await send(
        env,
        chatId,
        `Pending agents: ${agents.length}\nPending BetShops: ${shops.length}`,
        rows.length ? { inline_keyboard: rows } : undefined
      );
    } else {
      const tx = await sb(
        env,
        "transactions?select=id,betshop_id,agent_id,transaction_type,amount,created_at&order=created_at.desc&limit=20",
        { method: "GET" }
      ) as any[];

      await send(
        env,
        chatId,
        tx.length
          ? tx.map(
              x => `${x.transaction_type} ${x.amount} | Shop ${x.betshop_id} | ${x.created_at}`
            ).join("\n")
          : "No transactions."
      );
    }

    return;
  }

  if (
    data.startsWith("approve_agent:") ||
    data.startsWith("approve_shop:")
  ) {
    if (
      session.state !== "admin_logged_in" ||
      String(userId) !== String(env.ADMIN_TELEGRAM_ID)
    ) {
      await send(env, chatId, t(lang, "adminOnly"));
      return;
    }

    const [kind, id] = data.split(":");
    const table = kind === "approve_agent" ? "agents" : "betshops";

    await sb(
      env,
      `${table}?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          status: "approved",
          approved_at: new Date().toISOString(),
        }),
      }
    );

    await send(env, chatId, `Approved: ${id}`);
    return;
  }

  await send(
    env,
    chatId,
    t(lang, "menu"),
    mainKeyboard(lang, session.state === "admin_logged_in")
  );
}
