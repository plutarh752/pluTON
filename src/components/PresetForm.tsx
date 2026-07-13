"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { BackdropMultiSelect } from "./BackdropMultiSelect";
import { PreviewPanel } from "./PreviewPanel";

// Каскадная форма: Коллекция → Модель → [Фоны] (мультивыбор с образцами цвета). Опции из gift-satellite
// (тот же источник, что и /search — имена совпадают). Превью подарка + floor коллекции — в панели справа
// (после выбора модели). Сабмит → POST /api/presets (upsert по коллекция+модель) → refresh.
interface Named {
  name: string;
}
interface Attr {
  name: string;
  rarityPermille?: number;
}
interface Preview {
  imageUrl: string | null;
  floorTon: number | null;
  floorUsd: number | null;
  floorStars: number | null;
}

export function PresetForm() {
  const router = useRouter();
  const [collections, setCollections] = useState<Named[]>([]);
  const [models, setModels] = useState<Named[]>([]);
  const [backdrops, setBackdrops] = useState<Attr[]>([]);
  const [collection, setCollection] = useState("");
  const [model, setModel] = useState("");
  const [selectedBackdrops, setSelectedBackdrops] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loadingAttrs, setLoadingAttrs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/collections");
        const d = await r.json();
        setCollections(Array.isArray(d.collections) ? d.collections : []);
        if (!r.ok) setMsg("Источник коллекций временно недоступен");
      } catch {
        setMsg("Источник коллекций временно недоступен");
      }
    })();
  }, []);

  async function fetchPreview(col: string, mdl: string) {
    if (!col) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const qs = new URLSearchParams({ collection: col });
      if (mdl) qs.set("model", mdl);
      const r = await fetch(`/api/preview?${qs.toString()}`);
      const d = await r.json();
      setPreview({
        imageUrl: d.imageUrl ?? null,
        floorTon: d.floorTon ?? null,
        floorUsd: d.floorUsd ?? null,
        floorStars: d.floorStars ?? null,
      });
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onCollection(name: string) {
    setCollection(name);
    setModel("");
    setSelectedBackdrops([]);
    setModels([]);
    setBackdrops([]);
    setPreview(null);
    setMsg(null);
    if (!name) return;
    setLoadingAttrs(true);
    fetchPreview(name, "");
    try {
      const r = await fetch(`/api/attributes?collection=${encodeURIComponent(name)}`);
      const d = await r.json();
      setModels(Array.isArray(d.models) ? d.models : []);
      setBackdrops(Array.isArray(d.backdrops) ? d.backdrops : []);
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
    if (name) fetchPreview(collection, name);
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
        setPreview(null);
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

  const selectCls =
    "w-full cursor-pointer bg-transparent px-6 py-4 font-label-caps text-label-caps text-on-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-1">
          <div className="flex flex-col gap-1 md:flex-row md:items-stretch">
            <div className="flex-1">
              <select aria-label="Коллекция" value={collection} onChange={(e) => onCollection(e.target.value)} className={selectCls}>
                <option value="">Коллекция</option>
                {collections.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="hidden w-px bg-outline-variant md:block" />
            <div className="flex-1">
              <select aria-label="Модель" value={model} onChange={(e) => onModel(e.target.value)} disabled={!collection || loadingAttrs} className={selectCls}>
                <option value="">{loadingAttrs ? "Загрузка…" : "Модель"}</option>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
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

      <PreviewPanel
        collection={collection}
        model={model}
        imageUrl={preview?.imageUrl ?? null}
        floorTon={preview?.floorTon ?? null}
        floorUsd={preview?.floorUsd ?? null}
        floorStars={preview?.floorStars ?? null}
        backdrops={selectedBackdrops}
        loading={previewLoading}
      />
    </div>
  );
}
