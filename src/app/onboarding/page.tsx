import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getSecretsStatus } from "@/lib/secrets";
import { getOnboardingCompleted } from "@/lib/onboarding";
import { OnboardingForm } from "@/components/OnboardingForm";

// Экран первого запуска: только то, что нужно для локальной работы (API-ключи в БД, инв. 10) — никакого
// облачного деплоя, приложение запускается только локально (npm run dev). Уже прошедших онбординг сюда
// не пускаем — сразу редиректим в next (или «/»), чтобы гайд не показывался повторно.
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  noStore();
  const sp = await searchParams;
  const next = sp?.next ?? "/";

  if (await getOnboardingCompleted()) {
    redirect(next);
  }

  const status = await getSecretsStatus();

  // Полноэкранный мастер: заставка «PluTON» → шаги-поля → «Готово». Хедер/центрирование живут внутри
  // OnboardingForm (каждый шаг сам себя центрирует); хром приложения на этом роуте скрыт (см. Nav/Footer).
  return (
    <main className="min-h-[100dvh]">
      <OnboardingForm status={status} next={next} />
    </main>
  );
}
