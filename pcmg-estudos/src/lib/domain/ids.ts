import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

/** Namespace fixo para gerar IDs determinísticos (evita duplicatas entre aparelhos). */
const NAMESPACE = "6f1c2a8e-3b7d-4c1e-9a5f-2d8b0c7e4a91";

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uuidv4();

export const stableId = (...parts: (string | number)[]): string => uuidv5(parts.join("|"), NAMESPACE);
