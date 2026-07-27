"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  codigo: string;
  descricao: string;
  ncm: string;
  cst: string;
  cfop: string;
  unidade: string;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  baseIcms: number | null;
  valorIcms: number | null;
  valorIpi: number | null;
  aliquotaIcms: number | null;
  aliquotaIpi: number | null;
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

function parseItems(lines: string[]): Item[] {
  const items: Item[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/[|;]/g, " ").replace(/\s+/g, " ").trim();
    const match = line.match(
      /^(\d{4,10})\s+(.+?)\s+(\d{8})\s+(\d{2,3})\s+(\d{4})\s+([A-Z]{1,3})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?$/i,
    );
    if (!match) continue;
    const values = match.slice(7).map((value) => money(value));
    items.push({
      codigo: match[1],
      descricao: match[2],
      ncm: match[3],
      cst: match[4],
      cfop: match[5],
      unidade: match[6].toUpperCase(),
      quantidade: values[0],
      valorUnitario: values[1],
      valorTotal: values[2],
      baseIcms: values[3] ?? null,
      valorIcms: values[4] ?? null,
      valorIpi: values[5] ?? null,
      aliquotaIcms: values[6] ?? null,
      aliquotaIpi: values[7] ?? null,
    });
  }
  return items;
}

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
    itens: parseItems(lines),
    informacoesComplementares: find(
      normalized,
      /INFORMA[ÇC][ÕO]ES COMPLEMENTARES\s*\n?([\s\S]+)$/i,
    ),
    textoOriginal: text,
  };
}

async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(3, 3200 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray =
      image.data[index] * 0.299 +
      image.data[index + 1] * 0.587 +
      image.data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 145));
    image.data[index] = contrasted;
    image.data[index + 1] = contrasted;
    image.data[index + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.94),
  );
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
      const prepared = await prepareImage(file);
      const result = await worker.recognize(prepared);
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

  function updateItem(index: number, patch: Partial<Item>) {
    setNota((current) => ({
      ...current,
      itens: current.itens.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addItem() {
    setNota((current) => ({
      ...current,
      itens: [
        ...current.itens,
        {
          codigo: "",
          descricao: "",
          ncm: "",
          cst: "",
          cfop: "",
          unidade: "UN",
          quantidade: null,
          valorUnitario: null,
          valorTotal: null,
          baseIcms: null,
          valorIcms: null,
          valorIpi: null,
          aliquotaIcms: null,
          aliquotaIpi: null,
        },
      ],
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
              <div className="itemsHeader">
                <div>
                  <p className="mini">PRODUTOS E SERVIÇOS</p>
                  <h3>{nota.itens.length} {nota.itens.length === 1 ? "item reconhecido" : "itens reconhecidos"}</h3>
                </div>
                <button className="linkButton addItem" onClick={addItem}>+ Adicionar item</button>
              </div>

              {nota.itens.length === 0 ? (
                <div className="itemsWarning">
                  <strong>A tabela não ficou legível nesta foto.</strong>
                  <p>Aproxime a câmera até as letras da tabela ficarem nítidas ou adicione as linhas manualmente.</p>
                  <button className="secondary compact" onClick={addItem}>Adicionar primeiro item</button>
                </div>
              ) : (
                <div className="itemsList">
                  {nota.itens.map((item, index) => (
                    <article className="itemCard" key={`${item.codigo}-${index}`}>
                      <div className="itemNumber">{String(index + 1).padStart(2, "0")}</div>
                      <label className="itemDescription">
                        <span>Descrição</span>
                        <input value={item.descricao} onChange={(event) => updateItem(index, { descricao: event.target.value })} />
                      </label>
                      <button
                        className="removeItem"
                        aria-label={`Remover item ${index + 1}`}
                        onClick={() => setNota((current) => ({ ...current, itens: current.itens.filter((_, itemIndex) => itemIndex !== index) }))}
                      >×</button>
                      <div className="itemFields">
                        <label><span>Código</span><input value={item.codigo} onChange={(event) => updateItem(index, { codigo: event.target.value })} /></label>
                        <label><span>NCM</span><input value={item.ncm} onChange={(event) => updateItem(index, { ncm: event.target.value })} /></label>
                        <label><span>CFOP</span><input value={item.cfop} onChange={(event) => updateItem(index, { cfop: event.target.value })} /></label>
                        <label><span>Un.</span><input value={item.unidade} onChange={(event) => updateItem(index, { unidade: event.target.value })} /></label>
                        <label><span>Qtd.</span><input inputMode="decimal" value={item.quantidade ?? ""} onChange={(event) => updateItem(index, { quantidade: money(event.target.value) })} /></label>
                        <label><span>Valor unit.</span><input inputMode="decimal" value={item.valorUnitario ?? ""} onChange={(event) => updateItem(index, { valorUnitario: money(event.target.value) })} /></label>
                        <label><span>Valor total</span><input inputMode="decimal" value={item.valorTotal ?? ""} onChange={(event) => updateItem(index, { valorTotal: money(event.target.value) })} /></label>
                        <label><span>ICMS</span><input inputMode="decimal" value={item.valorIcms ?? ""} onChange={(event) => updateItem(index, { valorIcms: money(event.target.value) })} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="subheading"><span>Dados gerais da nota</span></div>
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
