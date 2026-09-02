import { useCallback, useMemo, useRef, useState } from "react";
import { SummaryCard } from "./components/SummaryCard";
import { RawJsonModal } from "./components/RawJsonModal";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { DynamicNode } from "./components/DynamicNode";
import { IconSearch, IconLoader, IconAlert, IconCopy, IconCheck, IconCode, IconLayers, svgProps } from "./components/Icons";
import { maskCNPJ, onlyDigits, isValidCNPJ, isPlainObject, countFilled, countLeaves, prettifyKey } from "./utils/format";

const API_BASE = "https://publica.cnpj.ws/cnpj/";

export default function App() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copiedTop, setCopiedTop] = useState(false);
  const abortRef = useRef(null);

  const handleSearch = useCallback(async () => {
    const digits = onlyDigits(raw);
    setError("");
    setData(null);
    if (!digits) {
      setError("Informe um CNPJ para consultar.");
      return;
    }
    if (!isValidCNPJ(digits)) {
      setError("CNPJ inválido. Confira os números digitados.");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}${digits}`, { signal: controller.signal });
      if (!res.ok) {
        if (res.status === 404) throw new Error("CNPJ não encontrado na base de dados da Receita Federal.");
        if (res.status === 429) throw new Error("Muitas consultas em pouco tempo. Aguarde alguns instantes e tente novamente.");
        throw new Error(`Não foi possível concluir a consulta (erro ${res.status}).`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      if (err.name === "AbortError") setError("A consulta demorou demais e foi cancelada. Tente novamente.");
      else setError(err.message || "Erro inesperado ao consultar o CNPJ. Verifique sua conexão.");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [raw]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const filled = useMemo(() => (data ? countFilled(data) : 0), [data]);
  const total = useMemo(() => (data ? countLeaves(data) : 0), [data]);

  const copyTop = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedTop(true);
      setTimeout(() => setCopiedTop(false), 1800);
    } catch (e) {
      /* clipboard unavailable */
    }
  };

  const entries = data ? Object.entries(data) : [];
  const simpleEntries = entries.filter(([, v]) => !isPlainObject(v) && !Array.isArray(v));
  const complexEntries = entries.filter(([, v]) => isPlainObject(v) || Array.isArray(v));

  return (
    <div className="shell">
      <header style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-eyebrow" style={{ marginBottom: 4 }}>
            Receita Federal · dados públicos
          </div>
          <h1 className="display" style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            Consulta de CNPJ
          </h1>
        </div>
        <span className="chip mono">publica.cnpj.ws</span>
      </header>

      <div className="card" style={{ padding: 20, marginBottom: 22 }}>
        <label htmlFor="cnpj-input" className="field-label" style={{ display: "block", marginBottom: 8 }}>
          CNPJ
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="cnpj-input"
            className={"input" + (error ? " has-error" : "")}
            style={{ flex: "1 1 260px" }}
            placeholder="00.000.000/0000-00"
            value={raw}
            onChange={(e) => setRaw(maskCNPJ(e.target.value))}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            autoComplete="off"
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading} style={{ flex: "0 0 auto" }}>
            {loading ? <IconLoader {...svgProps(17)} /> : <IconSearch {...svgProps(17)} />}
            {loading ? "Consultando…" : "Consultar"}
          </button>
        </div>
        {error && (
          <div className="alert alert-danger" style={{ marginTop: 14 }}>
            <IconAlert {...svgProps(18)} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {loading && !data && (
        <div className="card" style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
          <IconLoader {...svgProps(26)} />
          <span style={{ fontSize: 14 }}>Buscando dados na Receita Federal…</span>
        </div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <SummaryCard data={data} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge badge-neutral mono">
                {filled} / {total} campos preenchidos
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={copyTop}>
                {copiedTop ? <IconCheck {...svgProps(15)} /> : <IconCopy {...svgProps(15)} />}
                {copiedTop ? "JSON copiado" : "Copiar JSON"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowRaw(true)}>
                <IconCode {...svgProps(15)} /> Ver JSON bruto
              </button>
            </div>
          </div>

          <div>
            <h3 className="display" style={{ fontSize: 15, fontWeight: 700, margin: "4px 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <IconLayers {...svgProps(16)} /> Todos os dados retornados
            </h3>

            {simpleEntries.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                <div className="grid gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  {simpleEntries.map(([k, v]) => (
                    <div key={k}>
                      <div className="field-label" style={{ marginBottom: 3 }}>
                        {prettifyKey(k)}
                      </div>
                      <DynamicNode fieldKey={k} value={v} depth={0} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {complexEntries.map(([k, v]) => {
                const count = Array.isArray(v) ? v.length : Object.keys(v).length;
                const meta = Array.isArray(v) ? `${count} ${count === 1 ? "item" : "itens"}` : `${count} ${count === 1 ? "campo" : "campos"}`;
                return (
                  <CollapsibleSection key={k} title={prettifyKey(k)} meta={meta}>
                    <DynamicNode fieldKey={k} value={v} depth={0} />
                  </CollapsibleSection>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="card" style={{ padding: 36, textAlign: "center", color: "var(--text-muted)" }}>
          <IconSearch {...svgProps(24)} style={{ margin: "0 auto 10px", opacity: 0.6 }} />
          <div style={{ fontSize: 14.5 }}>Digite um CNPJ acima para ver a situação cadastral, endereço e todos os dados públicos disponíveis.</div>
        </div>
      )}

      {showRaw && data && <RawJsonModal data={data} onClose={() => setShowRaw(false)} />}
    </div>
  );
}
