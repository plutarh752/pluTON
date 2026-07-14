// Ручной health-check Portals-авторизации: печатает «✅ Portals auth OK» или громкий баннер + exit 1.
// Запуск: npm run portals:health
import "dotenv/config";
import { assertPortalsAuth } from "../src/lib/portals";

assertPortalsAuth()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
