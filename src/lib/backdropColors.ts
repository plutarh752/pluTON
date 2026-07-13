// Палитра фонов Telegram-подарков. gift-satellite отдаёт у фонов ТОЛЬКО name + rarityPermille
// (цвета/hex нет — подтверждено probe'ом), поэтому образцы цвета берём из этой захардкоженной карты
// канонических имён Telegram-фонов → центральный hex. Имена — из ответов /gift/collection/:name.
// Неизвестное имя → нейтральный серый fallback (+ название текстом; реальный цвет всё равно виден
// на превью-картинке лота). Сортировка тёмный→светлый — по относительной яркости hex.

const FALLBACK = "#6B6F76";

// Центральные цвета фонов (приближения канонической палитры Telegram-подарков).
export const BACKDROP_HEX: Record<string, string> = {
  "Onyx Black": "#33363B",
  Black: "#202225",
  Gunmetal: "#2A3439",
  "Seal Brown": "#4A2A22",
  Chocolate: "#5A3826",
  "Midnight Blue": "#232D66",
  "Navy Blue": "#2E3D66",
  "Indigo Dye": "#26456B",
  "Dark Green": "#1F4A2E",
  "Marine Blue": "#1F5A82",
  "Hunter Green": "#35543E",
  "Tactical Pine": "#2F4436",
  Burgundy: "#7A2233",
  Carmine: "#AF1F3A",
  "English Violet": "#563C5C",
  "Ranger Green": "#3C4A34",
  "Rifle Green": "#414A38",
  "Gunship Green": "#4E5A34",
  Feldgrau: "#4D5D53",
  "Pine Green": "#2E6B4F",
  Sapphire: "#2B54A0",
  "Cobalt Blue": "#3157A8",
  "Celtic Blue": "#2A6BBE",
  "Camo Green": "#737846",
  Rosewood: "#9B5F5F",
  Chestnut: "#8E4A38",
  "Burnt Sienna": "#C46B3F",
  Copper: "#B87333",
  Cappuccino: "#A67B5B",
  Caramel: "#C0824C",
  Grape: "#6F4685",
  Purple: "#7B3FA0",
  "French Violet": "#8A24BE",
  Fandango: "#B23A8A",
  "Mexican Pink": "#E0248A",
  Raspberry: "#CE2A63",
  "Electric Indigo": "#6320EE",
  "Electric Purple": "#9330E6",
  "Dark Lilac": "#925E9E",
  "Steel Grey": "#6D7278",
  "Roman Silver": "#868C97",
  "Battleship Grey": "#808589",
  "French Blue": "#2A6EA6",
  Sapphirine: "#2B6FA6",
  "Azure Blue": "#2E82C9",
  "Deep Cyan": "#1F8AA6",
  "Neon Blue": "#3D6EF0",
  "Khaki Green": "#8A854E",
  "Light Olive": "#A39C57",
  Lemongrass: "#A2B255",
  Mustard: "#D6A82E",
  "Old Gold": "#C9A83A",
  "Satin Gold": "#C9A54B",
  "Pure Gold": "#E5BA2B",
  Amber: "#E0A526",
  Orange: "#E5842A",
  "Carrot Juice": "#E5781F",
  Persimmon: "#E5581F",
  "Fire Engine": "#CE2A2E",
  Tomato: "#E24B34",
  "Coral Red": "#E04B39",
  Strawberry: "#E04B62",
  "Jade Green": "#16A06B",
  Emerald: "#24B36B",
  "Shamrock Green": "#2E9E5B",
  Malachite: "#1FC24E",
  "Pacific Green": "#23A06E",
  Turquoise: "#30C4B4",
  Aquamarine: "#4CC7A6",
  "Pacific Cyan": "#1FA3C2",
  Moonstone: "#46A5B8",
  "Sky Blue": "#5FB0E0",
  "Silver Blue": "#8AA3B8",
  Cyberpunk: "#C42B8F",
  Lavender: "#AC8ED0",
  Pistachio: "#93C572",
  "Mint Green": "#6ED0A0",
  "Mystic Pearl": "#7FA8AE",
  "Desert Sand": "#D2B48C",
  Platinum: "#C7CAC6",
  "Ivory White": "#E8E3D5",
};

/** hex центрального цвета фона (или нейтральный серый для неизвестных имён). */
export function backdropColor(name: string | null | undefined): string {
  if (!name) return FALLBACK;
  return BACKDROP_HEX[name] ?? FALLBACK;
}

/** Известен ли фон в палитре (для сортировки неизвестных в конец). */
export function isKnownBackdrop(name: string | null | undefined): boolean {
  return !!name && name in BACKDROP_HEX;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** Относительная яркость sRGB hex (0=чёрный … 1=белый). Для сортировки тёмный→светлый. */
export function backdropLuminance(name: string | null | undefined): number {
  const { r, g, b } = hexToRgb(backdropColor(name));
  // перцептивная яркость (Rec. 709)
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

/** HSL из hex: h в градусах (0..360), s/l в 0..1. Нужен для группировки фонов по цветовой семье. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  let h = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

// Ниже этой насыщенности цвет считаем ахроматичным (чёрный/серый/белый) → отдельная семья в конце.
const ACHROMATIC_S = 0.12;

// Ранг цветовой семьи фона (фиксированный порядок радуги, ахроматичные — последними). Фоны одной семьи
// идут подряд; внутри семьи сортируем по яркости (тёмный→светлый).
function backdropFamilyRank(name: string): number {
  const { h, s } = hexToHsl(backdropColor(name));
  if (s < ACHROMATIC_S) return 8; // grey / black / white
  if (h < 15 || h >= 345) return 0; // red
  if (h < 45) return 1; // orange
  if (h < 70) return 2; // yellow
  if (h < 160) return 3; // green
  if (h < 195) return 4; // cyan
  if (h < 255) return 5; // blue
  if (h < 290) return 6; // purple / violet
  return 7; // magenta / pink
}

/**
 * Порядок фонов: сначала по ЦВЕТОВОЙ СЕМЬЕ (hue — одинаковые цвета идут рядом), внутри семьи —
 * тёмный→светлый по яркости. Ахроматичные (серые/чёрные/белые) — после цветных, тоже тёмный→светлый.
 * Неизвестные имена (серый fallback, нет в палитре) — в самый конец, по алфавиту.
 */
export function sortBackdropsDarkToLight(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ka = isKnownBackdrop(a);
    const kb = isKnownBackdrop(b);
    if (ka !== kb) return ka ? -1 : 1; // известные первыми
    if (!ka && !kb) return a.localeCompare(b);
    const fa = backdropFamilyRank(a);
    const fb = backdropFamilyRank(b);
    if (fa !== fb) return fa - fb; // группируем по цветовой семье
    return backdropLuminance(a) - backdropLuminance(b); // внутри семьи тёмный→светлый
  });
}
