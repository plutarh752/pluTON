"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

// Трёхшаговая каскадная форма: Коллекция → Модель → Фон. Опции из gift-satellite (тот же источник,
// что и /search — имена совпадают). Сабмит → POST /api/presets → refresh страницы.
interface Named {
  name: string;
}

export function PresetForm() {
  const router = useRouter();
  const [collections, setCollections] = useState<Named[]>([]);
  const [models, setModels] = useState<Named[]>([]);
  const [backdrops, setBackdrops] = useState<Named[]>([]);
  const [collection, setCollection] = useState("");
  const [model, setModel] = useState("");
  const [backdrop, setBackdrop] = useState("");
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

  async function onCollection(name: string) {
    setCollection(name);
    setModel("");
    setBackdrop("");
    setModels([]);
    setBackdrops([]);
    setMsg(null);
    if (!name) return;
    setLoadingAttrs(true);
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

  async function onAdd() {
    if (!collection || !model || !backdrop) {
      setMsg("Заполни коллекцию, модель и фон");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionName: collection, modelName: model, backdropName: backdrop }),
      });
      if (r.status === 201) {
        setModel("");
        setBackdrop("");
        setMsg("Добавлено");
        router.refresh();
      } else if (r.status === 409) {
        setMsg("Такая комбинация уже сохранена");
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
            <select aria-label="Модель" value={model} onChange={(e) => setModel(e.target.value)} disabled={!collection || loadingAttrs} className={selectCls}>
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
            <select aria-label="Фон" value={backdrop} onChange={(e) => setBackdrop(e.target.value)} disabled={!collection || loadingAttrs} className={selectCls}>
              <option value="">{loadingAttrs ? "Загрузка…" : "Фон"}</option>
              {backdrops.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onAdd}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 font-label-caps text-label-caps uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={18} />
            {busy ? "Добавляю…" : "Добавить в избранное"}
          </button>
        </div>
      </div>
      {msg && <p className="mt-3 px-2 font-mono text-[11px] text-on-surface-variant">{msg}</p>}
    </div>
  );
}
