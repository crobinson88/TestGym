// Client side of stock research: turn picked files into a transport shape and
// call the serverless summarizer. PDFs go as base64, everything else as text.
export interface UploadDoc {
  name: string;
  mediaType: string;
  dataBase64?: string;
  text?: string;
}

export interface SummarizeInput {
  prompt: string;
  ticker?: string;
  urls: string[];
  files: UploadDoc[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function readUploadDoc(file: File): Promise<UploadDoc> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return { name: file.name, mediaType: "application/pdf", dataBase64: await fileToBase64(file) };
  }
  return { name: file.name, mediaType: "text/plain", text: await file.text() };
}

export async function summarizeDocuments(input: SummarizeInput, token: string): Promise<string> {
  const res = await fetch("/api/stock-summarize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let parsed: { summary?: string; error?: string } | null;
  try {
    parsed = JSON.parse(text) as { summary?: string; error?: string };
  } catch {
    parsed = null;
  }
  if (!res.ok || !parsed?.summary) {
    throw new Error(parsed?.error ?? `Summarize failed (${res.status})`);
  }
  return parsed.summary;
}
