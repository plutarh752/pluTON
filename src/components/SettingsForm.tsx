"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ── формы настроек (значения приходят из settings-строк БД) ──
export type SettingsShape = {
  rates?: { ton_usd?: number; stars_usd?: number };
  fees?: { getgems_sale_pct?: number; gas_ton_per_tx?: number; tg_commission?: number };
  scan?: { cooldown_minutes?: number };
  weights?: Record<string, number>;
  thresholds?: { min_sales_7d?: number; min_sales_30d?: number; min_listings_for_p25?: number };
  tonapi?: { api_key?: string };
  watchlist?: WatchItem[];
};
export type WatchItem = { name?: string; slug?: string; address?: string };
export type RescoreState =
  | { status?: string; startedAt?: string; finishedAt?: string; totalListings?: number; error?: string }
  | null;

const n = (v: string) => (v === "" ? 0 : Number(v));

function Field({
  label,
  value,
  onChange,
  step = "any",
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(n(e.target.value))}
        className="w-40 rounded border border-neutral-300 bg-transparent px-2 py-1 tabular-nums dark:border-neutral-700"
      />
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export function SettingsForm({
  initial,
  dbAxes,
  rescore,
}: {
  initial: SettingsShape;
  dbAxes: string[];
  rescore: RescoreState;
}) {
  const router = useRouter();

  const [rates, setRates] = useState({ ton_usd: initial.rates?.ton_usd ?? 0, stars_usd: initial.rates?.stars_usd ?? 0 });
  const [fees, setFees] = useState({
    getgems_sale_pct: initial.fees?.getgems_sale_pct ?? 0,
    gas_ton_per_tx: initial.fees?.gas_ton_per_tx ?? 0,
    tg_commission: initial.fees?.tg_commission ?? 0,
  });
  const [cooldown, setCooldown] = useState(initial.scan?.cooldown_minutes ?? 15);
  const [thresholds, setThresholds] = useState({
    min_sales_7d: initial.thresholds?.min_sales_7d ?? 10,
    min_sales_30d: initial.thresholds?.min_sales_30d ?? 5,
    min_listings_for_p25: initial.thresholds?.min_listings_for_p25 ?? 5,
  });
  const [apiKey, setApiKey] = useState(initial.tonapi?.api_key ?? "");

  // веса: объединяем оси из settings и оси, реально встреченные в БД (динамические)
  const axisList = useMemo(() => {
    const s = new Set<string>([...Object.keys(initial.weights ?? {}), ...dbAxes]);
    return [...s].sort();
  }, [initial.weights, dbAxes]);
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    for (const a of axisList) w[a] = initial.weights?.[a] ?? 0;
    return w;
  });
  const weightSum = Object.values(weights).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  const [watchlist, setWatchlist] = useState<WatchItem[]>(initial.watchlist ?? []);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [rescoreState, setRescoreState] = useState<RescoreState>(rescore);
  const [rescoring, setRescoring] = useState(rescore?.status === "running");
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  function payload(): SettingsShape {
    return {
      rates,
      fees,
      scan: { cooldown_minutes: cooldown },
      weights,
      thresholds,
      tonapi: { api_key: apiKey },
      watchlist: watchlist.filter((w) => (w.address ?? "").trim() && (w.name ?? "").trim()),
    };
  }

  async function save(): Promise<boolean> {
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    });
    return r.ok;
  }

  async function onSave() {
    setSaving(true);
    setMsg("Сохраняю…");
    try {
      setMsg((await save()) ? "Сохранено ✓" : "Ошибка сохранения");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function pollRescore() {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      const s = await (await fetch("/api/rescore")).json();
      setRescoreState(s.state ?? null);
      if (!s.running) {
        clearInterval(poll.current);
        setRescoring(false);
        setMsg(s.state?.status === "success" ? `Пересчитано ✓ (${s.state.totalListings ?? 0} лотов)` : "Пересчёт завершён");
        router.refresh();
      }
    }, 2000);
  }

  async function onSaveAndRescore() {
    setSaving(true);
    setMsg("Сохраняю…");
    try {
      if (!(await save())) {
        setMsg("Ошибка сохранения");
        return;
      }
      setMsg("Запускаю пересчёт…");
      const r = await fetch("/api/rescore", { method: "POST" });
      if (r.status === 202) {
        setRescoring(true);
        setRescoreState({ status: "running", startedAt: new Date().toISOString() });
        pollRescore();
      } else if (r.status === 409) {
        setMsg("Пересчёт уже идёт");
        setRescoring(true);
        pollRescore();
      } else {
        setMsg("Не удалось запустить пересчёт");
      }
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || rescoring;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Курсы">
          <div className="flex flex-wrap gap-4">
            <Field label="TON → USD" value={rates.ton_usd} onChange={(v) => setRates({ ...rates, ton_usd: v })} hint="обновляется при скане" />
            <Field label="Stars → USD" value={rates.stars_usd} onChange={(v) => setRates({ ...rates, stars_usd: v })} hint="Stars-сегмент (V2)" />
          </div>
        </Card>

        <Card title="Комиссии">
          <div className="flex flex-wrap gap-4">
            <Field label="Getgems sale (доля)" value={fees.getgems_sale_pct} onChange={(v) => setFees({ ...fees, getgems_sale_pct: v })} hint="0.05 = 5%" />
            <Field label="Газ, TON/tx" value={fees.gas_ton_per_tx} onChange={(v) => setFees({ ...fees, gas_ton_per_tx: v })} />
            <Field label="TG commission" value={fees.tg_commission} onChange={(v) => setFees({ ...fees, tg_commission: v })} hint="Stars (V2)" />
          </div>
        </Card>

        <Card title="Скан">
          <Field
            label="Cooldown между сканами, мин"
            value={cooldown}
            onChange={setCooldown}
            step="1"
            hint="≠ 21-дневный вывод звёзд (это про частоту сканов)"
          />
        </Card>

        <Card title="Пороги базовой цены">
          <div className="flex flex-wrap gap-4">
            <Field label="min_sales_7d" value={thresholds.min_sales_7d} onChange={(v) => setThresholds({ ...thresholds, min_sales_7d: v })} step="1" hint="≥ → медиана продаж 7д" />
            <Field label="min_sales_30d" value={thresholds.min_sales_30d} onChange={(v) => setThresholds({ ...thresholds, min_sales_30d: v })} step="1" hint="иначе ≥ → медиана 30д" />
            <Field label="min_listings_for_p25" value={thresholds.min_listings_for_p25} onChange={(v) => setThresholds({ ...thresholds, min_listings_for_p25: v })} step="1" hint="иначе ≥ → p25 листингов" />
          </div>
        </Card>
      </div>

      <Card title="Веса осей редкости">
        <p className="mb-3 text-xs text-neutral-400">
          expected = base × (1 + Σ вес × ранг_редкости). Оси берутся из данных. Сумма весов ≈ {weightSum.toFixed(2)}
          {" "}(держи около 1 — тогда редчайший лот ≈ ×{(1 + weightSum).toFixed(2)} от базы).
        </p>
        {axisList.length === 0 ? (
          <p className="text-sm text-neutral-400">Осей ещё нет — запусти скан, чтобы наполнить attribute_rarity.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {axisList.map((axis) => (
              <Field key={axis} label={axis} value={weights[axis] ?? 0} onChange={(v) => setWeights({ ...weights, [axis]: v })} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Ключ tonapi">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-500">API key (пусто = free tier, 1 RPS)</span>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="не обязателен на free tier"
            className="w-full max-w-xl rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          />
        </label>
      </Card>

      <Card title="Watchlist коллекций">
        <p className="mb-3 text-xs text-neutral-400">Что сканируем. Адрес обязателен (EQ…); при сохранении заводится строка Collection.</p>
        <div className="space-y-2">
          {watchlist.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={w.name ?? ""}
                onChange={(e) => setWatchlist(watchlist.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="Название"
                className="w-40 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
              />
              <input
                value={w.slug ?? ""}
                onChange={(e) => setWatchlist(watchlist.map((x, j) => (j === i ? { ...x, slug: e.target.value } : x)))}
                placeholder="slug"
                className="w-32 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
              />
              <input
                value={w.address ?? ""}
                onChange={(e) => setWatchlist(watchlist.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))}
                placeholder="EQ… адрес коллекции"
                className="min-w-[280px] flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 font-mono text-xs dark:border-neutral-700"
              />
              <button
                type="button"
                onClick={() => setWatchlist(watchlist.filter((_, j) => j !== i))}
                className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                убрать
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWatchlist([...watchlist, { name: "", slug: "", address: "" }])}
            className="rounded border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            + коллекция
          </button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button
          onClick={onSave}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-40 dark:border-neutral-700"
        >
          Сохранить
        </button>
        <button
          onClick={onSaveAndRescore}
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {rescoring ? "Пересчёт идёт…" : "Сохранить и пересчитать"}
        </button>
        {msg && <span className="text-sm text-neutral-500">{msg}</span>}
        {!msg && rescoreState?.finishedAt && (
          <span className="text-sm text-neutral-400">
            последний пересчёт: {rescoreState.finishedAt.slice(0, 16).replace("T", " ")}
            {rescoreState.totalListings != null && ` · ${rescoreState.totalListings} лотов`}
          </span>
        )}
      </div>
    </div>
  );
}
