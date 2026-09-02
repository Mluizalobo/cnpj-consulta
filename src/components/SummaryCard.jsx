import { useMemo } from "react";
import { formatCurrency, formatDate, formatCEP, onlyDigits, situacaoBadgeClass } from "../utils/format";
import { IconPin, IconBuilding, IconLayers, IconPhone, IconMail, IconGauge, IconHash, svgProps } from "./Icons";

function extractSummary(data) {
  const est = data.estabelecimento || {};
  const atividade = est.atividade_principal || data.atividade_principal || {};
  const cidade = est.cidade || {};
  const estado = est.estado || {};
  const enderecoParts = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(" ");
  const numeroCompl = [est.numero, est.complemento].filter(Boolean).join(", ");
  const endereco = [enderecoParts, numeroCompl, est.bairro].filter(Boolean).join(", ");
  const telefone =
    est.ddd1 && est.telefone1
      ? `(${est.ddd1}) ${est.telefone1}`
      : est.ddd2 && est.telefone2
      ? `(${est.ddd2}) ${est.telefone2}`
      : null;
  const inscricoes = est.inscricoes_estaduais || data.inscricoes_estaduais || [];
  return {
    razaoSocial: data.razao_social || "—",
    fantasia: est.nome_fantasia || null,
    situacao: est.situacao_cadastral || null,
    dataSituacao: est.data_situacao_cadastral || null,
    endereco: endereco || null,
    cep: est.cep || null,
    cidadeUf: cidade.nome && estado.sigla ? `${cidade.nome} / ${estado.sigla}` : estado.sigla || null,
    cnae: atividade.subclasse ? `${atividade.subclasse} — ${atividade.descricao}` : atividade.descricao || null,
    telefone,
    email: est.email || null,
    inscricoes,
    capitalSocial: data.capital_social,
    porte: data.porte && data.porte.descricao,
    naturezaJuridica: data.natureza_juridica && data.natureza_juridica.descricao,
    dataInicio: est.data_inicio_atividade || null,
  };
}

function SummaryItem({ icon, label, children }) {
  if (!children) return null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ color: "var(--accent)", marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="field-label" style={{ marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 14.5, color: "var(--text)", wordBreak: "break-word" }}>{children}</div>
      </div>
    </div>
  );
}

export function SummaryCard({ data }) {
  const s = useMemo(() => extractSummary(data), [data]);
  return (
    <div className="card" style={{ padding: "22px 22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 className="display" style={{ margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.25 }}>
            {s.razaoSocial}
          </h2>
          {s.fantasia && (
            <div className="text-muted" style={{ fontSize: 14, marginTop: 3 }}>
              {s.fantasia}
            </div>
          )}
        </div>
        {s.situacao && (
          <span className={situacaoBadgeClass(s.situacao)}>
            {s.situacao}
            {s.dataSituacao ? ` · ${formatDate(s.dataSituacao)}` : ""}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {s.porte && <span className="chip">{s.porte}</span>}
        {s.capitalSocial !== undefined && s.capitalSocial !== null && (
          <span className="chip mono">Capital social: {formatCurrency(s.capitalSocial)}</span>
        )}
        {s.dataInicio && <span className="chip mono">Início: {formatDate(s.dataInicio)}</span>}
      </div>

      <hr className="divider" style={{ margin: "18px 0" }} />

      <div className="grid gap-x-6 gap-y-5" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <SummaryItem icon={<IconPin {...svgProps(17)} />} label="Endereço">
          {s.endereco}
          {s.cep ? (
            <>
              <br />
              <span className="mono text-muted">{formatCEP(onlyDigits(s.cep))}</span>
            </>
          ) : null}
        </SummaryItem>
        <SummaryItem icon={<IconBuilding {...svgProps(17)} />} label="Cidade / UF">
          {s.cidadeUf}
        </SummaryItem>
        <SummaryItem icon={<IconLayers {...svgProps(17)} />} label="CNAE principal">
          {s.cnae}
        </SummaryItem>
        <SummaryItem icon={<IconPhone {...svgProps(17)} />} label="Telefone">
          {s.telefone}
        </SummaryItem>
        <SummaryItem icon={<IconMail {...svgProps(17)} />} label="E-mail">
          {s.email}
        </SummaryItem>
        <SummaryItem icon={<IconGauge {...svgProps(17)} />} label="Natureza jurídica">
          {s.naturezaJuridica}
        </SummaryItem>
      </div>

      {s.inscricoes && s.inscricoes.length > 0 && (
        <>
          <hr className="divider" style={{ margin: "18px 0" }} />
          <div className="field-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <IconHash {...svgProps(14)} /> Inscrições estaduais
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {s.inscricoes.map((ie, i) => (
              <span key={i} className={"badge " + (ie.ativo ? "badge-success" : "badge-neutral")}>
                {(ie.estado && ie.estado.sigla) || "—"} · <span className="mono">{ie.inscricao_estadual}</span> ·{" "}
                {ie.ativo ? "ativa" : "inativa"}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
