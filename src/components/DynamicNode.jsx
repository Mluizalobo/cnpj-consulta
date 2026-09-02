import { isPlainObject, smartFormat, prettifyKey } from "../utils/format";

const KIND_CLASS = {
  "bool-true": "badge badge-success",
  "bool-false": "badge badge-neutral",
  empty: "text-faint",
  mono: "mono",
  currency: "mono",
  date: "mono",
  text: "",
  number: "mono",
};

function ValueDisplay({ fieldKey, value }) {
  const f = smartFormat(fieldKey, value);
  if (f.kind === "bool-true" || f.kind === "bool-false") return <span className={KIND_CLASS[f.kind]}>{f.text}</span>;
  const cls = KIND_CLASS[f.kind] || "";
  return (
    <span
      className={"text-[14px] " + cls}
      style={{ color: f.kind === "empty" ? "var(--text-faint)" : "var(--text)", fontStyle: f.kind === "empty" ? "italic" : "normal" }}
    >
      {f.text}
    </span>
  );
}

export function DynamicNode({ fieldKey, value, depth }) {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0)
      return (
        <span className="text-faint text-[13px]" style={{ fontStyle: "italic" }}>
          Sem dados
        </span>
      );
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {entries.map(([ck, cv]) => (
          <FieldRow key={ck} label={prettifyKey(ck)} fieldKey={ck} value={cv} depth={depth + 1} />
        ))}
      </div>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <span className="text-faint text-[13px]" style={{ fontStyle: "italic" }}>
          Nenhum registro
        </span>
      );
    const allPrimitive = value.every((v) => !isPlainObject(v) && !Array.isArray(v));
    if (allPrimitive) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v, i) => (
            <span key={i} className="chip mono">
              {smartFormat(fieldKey, v).text}
            </span>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {value.map((item, i) => {
          const title = isPlainObject(item)
            ? item.nome_socio ||
              item.nome ||
              item.razao_social ||
              item.descricao ||
              (item.qualificacao_socio && item.qualificacao_socio.descricao) ||
              item.qual ||
              `Item ${i + 1}`
            : `Item ${i + 1}`;
          return (
            <div key={i} className="panel tree-line" style={{ padding: "12px 14px", borderLeftWidth: 2 }}>
              <div className="field-label" style={{ color: "var(--accent)", marginBottom: 6 }}>
                {String(title)}
              </div>
              <DynamicNode fieldKey={fieldKey} value={item} depth={depth + 1} />
            </div>
          );
        })}
      </div>
    );
  }
  return <ValueDisplay fieldKey={fieldKey} value={value} />;
}

export function FieldRow({ label, fieldKey, value, depth }) {
  const complex = isPlainObject(value) || Array.isArray(value);
  if (!complex) {
    return (
      <div style={{ minWidth: 0 }}>
        <div className="field-label" style={{ marginBottom: 3 }}>
          {label}
        </div>
        <DynamicNode fieldKey={fieldKey} value={value} depth={depth} />
      </div>
    );
  }
  return (
    <div className="panel" style={{ padding: 12, gridColumn: "1 / -1" }}>
      <div className="field-label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <DynamicNode fieldKey={fieldKey} value={value} depth={depth} />
    </div>
  );
}
