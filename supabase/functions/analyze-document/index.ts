// Analyzes a document image using Lovable AI (Gemini vision).
// Returns structured JSON for AutoArchiv.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody {
  imageBase64: string;       // raw base64 (no data: prefix)
  mimeType: string;          // e.g. image/jpeg, image/png, application/pdf
  filename?: string;
}

const SYSTEM = `Du bist ein KI-Archivar für deutsche Privatdokumente (Briefe, Rechnungen, Verträge, Bescheide). Antworte NUR mit einem JSON-Objekt – ohne Markdown, ohne Erklärung.`;

const PROMPT = `Analysiere dieses Dokument. Antworte ausschließlich mit folgendem JSON-Schema (keine zusätzlichen Felder, keine Erklärungen):
{
  "absender": string,
  "dokumenttyp": "Rechnung" | "Vertrag" | "Bescheid" | "Brief" | "Versicherung" | "Sonstiges",
  "zusammenfassung": string,
  "zahlungsbetrag": number | null,
  "faelligkeitsdatum": string | null,
  "ablaufdatum": string | null,
  "vorgeschlagenerOrdner": "01_Fahrzeug" | "02_Finanzen" | "03_Versicherungen" | "04_Verträge" | "05_Behörden" | "06_Gesundheit" | "07_Sonstiges",
  "vorgeschlagenerUnterordner": string,
  "wichtigkeit": "hoch" | "mittel" | "niedrig",
  "tags": string[]
}
Datumswerte im Format YYYY-MM-DD. Beträge in Euro als Zahl. Bei Unsicherheit verwende sinnvolle Defaults und setze fehlende Felder auf null bzw. leere Listen.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, mimeType }: ReqBody = await req.json();
    if (!imageBase64) throw new Error("imageBase64 required");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // PDFs are not directly supported as image input; fall back to plain text instruction.
    const isImage = mimeType.startsWith("image/");

    const userContent: any[] = [{ type: "text", text: PROMPT }];
    if (isImage) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${imageBase64}` },
      });
    } else {
      userContent.push({
        type: "text",
        text: `\n\n[Hinweis: Es wurde ein PDF-Dokument hochgeladen (${mimeType}). Falls keine Bildanalyse möglich ist, schätze plausible Default-Werte und setze Unsicherheiten auf null.]`,
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte gleich erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Guthaben aufgebraucht. Bitte in den Workspace-Einstellungen aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI-Analyse fehlgeschlagen" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const text: string = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
    }

    // Defaults / sanitize
    const result = {
      absender: parsed.absender ?? "Unbekannt",
      dokumenttyp: parsed.dokumenttyp ?? "Sonstiges",
      zusammenfassung: parsed.zusammenfassung ?? "",
      zahlungsbetrag: typeof parsed.zahlungsbetrag === "number" ? parsed.zahlungsbetrag : null,
      faelligkeitsdatum: parsed.faelligkeitsdatum ?? null,
      ablaufdatum: parsed.ablaufdatum ?? null,
      vorgeschlagenerOrdner: parsed.vorgeschlagenerOrdner ?? "07_Sonstiges",
      vorgeschlagenerUnterordner: parsed.vorgeschlagenerUnterordner ?? "",
      wichtigkeit: parsed.wichtigkeit ?? "mittel",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-document error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});