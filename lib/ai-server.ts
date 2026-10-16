import Anthropic from "@anthropic-ai/sdk";
import { cleClaude } from "./env";
import { createClient } from "@supabase/supabase-js";

/* Côté serveur uniquement : appel à Claude et contrôle d'accès. */

export const MODEL_FAST = process.env.CLAUDE_MODEL_FAST || "claude-sonnet-5-5";
export const MODEL_SMART = process.env.CLAUDE_MODEL_SMART || "claude-opus-5-5";

/** Ton PATRIM, au nom du conseiller connecté (Quentin par défaut). */
export const voixPatrim = (conseiller = "Quentin Delsol") => `Tu travailles pour ${conseiller}, conseiller en vente de l'agence immobilière PATRIM (45 allées Jean Jaurès, 31000 Toulouse, 05 61 99 08 08). 
Style PATRIM : français, vouvoiement avec les clients, ton simple, chaleureux et transparent, phrases courtes, pas de superlatifs ni de clichés d'agence ("rare", "coup de cœur", "exceptionnel" interdits sauf fait objectif). 
Règles : n'invente jamais un fait sur un bien (surface, étage, DPE, charges…) ; si une info manque, écris [À compléter : …]. Ne révèle jamais l'identité ou la situation du vendeur, le montant des offres, la marge de négociation ni les autres acquéreurs. N'indique jamais la durée d'une visite ou d'un appel. Mentionne la classe DPE dans toute annonce quand elle est connue (obligation légale) et le prix honoraires inclus.`;

/** Vérifie l'appelant : jeton Supabase si l'appli est connectée à Supabase, sinon code d'accès facultatif. */
export async function checkAccess(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return "Connexion requise.";
    const { data, error } = await createClient(url, key).auth.getUser(token);
    return error || !data.user ? "Session expirée, reconnectez-vous." : null;
  }
  const code = process.env.APP_PASSCODE;
  if (code && req.headers.get("x-passcode") !== code) return "Code d'accès requis (Réglages).";
  return null;
}

export function anthropic() {
  const apiKey = cleClaude();
  if (!apiKey) throw new Error("Clé ANTHROPIC_API_KEY absente dans les variables Vercel.");
  return new Anthropic({ apiKey });
}

export type AiMessage = { role: "user" | "assistant"; content: string | Anthropic.ContentBlockParam[] };

export async function complete(opts: { system?: string; messages: AiMessage[]; smart?: boolean; effort?: "low" | "medium" | "high"; maxTokens?: number; conseiller?: string }) {
  const client = anthropic();
  const res = await client.messages.create({
    model: opts.smart ? MODEL_SMART : MODEL_FAST,
    max_tokens: opts.maxTokens ?? 8000,
    system: [voixPatrim(opts.conseiller), opts.system].filter(Boolean).join("\n\n"),
    output_config: { effort: opts.effort ?? "medium" },
    messages: opts.messages,
  } as Anthropic.MessageCreateParamsNonStreaming);
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
}

/** Extrait le premier objet ou tableau JSON d'une réponse. */
export function parseJson<T>(text: string): T | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text;
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  for (let end = raw.length; end > start; end--) {
    const ch = raw[end - 1];
    if (ch !== "}" && ch !== "]") continue;
    try {
      return JSON.parse(raw.slice(start, end)) as T;
    } catch {}
  }
  return null;
}
