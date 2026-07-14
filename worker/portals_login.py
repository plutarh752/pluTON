#!/usr/bin/env python3
"""
Одноразовый интерактивный вход в Telegram → печатает Pyrogram session-строку для headless-минта tma
(Portals-авторизация вкладки «Объёмы»). ТРЕБУЕТ живого ввода номера телефона + кода подтверждения.

Запуск:  npm run portals:login   (или: python3 worker/portals_login.py)
Нужны env TELEGRAM_API_ID / TELEGRAM_API_HASH (my.telegram.org → API development tools). Скрипт запросит
телефон и код. Полученную строку положи в .env как TELEGRAM_SESSION (и в Railway-variables на проде).
Сессия не хранит пароль; при 2FA спросит облачный пароль. Строку НЕ коммитить.
"""
import asyncio
import os
import sys


async def main() -> None:
    try:
        from pyrogram import Client
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"pyrogram import failed ({e}); pip install -r requirements.txt\n")
        sys.exit(1)

    api_id = os.environ.get("TELEGRAM_API_ID") or input("TELEGRAM_API_ID: ").strip()
    api_hash = os.environ.get("TELEGRAM_API_HASH") or input("TELEGRAM_API_HASH: ").strip()
    if not api_id or not api_hash:
        sys.stderr.write("Нужны TELEGRAM_API_ID и TELEGRAM_API_HASH (my.telegram.org)\n")
        sys.exit(1)

    async with Client("pluton_login", api_id=int(api_id), api_hash=api_hash, in_memory=True) as app:
        session_string = await app.export_session_string()
        me = await app.get_me()
        print("\n" + "=" * 70)
        print(f"✅ Вход выполнен как @{me.username or me.id}. Скопируй строку ниже в .env:")
        print("=" * 70)
        print(f"\nTELEGRAM_SESSION={session_string}\n")


if __name__ == "__main__":
    asyncio.run(main())
