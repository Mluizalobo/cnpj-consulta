export const onlyDigits = (s) => (s || "").replace(/\D/g, "");

export function maskCNPJ(value) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length > 12) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
  if (d.length > 8) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/, "$1.$2.$3/$4");
  if (d.length > 5) return d.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, "$1.$2.$3");
  if (d.length > 2) return d.replace(/^(\d{2})(\d{0,3}).*/, "$1.$2");
  return d;
}

function cnpjCheckDigit(nums) {
  const weights =
    nums.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCNPJ(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const nums = c.split("").map(Number);
  if (cnpjCheckDigit(nums.slice(0, 12)) !== nums[12]) return false;
  if (cnpjCheckDigit(nums.slice(0, 13)) !== nums[13]) return false;
  return true;
}

export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function countFilled(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (Array.isArray(value)) return value.reduce((a, v) => a + countFilled(v), 0);
  if (isPlainObject(value)) return Object.values(value).reduce((a, v) => a + countFilled(v), 0);
  return 1;
}

export function countLeaves(value) {
  if (Array.isArray(value)) return value.reduce((a, v) => a + countLeaves(v), 0);
  if (isPlainObject(value)) return Object.values(value).reduce((a, v) => a + countLeaves(v), 0);
  return 1;
}

const currencyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatCurrency(value) {
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(n)) return String(value);
  return currencyFmt.format(n);
}

export function isDateLike(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);
}
export function formatDate(value) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}
export function formatCEP(digits) {
  return digits.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

const UPPER_TOKENS = new Set(["cnpj", "cep", "uf", "ddd", "id", "cnae", "ie", "ibge"]);
export function prettifyKey(key) {
  return String(key)
    .split("_")
    .map((tok) => {
      const low = tok.toLowerCase();
      if (UPPER_TOKENS.has(low)) return low.toUpperCase();
      return tok.charAt(0).toUpperCase() + tok.slice(1);
    })
    .join(" ");
}

export function smartFormat(key, value) {
  const k = String(key).toLowerCase();
  if (typeof value === "boolean") return { text: value ? "Sim" : "Não", kind: value ? "bool-true" : "bool-false" };
  if (value === null || value === undefined || value === "") return { text: "—", kind: "empty" };
  if (typeof value === "string") {
    if (k.includes("cnpj")) {
      const d = onlyDigits(value);
      if (d.length === 14) return { text: maskCNPJ(d), kind: "mono" };
    }
    if (k.includes("cep")) {
      const d = onlyDigits(value);
      if (d.length === 8) return { text: formatCEP(d), kind: "mono" };
    }
    if (k.includes("capital_social")) return { text: formatCurrency(value), kind: "currency" };
    if (isDateLike(value)) return { text: formatDate(value), kind: "date" };
    return { text: value, kind: "text" };
  }
  if (typeof value === "number") {
    if (k.includes("capital_social")) return { text: formatCurrency(value), kind: "currency" };
    return { text: String(value), kind: "number" };
  }
  return { text: String(value), kind: "text" };
}

export function situacaoBadgeClass(sit) {
  const s = (sit || "").toUpperCase();
  if (s.includes("ATIV")) return "badge badge-success";
  if (s.includes("BAIX")) return "badge badge-danger";
  if (s.includes("SUSPENS") || s.includes("INAPT") || s.includes("NULA")) return "badge badge-warning";
  return "badge badge-neutral";
}
