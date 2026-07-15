// Симулирует первый запуск: бэкапит текущие Setting{secrets}/Setting{onboarding} в отдельную строку БД,
// затем очищает их — любая защищённая страница (/, /presets, /volumes) редиректнёт на /onboarding, как
// у нового пользователя. Бэкап живёт в БД (Setting{key:"_onboarding_test_backup"}), не в файле — переживает
// между терминальными сессиями, ничего не теряется при рестарте машины.
// Запуск: npm run onboarding:reset. Восстановить реальные ключи: npm run onboarding:restore.
import "dotenv/config";
import { prisma } from "../src/lib/db";

const BACKUP_KEY = "_onboarding_test_backup";

async function main() {
  const existingBackup = await prisma.setting.findUnique({ where: { key: BACKUP_KEY } });
  if (existingBackup) {
    console.error(
      "⚠️  Бэкап уже существует — реальные секреты уже подменены тестовыми с прошлого раза.\n" +
        "   Сначала восстанови: npm run onboarding:restore"
    );
    process.exit(1);
  }

  const [secrets, onboarding] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "secrets" } }),
    prisma.setting.findUnique({ where: { key: "onboarding" } }),
  ]);

  await prisma.setting.create({
    data: {
      key: BACKUP_KEY,
      value: {
        secrets: secrets?.value ?? null,
        onboarding: onboarding?.value ?? null,
        savedAt: new Date().toISOString(),
      },
    },
  });

  await prisma.setting.deleteMany({ where: { key: "secrets" } });
  await prisma.setting.upsert({
    where: { key: "onboarding" },
    create: { key: "onboarding", value: { completed: false } },
    update: { value: { completed: false } },
  });

  console.log("🧪 Симулирован первый запуск: реальные ключи очищены (бэкап сохранён в БД), флаг онбординга сброшен.");
  console.log("   Открой http://localhost:3000/ — редиректнёт на /onboarding.");
  console.log("   Восстановить реальные ключи: npm run onboarding:restore");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
