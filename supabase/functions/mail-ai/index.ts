import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const allowedOrigins = new Set([
  "https://mail-frankiflow.shipstatic.com",
  "https://mail.frankiflow.de",
  "https://v2--frankiflow-mail.netlify.app",
  "https://v2--frankiholz.netlify.app",
  "https://develop--frankiflow-mail.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function cors(origin: string | null) {
  const allow = origin && allowedOrigins.has(origin) ? origin : "https://mail-frankiflow.shipstatic.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const ALLOWED_MODELS = new Set(["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]);
const ALLOWED_ACTIONS = new Set(["generate", "improve", "translate", "shorten", "expand", "professional", "friendly", "reply"]);

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

    const { data: access } = await supabase.from("frankiflow_mail_users").select("user_id").eq("user_id", user.id).eq("active", true).maybeSingle();
    if (!access) return Response.json({ error: "Mailbox access denied" }, { status: 403, headers });

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) return Response.json({ error: "GEMINI_API_KEY is not configured" }, { status: 503, headers });

    const body = await req.json();
    const action = ALLOWED_ACTIONS.has(String(body.action)) ? String(body.action) : "improve";
    const model = ALLOWED_MODELS.has(String(body.model)) ? String(body.model) : "gemini-3.5-flash-lite";
    const tone = clip(body.tone || "professional", 80);
    const language = clip(body.language || "auto", 80);
    const prompt = clip(body.prompt, 4000);
    const subject = clip(body.subject, 1000);
    const text = clip(body.text, 30000);

    if (!prompt && !text) return Response.json({ error: "Add a prompt or some email text first" }, { status: 400, headers });

    const actionGuide: Record<string, string> = {
      generate: "Write a complete email from the user's instruction. Create a useful subject if one is not already supplied.",
      improve: "Improve clarity, grammar, flow, and professionalism while preserving the intended meaning.",
      translate: `Translate the email faithfully. Target language: ${language === "auto" ? "infer from the user's instruction" : language}.`,
      shorten: "Make the email noticeably shorter and clearer without losing important information.",
      expand: "Expand the email with useful context and polished phrasing, without inventing factual claims.",
      professional: "Rewrite the email in a polished professional business tone.",
      friendly: "Rewrite the email in a warm, friendly, natural tone while remaining professional.",
      reply: "Draft an appropriate reply using the user's instruction and the supplied email text as context.",
    };

    const systemInstruction = `You are the Gemini-powered writing assistant inside FrankiFlow Mail. ${actionGuide[action]} Default tone: ${tone}. Default language: ${language}. Keep names, dates, prices and factual details exactly as provided unless the user explicitly asks to change them. Do not add legal promises, fabricated facts, or unsupported claims. Return only the email subject and HTML body in the requested JSON structure. Use simple email-safe HTML: paragraphs, line breaks, bold, italic, unordered or ordered lists, and links only. Do not add a signature unless explicitly asked because the mailbox handles signatures separately.`;
    const userText = `USER INSTRUCTION:\n${prompt || "(none)"}\n\nCURRENT SUBJECT:\n${subject || "(none)"}\n\nCURRENT EMAIL TEXT:\n${text || "(none)"}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: action === "generate" ? 0.5 : 0.25,
          maxOutputTokens: 2200,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              subject: { type: "STRING" },
              html: { type: "STRING" },
            },
            required: ["subject", "html"],
          },
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error("Gemini API error", payload);
      return Response.json({ error: payload?.error?.message || "Gemini request failed" }, { status: response.status, headers });
    }

    const outputText = (payload?.candidates?.[0]?.content?.parts || []).map((part: any) => typeof part?.text === "string" ? part.text : "").join("").trim();
    if (!outputText) return Response.json({ error: "Gemini returned no text" }, { status: 502, headers });

    let result: any;
    try { result = JSON.parse(outputText); }
    catch { return Response.json({ error: "Gemini returned an invalid structured response" }, { status: 502, headers }); }

    return Response.json({ ok: true, subject: clip(result.subject, 998), html: clip(result.html, 120000), model, provider: "Gemini" }, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500, headers });
  }
});
