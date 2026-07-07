import { Address } from "@ton/core";

// Raw TON-адрес (`0:hex`) → friendly (bounceable, url-safe: `EQ…`) — формат, который маркетплейсы
// понимают в URL. tonapi отдаёт item-адреса в raw, а getgems не резолвит raw в ссылке (открывается
// пустая страница); коллекции у нас уже в EQ. NFT — контракты → bounceable (EQ, не UQ), как у коллекции.
// `Address.parse` принимает и raw, и friendly → функция идемпотентна. Ошибка парсинга → возвращаем
// исходную строку (ссылка не станет хуже, чем была).
export function toFriendlyAddress(addr: string): string {
  try {
    return Address.parse(addr).toString({ urlSafe: true, bounceable: true });
  } catch {
    return addr;
  }
}
