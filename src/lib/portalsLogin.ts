import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Реестр ОДНОГО живого процесса интерактивного Telegram-входа (worker/portals_login_interactive.py) для
// UI-мастера в /settings. Держать процесс живым между HTTP-запросами обязательно: phone_code_hash из
// send_code() валиден только на том же MTProto-соединении, что и последующий sign_in(). Приложение
// локальное и однопользовательское (инв. проекта), поэтому module-level singleton активного логина —
// приемлемо (один вход за раз; новый start убивает предыдущий). Server-only (node:child_process) — клиент
// ходит сюда только через роут /api/settings/telegram-login, никогда прямым импортом (инв. 10).

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const SCRIPT = path.join(process.cwd(), "worker", "portals_login_interactive.py");
const IDLE_TTL_MS = 5 * 60_000; // авто-kill простаивающего логина — не плодить/не подвешивать Telegram-коннекты
const CODE_WAIT_MS = 100_000; // ждём ответ сайдкара (send_code/sign_in зависят от сети Telegram)

/** Ответ Python-сайдкара, отнормализованный для роута. `session` НИКОГДА не уходит клиенту (инв. 10). */
export type LoginResult =
  | { status: "code_sent"; loginId: string }
  | { status: "password_needed"; loginId: string }
  | { status: "ok"; user: string; session: string; apiId: string; apiHash: string }
  | { status: "error"; error: string; detail?: string };

interface SidecarMsg {
  status: "code_sent" | "password_needed" | "ok" | "error";
  session?: string;
  user?: string;
  error?: string;
  detail?: string;
}

interface LoginSession {
  id: string;
  child: ChildProcessWithoutNullStreams;
  apiId: string;
  apiHash: string;
  buffer: string;
  queue: SidecarMsg[];
  waiter: { resolve: (m: SidecarMsg) => void; timer: NodeJS.Timeout } | null;
  idleTimer: NodeJS.Timeout | null;
  killed: boolean;
}

let active: LoginSession | null = null;

function writeCmd(s: LoginSession, obj: Record<string, unknown>): void {
  try {
    s.child.stdin.write(JSON.stringify(obj) + "\n");
  } catch {
    /* процесс мог умереть — waiter добьётся таймаутом/close */
  }
}

function deliver(s: LoginSession, msg: SidecarMsg): void {
  if (s.waiter) {
    const w = s.waiter;
    s.waiter = null;
    clearTimeout(w.timer);
    w.resolve(msg);
  } else {
    s.queue.push(msg);
  }
}

function parseChunk(s: LoginSession): void {
  let idx: number;
  while ((idx = s.buffer.indexOf("\n")) >= 0) {
    const line = s.buffer.slice(0, idx).trim();
    s.buffer = s.buffer.slice(idx + 1);
    if (!line) continue;
    let msg: SidecarMsg;
    try {
      msg = JSON.parse(line) as SidecarMsg;
    } catch {
      continue; // не-JSON шум (логи Pyrogram и т.п.) — пропускаем
    }
    if (msg && typeof msg.status === "string") deliver(s, msg);
  }
}

/** Ждёт один ответ сайдкара. Никогда не reject'ит: таймаут/смерть процесса → синтетический error-статус. */
function readOne(s: LoginSession, timeoutMs = CODE_WAIT_MS): Promise<SidecarMsg> {
  const queued = s.queue.shift();
  if (queued) return Promise.resolve(queued);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      s.waiter = null;
      resolve({ status: "error", error: "login_timeout" });
    }, timeoutMs);
    s.waiter = { resolve, timer };
  });
}

function resetIdle(s: LoginSession): void {
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => killSession(s), IDLE_TTL_MS);
}

function killSession(s: LoginSession): void {
  if (s.killed) return;
  s.killed = true;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = null;
  writeCmd(s, { cmd: "cancel" }); // мягко — сайдкар отключится и выйдет
  const child = s.child;
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* уже мёртв */
    }
  }, 2000).unref?.();
  if (active === s) active = null;
}

function spawnSession(apiId: string, apiHash: string): LoginSession {
  const child = spawn(PYTHON_BIN, [SCRIPT], {
    env: { ...process.env, TELEGRAM_API_ID: apiId, TELEGRAM_API_HASH: apiHash },
  });
  const s: LoginSession = {
    id: randomBytes(8).toString("hex"),
    child,
    apiId,
    apiHash,
    buffer: "",
    queue: [],
    waiter: null,
    idleTimer: null,
    killed: false,
  };
  child.stdout.on("data", (d) => {
    s.buffer += d.toString();
    parseChunk(s);
  });
  child.stderr.on("data", () => {}); // логи Pyrogram — игнорируем
  const die = (error: string) => {
    if (s.waiter) deliver(s, { status: "error", error });
    if (active === s) active = null;
    s.killed = true;
  };
  child.on("close", () => die("login_process_exited"));
  child.on("error", (e) => die(`login_spawn_failed: ${e.message}`));
  return s;
}

function get(loginId: string): LoginSession | null {
  return active && active.id === loginId && !active.killed ? active : null;
}

/** Терминальный ответ (ok/протух/умер) убивает сессию; повторяемые ошибки (code_invalid, password_invalid)
 *  оставляют процесс живым для новой попытки. `ok` дополняем apiId/apiHash сессии — роут их сохранит. */
function finalize(s: LoginSession, msg: SidecarMsg): LoginResult {
  if (msg.status === "ok") {
    killSession(s);
    return { status: "ok", user: msg.user ?? "", session: msg.session ?? "", apiId: s.apiId, apiHash: s.apiHash };
  }
  if (msg.status === "password_needed") return { status: "password_needed", loginId: s.id };
  if (msg.status === "code_sent") return { status: "code_sent", loginId: s.id };
  const err = msg.error ?? "unknown";
  const terminal = ["code_expired", "login_process_exited", "login_timeout", "sign_in_failed", "password_failed"].includes(err);
  if (terminal) killSession(s);
  return { status: "error", error: err, detail: msg.detail };
}

/** Шаг 1: спавн процесса + send_code. Возвращает code_sent | error. */
export async function startLogin(apiId: string, apiHash: string, phone: string): Promise<LoginResult> {
  if (active) killSession(active); // один вход за раз
  const s = spawnSession(apiId, apiHash);
  active = s;
  resetIdle(s);
  writeCmd(s, { cmd: "send_code", phone });
  const msg = await readOne(s, 60_000);
  if (msg.status === "code_sent") return { status: "code_sent", loginId: s.id };
  killSession(s);
  return { status: "error", error: msg.error ?? "send_code_failed", detail: msg.detail };
}

/** Шаг 2: sign_in кодом. ok | password_needed | error. */
export async function submitCode(loginId: string, code: string): Promise<LoginResult> {
  const s = get(loginId);
  if (!s) return { status: "error", error: "session_expired" };
  resetIdle(s);
  writeCmd(s, { cmd: "sign_in", code });
  return finalize(s, await readOne(s));
}

/** Шаг 3 (при 2FA): check_password. ok | error. */
export async function submitPassword(loginId: string, password: string): Promise<LoginResult> {
  const s = get(loginId);
  if (!s) return { status: "error", error: "session_expired" };
  resetIdle(s);
  writeCmd(s, { cmd: "check_password", password });
  return finalize(s, await readOne(s));
}

/** Отмена/закрытие мастера — убить процесс, чтобы не висел Telegram-коннект. */
export function cancelLogin(loginId: string): void {
  const s = get(loginId);
  if (s) killSession(s);
}
