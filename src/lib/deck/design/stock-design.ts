import { withVendorScripts } from "../../html/vendor-scripts";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { designRuntime, designStyle } from "../preview.generated";
import compatible from "../../../templates/deck-preview-compat.json";
import styles from "../../../templates/deck-design-style-compat.json";

export type StockDesignSetting = "design-runtime" | "design-style";
export const stockDesign = {"design-runtime":designRuntime,"design-style":designStyle};
/** Hashes identify reviewed whole stock blocks; custom scripts/styles are never accepted. */
export function isStockDesign(name: StockDesignSetting, value: string): boolean {
  if (value === stockDesign[name] || value === withVendorScripts(stockDesign[name])) return true;
  const hash = bytesToHex(sha256(new TextEncoder().encode(value)));
  return (name === "design-runtime" ? compatible.design : styles).includes(hash);
}
