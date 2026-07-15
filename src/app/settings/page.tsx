import { unstable_noStore as noStore } from "next/cache";
import { getSecretsStatus } from "@/lib/secrets";
import { SettingsForm } from "@/components/SettingsForm";

// Экран «Настройки»: API-ключи (GIFT_SATELLITE_KEY/TONAPI_KEY/TELEGRAM_*) хранятся зашифрованными в БД,
// не в .env — чтобы шаринг папки с кодом не утаскивал реальные ключи (см. src/lib/secrets.ts).
// Без GIFT_SATELLITE_KEY остальные страницы редиректят сюда (src/lib/requireConfigured.ts).
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  noStore();
  const sp = await searchParams;
  const status = await getSecretsStatus();

  return (
    <main className="mx-auto max-w-container px-margin-mobile py-12 md:px-margin-desktop">
      <header className="mb-12">
        <h1 className="mb-2 font-headline-lg text-headline-lg text-primary">Настройки</h1>
        <p className="max-w-2xl text-on-surface-variant">
          API-ключи хранятся зашифрованными в базе данных, а не в файлах проекта — папкой с кодом можно
          безопасно делиться, ключи в неё не попадают. Введи их один раз здесь.
        </p>
      </header>
      <SettingsForm status={status} next={sp?.next ?? "/"} />
    </main>
  );
}
