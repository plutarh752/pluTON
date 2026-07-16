#!/usr/bin/env python3
"""
Интерактивный вход в Telegram, управляемый по stdin/stdout (line-JSON) — держит ОДНО живое MTProto-
соединение на всё время мастера, потому что phone_code_hash из send_code() валиден только на том же
соединении, что и sign_in(). Спавнится Node'ом (src/lib/portalsLogin.ts) из UI /settings, а НЕ человеком:
поток «телефон → код → (2FA пароль)» вводится в браузере, а не в консоли (в отличие от portals_login.py,
который остаётся консольным фолбэком). Итог — Pyrogram session-строка, которую Node сохраняет в
зашифрованную БД (в браузер не отдаётся).

Протокол (по одной JSON-строке на команду; на каждую команду ровно один JSON-ответ, stdout flush'ится):
  ← {"cmd":"send_code","phone":"+..."}      → {"status":"code_sent"} | {"status":"error","error":...}
  ← {"cmd":"sign_in","code":"12345"}        → {"status":"ok","session":..,"user":..} (disconnect+exit)
                                             | {"status":"password_needed"}
                                             | {"status":"error","error":"code_invalid"}   (жив, повтор)
                                             | {"status":"error","error":"code_expired"}   (exit)
  ← {"cmd":"check_password","password":".."} → {"status":"ok",..} (exit) | {"status":"error",
                                                "error":"password_invalid"} (жив, повтор)
  ← {"cmd":"cancel"}                          → disconnect + exit

TELEGRAM_API_ID / TELEGRAM_API_HASH читаются из env (Node подмешивает из БД). Пароль 2FA используется
только для check_password (SRP) — не логируется и не хранится; session-строка пароль не содержит.
"""
import asyncio
import json
import os
import sys


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


async def main() -> None:
    try:
        from pyrogram import Client
        from pyrogram.errors import (
            PasswordHashInvalid,
            PhoneCodeExpired,
            PhoneCodeInvalid,
            PhoneNumberInvalid,
            RPCError,
            SessionPasswordNeeded,
        )
    except Exception as e:  # noqa: BLE001
        emit({"status": "error", "error": "pyrogram_missing", "detail": str(e)})
        return

    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        emit({"status": "error", "error": "api_creds_missing"})
        return

    client = Client("pluton_login", api_id=int(api_id), api_hash=api_hash, in_memory=True)
    try:
        await client.connect()
    except Exception as e:  # noqa: BLE001
        emit({"status": "error", "error": "connect_failed", "detail": str(e)})
        return

    phone: str | None = None
    phone_code_hash: str | None = None
    loop = asyncio.get_event_loop()

    async def finish() -> None:
        session_string = await client.export_session_string()
        me = await client.get_me()
        user = ("@" + me.username) if me.username else (me.first_name or str(me.id))
        emit({"status": "ok", "session": session_string, "user": user})

    try:
        while True:
            # stdin.readline блокирующий — уводим в executor, чтобы не держать event loop.
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:  # EOF: Node закрыл stdin
                break
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:  # noqa: BLE001
                emit({"status": "error", "error": "bad_command"})
                continue

            cmd = msg.get("cmd")
            if cmd == "send_code":
                phone = str(msg.get("phone", "")).strip()
                try:
                    sent = await client.send_code(phone)
                    phone_code_hash = sent.phone_code_hash
                    emit({"status": "code_sent"})
                except PhoneNumberInvalid:
                    emit({"status": "error", "error": "phone_invalid"})
                except RPCError as e:  # FloodWait и прочее
                    emit({"status": "error", "error": "send_code_failed", "detail": str(e)})

            elif cmd == "sign_in":
                if not phone or not phone_code_hash:
                    emit({"status": "error", "error": "no_code_sent"})
                    continue
                code = str(msg.get("code", "")).strip()
                try:
                    await client.sign_in(phone, phone_code_hash, code)
                    await finish()
                    break
                except SessionPasswordNeeded:
                    emit({"status": "password_needed"})
                except PhoneCodeInvalid:
                    emit({"status": "error", "error": "code_invalid"})  # остаёмся живы — повтор кода
                except PhoneCodeExpired:
                    emit({"status": "error", "error": "code_expired"})
                    break  # нужен новый код — выходим, Node начнёт заново
                except RPCError as e:
                    emit({"status": "error", "error": "sign_in_failed", "detail": str(e)})

            elif cmd == "check_password":
                password = str(msg.get("password", ""))
                try:
                    await client.check_password(password)
                    await finish()
                    break
                except PasswordHashInvalid:
                    emit({"status": "error", "error": "password_invalid"})  # живы — повтор пароля
                except RPCError as e:
                    emit({"status": "error", "error": "password_failed", "detail": str(e)})

            elif cmd == "cancel":
                break
            else:
                emit({"status": "error", "error": "unknown_cmd"})
    finally:
        try:
            await client.disconnect()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    asyncio.run(main())
