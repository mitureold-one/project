"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  setor: "panificacao" | "darkstore" | "desconhecido";
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
    valorFrete: number | null;
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
  setor: "desconhecido",
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
    valorFrete: null,
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
  const candidateLines = [...lines];
  for (let index = 0; index < lines.length - 1; index++) {
    const current = lines[index].replace(/\s+/g, " ").trim();
    const next = lines[index + 1].replace(/\s+/g, " ").trim();
    const startsLikeProduct = /^[^\dA-Z]*[0-9OS]{2,10}\s+[A-ZÀ-Ú]/i.test(current);
    const hasFiscalColumns = /[0-9OSQ]{8}\s+(?:\||\[|\s)/i.test(current);
    if (startsLikeProduct && !hasFiscalColumns && /[0-9OSQ]{8}/i.test(next)) {
      candidateLines.push(`${current} ${next}`);
    }
  }
  const fiscalDigits = (value: string) =>
    value
      .toUpperCase()
      .replace(/[OQ]/g, "0")
      .replace(/S/g, "5")
      .replace(/\D/g, "");
  const tolerantMoney = (value?: string) => {
    if (!value) return null;
    const cleaned = value
      .toUpperCase()
      .replace(/[€C]/g, "0")
      .replace(/[^\d.,]/g, "");
    return money(cleaned);
  };
  for (const rawLine of candidateLines) {
    const line = rawLine
      .replace(/[|;[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const match = line.match(
      /^[^\dA-Z]*([0-9OS]{2,10})\s+(.+?)\s+([0-9OSQ]{8})\s+([0-9A-Z.]{3,4})\s+([0-9OSQ]{4})\s+(UN|UM|IN|JN|NS|KG|LT|CX|SO)\s+([0-9S]{1,3})\s+([\d.,€C]+)(?:\s+([\d.,€C$S]+))?/i,
    );
    if (!match) continue;
    const codigo = fiscalDigits(match[1]);
    const ncm = fiscalDigits(match[3]);
    const cst = match[4]
      .toUpperCase()
      .replace(/\./g, "")
      .replace(/O/g, "0")
      .replace(/S/g, "6")
      .replace(/\D/g, "")
      .slice(-3);
    const cfop = fiscalDigits(match[5]);
    const quantidade = Number(match[7].toUpperCase().replace(/S/g, "5"));
    const valorUnitario = tolerantMoney(match[8]);
    const detectedTotal = tolerantMoney(match[9]);
    const calculatedTotal =
      valorUnitario !== null
        ? Number((quantidade * valorUnitario).toFixed(2))
        : null;
    const valorTotal =
      detectedTotal !== null &&
      calculatedTotal !== null &&
      Math.abs(detectedTotal - calculatedTotal) <= 0.011
        ? detectedTotal
        : calculatedTotal ?? detectedTotal;
    if (
      !codigo ||
      ncm.length !== 8 ||
      cst.length !== 3 ||
      cfop.length !== 4 ||
      !Number.isFinite(quantidade) ||
      quantidade <= 0 ||
      valorUnitario === null
    ) {
      continue;
    }
    if (items.some((item) => item.codigo === codigo && item.ncm === ncm)) continue;
    items.push({
      codigo,
      descricao: match[2]
        .replace(/^[^A-ZÀ-Ú0-9]+/i, "")
        .replace(/\s+(UN|UM)$/i, "")
        .trim(),
      ncm,
      cst,
      cfop,
      unidade: ["UM", "IN", "JN", "NS", "SO"].includes(match[6].toUpperCase())
        ? "UN"
        : match[6].toUpperCase(),
      quantidade,
      valorUnitario,
      valorTotal,
      baseIcms: null,
      valorIcms: null,
      valorIpi: null,
      aliquotaIcms: null,
      aliquotaIpi: null,
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
  const items = parseItems(lines);
  const itemsTotal = Number(
    items.reduce((sum, item) => sum + (item.valorTotal ?? 0), 0).toFixed(2),
  );
  const currencyValuesNear = (label: RegExp, count: number) => {
    const index = normalized.search(label);
    if (index < 0) return [] as number[];
    return [...normalized.slice(index, index + 650).matchAll(/R\$\s*([\d.,]+)/gi)]
      .slice(0, count)
      .map((entry) => money(entry[1]))
      .filter((value): value is number => value !== null);
  };
  const taxRow = currencyValuesNear(/VALOR TOTAL DOS PRODUTO/i, 5);
  const totalsRow = currencyValuesNear(/VALOR TOTAL DA NOTA/i, 6);
  const detectedProducts = taxRow.length >= 5 ? taxRow[4] : null;
  const detectedFreight = totalsRow.length >= 1 ? totalsRow[0] : null;
  const detectedInvoiceTotal = totalsRow.length >= 6 ? totalsRow[5] : null;
  const recipientIndex = lines.findIndex((line) => /DESTINAT[ÁA]RIO|REMETENTE/i.test(line));
  const recipientLine = recipientIndex >= 0 ? lines[recipientIndex + 1] ?? "" : "";

  return {
    ...emptyNota,
    setor: /MATEUS\s*EXPRESS|DELIVERY|DARKSTORE/i.test(normalized)
      ? "darkstore"
      : /PANIFICA/i.test(normalized)
        ? "panificacao"
        : "desconhecido",
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
      valorProdutos: detectedProducts ?? money(
        find(normalized, /VALOR TOTAL DOS PRODUTOS[^\d]*([\d.]+,\d{2})/i),
      ) ?? (itemsTotal || null),
      valorNota: (() => {
        if (detectedInvoiceTotal && detectedInvoiceTotal > 0) return detectedInvoiceTotal;
        const detected =
          money(find(normalized, /VALOR TOTAL DA NOTA[^\d]*([\d.]+,\d{2})/i)) ??
          money(lastTotal);
        return detected && detected > 0 ? detected : itemsTotal || null;
      })(),
      baseIcms: money(
        find(normalized, /BASE DE C[ÁA]LCULO DO ICMS[^\d]*([\d.]+,\d{2})/i),
      ),
      valorIcms: money(
        find(normalized, /VALOR DO ICMS[^\d]*([\d.]+,\d{2})/i),
      ),
      valorFrete: detectedFreight,
    },
    transporte: { ...emptyNota.transporte },
    itens: items,
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

function CameraScanner({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastPixels = useRef<Uint8ClampedArray | null>(null);
  const readyFrames = useRef(0);
  const captured = useRef(false);
  const [message, setMessage] = useState("Iniciando câmera…");
  const [quality, setQuality] = useState<"waiting" | "warn" | "ready">("waiting");
  const [autoCapture, setAutoCapture] = useState(true);
  const [error, setError] = useState("");

  function stopCamera() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || captured.current) return;
    captured.current = true;
    const cropX = Math.round(video.videoWidth * 0.06);
    const cropY = Math.round(video.videoHeight * 0.035);
    const cropWidth = Math.round(video.videoWidth * 0.88);
    const cropHeight = Math.round(video.videoHeight * 0.93);
    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    canvas.getContext("2d")?.drawImage(
      video,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    canvas.toBlob((blob) => {
      if (!blob) {
        captured.current = false;
        return;
      }
      stopCamera();
      onCapture(new File([blob], `danfe-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.96);
  }

  useEffect(() => {
    let active = true;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 160;
    sampleCanvas.height = 120;
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
    let lastCheck = 0;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const analyze = (time: number) => {
          const video = videoRef.current;
          if (!active || !video || !sampleContext) return;
          if (time - lastCheck > 450 && video.readyState >= 2) {
            lastCheck = time;
            sampleContext.drawImage(video, 0, 0, 160, 120);
            const pixels = sampleContext.getImageData(0, 0, 160, 120).data;
            let brightness = 0;
            let sharpness = 0;
            let movement = 0;
            const gray = new Uint8ClampedArray(160 * 120);
            for (let i = 0; i < gray.length; i++) {
              const offset = i * 4;
              gray[i] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
              brightness += gray[i];
              if (lastPixels.current) movement += Math.abs(gray[i] - lastPixels.current[i]);
            }
            for (let y = 1; y < 119; y += 2) {
              for (let x = 1; x < 159; x += 2) {
                const i = y * 160 + x;
                sharpness += Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - 160] - gray[i + 160]);
              }
            }
            brightness /= gray.length;
            movement = lastPixels.current ? movement / gray.length : 99;
            sharpness /= 80 * 60;
            lastPixels.current = gray;

            let nextMessage = "Segure o celular firme";
            let nextQuality: "waiting" | "warn" | "ready" = "waiting";
            if (brightness < 55) {
              nextMessage = "Pouca luz — ilumine melhor a nota";
              nextQuality = "warn";
            } else if (brightness > 225) {
              nextMessage = "Muito reflexo — mude o ângulo";
              nextQuality = "warn";
            } else if (sharpness < 20) {
              nextMessage = "Imagem desfocada — aproxime devagar";
              nextQuality = "warn";
            } else if (movement > 10) {
              nextMessage = "Segure o celular firme";
            } else {
              nextMessage = autoCapture ? "Ótimo! Capturando…" : "Imagem pronta";
              nextQuality = "ready";
            }
            setMessage(nextMessage);
            setQuality(nextQuality);
            readyFrames.current = nextQuality === "ready" ? readyFrames.current + 1 : 0;
            if (autoCapture && readyFrames.current >= 3) capture();
          }
          frameRef.current = requestAnimationFrame(analyze);
        };
        frameRef.current = requestAnimationFrame(analyze);
      } catch {
        setError("Não foi possível abrir a câmera. Confira a permissão do navegador.");
      }
    }

    start();
    return () => {
      active = false;
      stopCamera();
    };
  }, [autoCapture]);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scanner de nota fiscal">
      <video ref={videoRef} playsInline muted />
      <div className="scannerShade" />
      <div className={`documentFrame ${quality}`}>
        <i className="corner tl" /><i className="corner tr" />
        <i className="corner bl" /><i className="corner br" />
        <span>Alinhe as quatro bordas da folha</span>
      </div>
      <div className="scannerTop">
        <button onClick={() => { stopCamera(); onClose(); }} aria-label="Fechar câmera">×</button>
        <strong>Escanear DANFE</strong>
        <span />
      </div>
      <div className="scannerBottom">
        {error ? <p className="scannerError">{error}</p> : <p className={`qualityMessage ${quality}`}><i />{message}</p>}
        <div className="scannerControls">
          <label className="autoToggle">
            <input type="checkbox" checked={autoCapture} onChange={(event) => setAutoCapture(event.target.checked)} />
            <span>Automático</span>
          </label>
          <button className="shutter" onClick={capture} aria-label="Tirar foto"><i /></button>
          <span className="controlSpacer" />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [nota, setNota] = useState<Nota>(emptyNota);
  const [status, setStatus] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

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
            <div className="dropzone">
              <span className="cameraIcon">⌑</span>
              <strong>Escanear nota fiscal</strong>
              <small>A câmera ajuda a alinhar e verificar a nitidez</small>
              <button className="scanButton" onClick={() => setScannerOpen(true)}>Abrir scanner</button>
              <label className="galleryButton">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                Escolher da galeria
              </label>
            </div>
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
      {scannerOpen && (
        <CameraScanner
          onClose={() => setScannerOpen(false)}
          onCapture={(capturedFile) => {
            setFile(capturedFile);
            setScannerOpen(false);
            setStatus("idle");
          }}
        />
      )}
    </main>
  );
}
