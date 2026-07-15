// Восстанавливает реальные секреты и флаг онбординга из бэкапа, сделанного npm run onboarding:reset.
// Запуск: npm run onboarding:restore.
import "dotenv/config";
import { prisma } from "../src/lib/db";

const BACKUP_KEY = "_onboarding_test_backup";

async function main() {
  const backup = await prisma.setting.findUnique({ where: { key: BACKUP_KEY } });
  if (!backup) {
    console.error("Бэкапа нет — нечего восстанавливать (npm run onboarding:reset его ещё не создавал).");
    process.exit(1);
  }
  const { secrets, onboarding } = backup.value as { secrets: object | null; onboarding: object | null };

  if (secrets) {
    await prisma.setting.upsert({
      where: { key: "secrets" },
      create: { key: "secrets", value: secrets },
      update: { value: secrets },
    });
  } else {
    await prisma.setting.deleteMany({ where: { key: "secrets" } });
  }

  if (onboarding) {
    await prisma.setting.upsert({
      where: { key: "onboarding" },
      create: { key: "onboarding", value: onboarding },
      update: { value: onboarding },
    });
  } else {
    await prisma.setting.deleteMany({ where: { key: "onboarding" } });
  }

  await prisma.setting.delete({ where: { key: BACKUP_KEY } });

  console.log("✅ Реальные секреты и флаг онбординга восстановлены, тестовый бэкап удалён.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
