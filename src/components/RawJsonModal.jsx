import { useEffect, useMemo, useState } from "react";
import { IconCode, IconCopy, IconCheck, IconX, svgProps } from "./Icons";

export function RawJsonModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => JSON.stringify(data, null, 2), [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      /* clipboard unavailable */
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,10,9,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 760, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14.5 }}>
            <IconCode {...svgProps(17)} /> JSON bruto
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={copy}>
              {copied ? <IconCheck {...svgProps(15)} /> : <IconCopy {...svgProps(15)} />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button className="btn btn-icon" onClick={onClose} aria-label="Fechar">
              <IconX {...svgProps(16)} />
            </button>
          </div>
        </div>
        <div style={{ padding: 16, overflow: "auto" }}>
          <pre className="code-block mono" style={{ margin: 0 }}>
            {json}
          </pre>
        </div>
      </div>
    </div>
  );
}
