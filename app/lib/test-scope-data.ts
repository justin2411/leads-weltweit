/** Freigabe-Liste für Tests aus config/fokus.yaml (über lib/ops-config.json, erzeugt von scripts/ops-config.mjs). */
import ops from "@/lib/ops-config.json";
import type { TestScope } from "@/lib/test-scope";

export const TEST_SCOPE: TestScope = (ops as { tests?: TestScope }).tests ?? { segmente: [], laender: [] };
