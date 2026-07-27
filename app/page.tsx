"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

type Nota = {
  tipo: "DANFE";
  rede: "Mateus";
  numero: string;
  serie: string;
  chaveAcesso: string;
  emissao: string;
  naturezaOperacao: string;
  destinatario: {
    nome: string;
    cnpjCpf: string;
    endereco: string;
    municipio: string;
    uf: string;
    cep: string;
  };
  totais: {
    valorProdutos: number | null;
    valorNota: number | null;
    baseIcms: number | null;
    valorIcms: number | null;
  };
  transporte: {
    volumes: number | null;
    pesoBruto: number | null;
    pesoLiquido: number | null;
  };
  itens: Item[];
  informacoesComplementares: string;
  textoOriginal: string;
};

const emptyNota: Nota = {
  tipo: "DANFE",
  rede: "Mateus",
  numero: "",
  serie: "",
  chaveAcesso: "",
  emissao: "",
  naturezaOperacao: "",
  destinatario: {
    nome: "",
    cnpjCpf: "",
    endereco: "",
    municipio: "",
    uf: "",
    cep: "",
  },
  totais: {
    valorProdutos: null,
    valorNota: null,
    baseIcms: null,
    valorIcms: null,
  },
  transporte: {
    volumes: null,
    pesoBruto: null,
    pesoLiquido: null,
  },
  itens: [],
  informacoesComplementares: "",
  textoOriginal: "",
};

const digits = (value: string) => value.replace(/\D/g, "");
const money = (value?: string) =>
  value ? Number(value.replace(/\./g, "").replace(",", ".")) : null;
const find = (text: string, expression: RegExp) =>
  text.match(expression)?.[1]?.trim() ?? "";

function extractNota(text: string): Nota {
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const chave = normalized.match(/(?:\d[\s.]*){44}/)?.[0] ?? "";
  const cnpj = normalized.match(/\d{2}[.\s]\d{3}[.\s]\d{3}[/\s]\d{4}[-\s]\d{2}/)?.[0] ?? "";
  const cep = normalized.match(/\d{5}[-\s]\d{3}/)?.[0] ?? "";
  const date = normalized.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] ?? "";
  const totalCandidates = [...normalized.matchAll(/R\$\s*([\d.]+,\d{2})/gi)];
  const lastTotal = totalCandidates.at(-1)?.[1];
  const number = find(normalized, /N[º°o]?\s*(\d{4,12})/i);
  const serie = find(normalized, /S[EÉ]RIE\s*:?\s*(\d{1,4})/i);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const recipientIndex = lines.findIndex((line) => /DESTINAT[ÁA]RIO|REMETENTE/i.test(line));
  const recipientLine = recipientIndex >= 0 ? lines[recipientIndex + 1] ?? "" : "";

  return {
    ...emptyNota,
    numero: number,
    serie,
    chaveAcesso: digits(chave).slice(0, 44),
    emissao: date,
    naturezaOperacao: find(
      normalized,
      /NATUREZA DA OPERA[ÇC][ÃA]O\s*\n?([^\n]+)/i,
    ),
    destinatario: {
      ...emptyNota.destinatario,
      nome: recipientLine.replace(/\s+\d{2}[.\s]\d{3}.+$/, ""),
      cnpjCpf: cnpj,
      endereco: find(normalized, /ENDERE[ÇC]O\s*\n?([^\n]+)/i),
      municipio: find(normalized, /MUNIC[ÍI]PIO\s*\n?([^\n]+)/i),
      uf: find(normalized, /\bUF\s*\n?\s*([A-Z]{2})\b/i),
      cep,
    },
    totais: {
      ...emptyNota.totais,
      valorProdutos: money(
        find(normalized, /VALOR TOTAL DOS PRODUTOS[^\d]*([\d.]+,\d{2})/i),
      ),
      valorNota: money(
        find(normalized, /VALOR TOTAL DA NOTA[^\d]*([\d.]+,\d{2})/i),
      ) ?? money(lastTotal),
      baseIcms: money(
        find(normalized, /BASE DE C[ÁA]LCULO DO ICMS[^\d]*([\d.]+,\d{2})/i),
      ),
      valorIcms: money(
        find(normalized, /VALOR DO ICMS[^\d]*([\d.]+,\d{2})/i),
      ),
    },
    transporte: { ...emptyNota.transporte },
    informacoesComplementares: find(
      normalized,
      /INFORMA[ÇC][ÕO]ES COMPLEMENTARES\s*\n?([\s\S]+)$/i,
    ),
    textoOriginal: text,
  };
}

function Field({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [nota, setNota] = useState<Nota>(emptyNota);
  const [status, setStatus] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const json = useMemo(() => JSON.stringify(nota, null, 2), [nota]);

  async function scan() {
    if (!file) return;
    setStatus("reading");
    setProgress(2);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setProgress(Math.round((message.progress ?? 0) * 100));
          }
        },
      });
      const result = await worker.recognize(file);
      await worker.terminate();
      setNota(extractNota(result.data.text));
      setStatus("done");
      setProgress(100);
    } catch {
      setStatus("error");
    }
  }

  function patchRecipient(key: keyof Nota["destinatario"], value: string) {
    setNota((current) => ({
      ...current,
      destinatario: { ...current.destinatario, [key]: value },
    }));
  }

  async function copyJson() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadJson() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nota-mateus-${nota.numero || "digitalizada"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Nota Clara, início">
          <span className="brandMark">N</span>
          <span>Nota Clara</span>
        </a>
        <span className="privacy">Processamento no aparelho</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Leitor de notas Mateus</p>
          <h1>Da foto para dados,<br />sem digitação.</h1>
          <p className="lead">
            Fotografe o DANFE, confira os campos reconhecidos e gere um objeto
            pronto para integrar ao sistema da loja.
          </p>
        </div>
        <div className="stepRow" aria-label="Etapas">
          <span className={file ? "step complete" : "step active"}>1</span>
          <i />
          <span className={status === "done" ? "step complete" : file ? "step active" : "step"}>2</span>
          <i />
          <span className={status === "done" ? "step active" : "step"}>3</span>
        </div>
      </section>

      <section className="workspace">
        <div className="captureCard">
          <div className="sectionTitle">
            <div>
              <p className="mini">PASSO 01</p>
              <h2>Adicionar documento</h2>
            </div>
            {file && <button className="linkButton" onClick={() => { setFile(null); setStatus("idle"); setNota(emptyNota); }}>Trocar foto</button>}
          </div>

          {!preview ? (
            <label className="dropzone">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="cameraIcon">⌑</span>
              <strong>Fotografar ou escolher nota</strong>
              <small>Enquadre a folha inteira e evite sombras</small>
              <span className="selectButton">Selecionar imagem</span>
            </label>
          ) : (
            <div className="previewWrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Pré-visualização da nota fiscal" />
              {status === "reading" && (
                <div className="readingOverlay">
                  <span>Lendo documento… {progress}%</span>
                  <div><i style={{ width: `${progress}%` }} /></div>
                </div>
              )}
            </div>
          )}

          <button className="primary" disabled={!file || status === "reading"} onClick={scan}>
            {status === "reading" ? "Analisando nota…" : "Ler documento"}
          </button>
          <p className="localNote">A imagem permanece neste dispositivo.</p>
          {status === "error" && <p className="error">Não foi possível ler a imagem. Tente uma foto mais nítida.</p>}
        </div>

        <div className={`resultCard ${status !== "done" ? "muted" : ""}`}>
          <div className="sectionTitle">
            <div>
              <p className="mini">PASSO 02</p>
              <h2>Revisar dados</h2>
            </div>
            {status === "done" && <span className="badge">Padrão Mateus</span>}
          </div>

          {status !== "done" ? (
            <div className="emptyState">
              <span aria-hidden="true" />
              <strong>Os dados aparecerão aqui</strong>
              <p>Depois da leitura, você poderá corrigir qualquer campo antes de exportar.</p>
            </div>
          ) : (
            <>
              <div className="formGrid">
                <Field label="Número da nota" value={nota.numero} onChange={(numero) => setNota({ ...nota, numero })} />
                <Field label="Série" value={nota.serie} onChange={(serie) => setNota({ ...nota, serie })} />
                <Field label="Emissão" value={nota.emissao} onChange={(emissao) => setNota({ ...nota, emissao })} />
                <Field wide label="Chave de acesso" value={nota.chaveAcesso} onChange={(chaveAcesso) => setNota({ ...nota, chaveAcesso })} />
              </div>

              <div className="subheading"><span>Destinatário</span></div>
              <div className="formGrid">
                <Field wide label="Razão social" value={nota.destinatario.nome} onChange={(value) => patchRecipient("nome", value)} />
                <Field label="CNPJ / CPF" value={nota.destinatario.cnpjCpf} onChange={(value) => patchRecipient("cnpjCpf", value)} />
                <Field label="CEP" value={nota.destinatario.cep} onChange={(value) => patchRecipient("cep", value)} />
                <Field wide label="Endereço" value={nota.destinatario.endereco} onChange={(value) => patchRecipient("endereco", value)} />
              </div>

              <div className="actions">
                <button className="secondary" onClick={copyJson}>{copied ? "Copiado!" : "Copiar JSON"}</button>
                <button className="primary compact" onClick={downloadJson}>Baixar objeto</button>
              </div>
              <details>
                <summary>Visualizar objeto JSON</summary>
                <pre>{json}</pre>
              </details>
            </>
          )}
        </div>
      </section>

      <footer>
        <span>Primeiro protótipo · DANFE Mateus</span>
        <span>JPEG, PNG ou foto da câmera</span>
      </footer>
    </main>
  );
}
