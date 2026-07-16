import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// Живой прогресс прогонов «Получить цены»/«Получить объём» для прогресс-бара + консоль-лога в UI.
// Хранится в строке Setting (`progress:<kind>`), а НЕ в новой колонке — чтобы не гонять offline-миграцию
// (инв. 1). Воркер пишет прогресс throttled'ом; GET-статус читает его и отдаёт клиенту (гейт по runId,
// чтобы не показать прогресс прошлого прогона). Пишем best-effort — сбой записи прогресса НИКОГДА не
// должен ронять сам прогон.

export type RunKind = "prices" | "volume";

export interface RunProgress {
  runId: number;
  done: number; // выполнено единиц
  total: number; // всего единиц (0 → индикатор «идёт», процент неизвестен)
  label: string; // что тянется прямо сейчас — строка живого лога
  phase: string; // грубая стадия («Опрос маркетов…», «Сбор объёма…»)
  ts: number; // epoch ms последнего обновления
}

const keyFor = (kind: RunKind) => `progress:${kind}`;

export async function setRunProgress(kind: RunKind, p: RunProgress): Promise<void> {
  try {
    const value = p as unknown as Prisma.InputJsonValue;
    await prisma.setting.upsert({
      where: { key: keyFor(kind) },
      create: { key: keyFor(kind), value },
      update: { value },
    });
  } catch {
    // прогресс — вспомогательный; молча игнорируем сбой записи, прогон продолжается.
  }
}

export async function getRunProgress(kind: RunKind): Promise<RunProgress | null> {
  const row = await prisma.setting.findUnique({ where: { key: keyFor(kind) } });
  const v = row?.value as Partial<RunProgress> | undefined;
  if (!v || typeof v.runId !== "number") return null;
  return {
    runId: v.runId,
    done: v.done ?? 0,
    total: v.total ?? 0,
    label: v.label ?? "",
    phase: v.phase ?? "",
    ts: v.ts ?? 0,
  };
}

export async function clearRunProgress(kind: RunKind): Promise<void> {
  try {
    await prisma.setting.deleteMany({ where: { key: keyFor(kind) } });
  } catch {
    /* best-effort */
  }
}

/**
 * Репортер прогресса для воркера: копит текущее состояние и пишет в БД throttled'ом (не чаще
 * `minIntervalMs`), чтобы сотни шагов не превратились в сотни round-trip'ов в Neon. Смена стадии/итога
 * пишется немедленно (`force`), покадровые инкременты — по таймеру. `flush()` — финальная запись.
 */
export function createProgress(kind: RunKind, runId: number, minIntervalMs = 500) {
  let state: RunProgress = { runId, done: 0, total: 0, label: "", phase: "Запуск…", ts: Date.now() };
  let lastWrite = 0;
  let writing = false;

  async function write() {
    if (writing) return; // не наслаивать записи (last-writer-wins и так, но бережём соединение)
    writing = true;
    lastWrite = Date.now();
    await setRunProgress(kind, { ...state, ts: Date.now() });
    writing = false;
  }

  return {
    /** Обновить поля прогресса. `force` (смена фазы/итог) пишет сразу; иначе — не чаще minIntervalMs. */
    async update(patch: Partial<Omit<RunProgress, "runId" | "ts">>, force = false): Promise<void> {
      state = { ...state, ...patch };
      if (force || Date.now() - lastWrite >= minIntervalMs) await write();
    },
    /** Финальная запись текущего состояния (гарантированно). */
    async flush(): Promise<void> {
      writing = false;
      await write();
    },
  };
}
