"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { BackdropMultiSelect } from "./BackdropMultiSelect";
import { CollectionSelect } from "./CollectionSelect";
import { ModelSelect, type ModelPreviewView } from "./ModelSelect";
import type { Rates } from "@/lib/format";

// Каскадная форма: Коллекция → Модель → [Фоны]. Коллекция/Модель — кастомные dropdown'ы с миниатюрами
// и мин.ценой (нативный <select> картинки не рендерит). Опции из gift-satellite (тот же источник, что и
// /search — имена совпадают). Сабмит → POST /api/presets (upsert по коллекция+модель) → refresh.
interface Named {
  name: string;
}
interface Collection {
  name: string;
  telegramId?: string;
}
interface Attr {
  name: string;
  rarityPermille?: number;
}

const DEFAULT_RATES: Rates = { ton_usd: 1.78, stars_usd: 0.013 };

/** Убирает дубликаты по имени, сохраняя порядок (уникальные React-ключи в dropdown'ах). */
function uniqByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => x && typeof x.name === "string" && !seen.has(x.name) && seen.add(x.name));
}

export function PresetForm() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [floors, setFloors] = useState<Record<string, number>>({});
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [models, setModels] = useState<Named[]>([]);
  const [backdrops, setBackdrops] = useState<Attr[]>([]);
  const [modelPreviews, setModelPreviews] = useState<Record<string, ModelPreviewView>>({});
  const [collection, setCollection] = useState("");
  const [model, setModel] = useState("");
  const [selectedBackdrops, setSelectedBackdrops] = useState<string[]>([]);
  const [loadingAttrs, setLoadingAttrs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/collections");
        const d = await r.json();
        setCollections(Array.isArray(d.collections) ? d.collections : []);
        setFloors(d.floors ?? {});
        if (d.rates) setRates(d.rates);
        if (!r.ok) setMsg("Источник коллекций временно недоступен");
      } catch {
        setMsg("Источник коллекций временно недоступен");
      }
    })();
  }, []);

  async function onCollection(name: string) {
    setCollection(name);
    setModel("");
    setSelectedBackdrops([]);
    setModels([]);
    setBackdrops([]);
    setModelPreviews({});
    setMsg(null);
    if (!name) return;
    setLoadingAttrs(true);
    // Атрибуты (модели/фоны) и превью моделей — параллельно; превью может подтянуться позже (заполнит
    // миниатюры/цены в открытом списке), поэтому не блокируем им отрисовку моделей.
    fetch(`/api/model-previews?collection=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => {
        setModelPreviews(d.previews ?? {});
        if (d.rates) setRates(d.rates);
      })
      .catch(() => setModelPreviews({}));
    try {
      const r = await fetch(`/api/attributes?collection=${encodeURIComponent(name)}`);
      const d = await r.json();
      // Дедуп по имени: источник иногда даёт дубль (ловили модель «Rave» у Santa Hat) → неуникальные
      // React-ключи в dropdown'ах. Защищаемся на клиенте, независимо от свежести серверного кэша атрибутов.
      setModels(uniqByName(Array.isArray(d.models) ? d.models : []));
      setBackdrops(uniqByName(Array.isArray(d.backdrops) ? d.backdrops : []));
      if (!r.ok) setMsg("Атрибуты коллекции недоступны");
    } catch {
      setMsg("Атрибуты коллекции недоступны");
    } finally {
      setLoadingAttrs(false);
    }
  }

  function onModel(name: string) {
    setModel(name);
    setSelectedBackdrops([]);
    setMsg(null);
  }

  async function onAdd() {
    if (!collection || !model || selectedBackdrops.length === 0) {
      setMsg("Выбери коллекцию, модель и хотя бы один фон");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionName: collection, modelName: model, backdropNames: selectedBackdrops }),
      });
      if (r.status === 201 || r.status === 200) {
        const d = await r.json().catch(() => ({}));
        setModel("");
        setSelectedBackdrops([]);
        setMsg(d.updated ? "Обновлено" : "Добавлено");
        router.refresh();
      } else {
        const d = await r.json().catch(() => ({}));
        setMsg(d.error === "invalid_combination" ? "Недопустимая комбинация" : "Не удалось добавить");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-1">
        <div className="flex flex-col gap-1 md:flex-row md:items-stretch">
          <div className="flex-1">
            <CollectionSelect
              options={collections}
              floors={floors}
              rates={rates}
              selected={collection}
              onChange={onCollection}
            />
          </div>
          <div className="hidden w-px bg-outline-variant md:block" />
          <div className="flex-1">
            <ModelSelect
              options={models}
              selected={model}
              onChange={onModel}
              previews={modelPreviews}
              rates={rates}
              disabled={!collection || loadingAttrs}
              loading={loadingAttrs}
            />
          </div>
          <div className="hidden w-px bg-outline-variant md:block" />
          <div className="flex-1">
            <BackdropMultiSelect
              options={backdrops}
              selected={selectedBackdrops}
              onChange={setSelectedBackdrops}
              disabled={!collection || loadingAttrs}
            />
          </div>
        </div>
      </div>

      <button
        onClick={onAdd}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 font-label-caps text-label-caps uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50 md:w-auto"
      >
        <Plus size={18} />
        {busy ? "Сохраняю…" : "Добавить в избранное"}
      </button>

      {msg && <p className="mt-3 px-2 font-mono text-[11px] text-on-surface-variant">{msg}</p>}
    </div>
  );
}
