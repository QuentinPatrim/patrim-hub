"use client";

import { supabase } from "./supabase";

/* Côté navigateur : appelle Claude via /api/ai (la clé reste sur le serveur). */

export type AskOptions = {
  system?: string;
  prompt?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  smart?: boolean;               // Claude Opus (plus fin, plus lent) au lieu de Sonnet
  effort?: "low" | "medium" | "high";
  json?: boolean;                // renvoie aussi la réponse analysée en JSON
  images?: { mediaType: string; data: string }[];
  maxTokens?: number;
};

export async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) h.authorization = "Bearer " + data.session.access_token;
  }
  try {
    const code = localStorage.getItem("patrim-hub:passcode");
    if (code) h["x-passcode"] = code;
  } catch {}
  return h;
}

export async function ask<T = unknown>(o: AskOptions): Promise<{ text: string; json?: T }> {
  const res = await fetch("/api/ai", { method: "POST", headers: await authHeaders(), body: JSON.stringify(o) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "L'assistant n'a pas répondu.");
  return data;
}

/** Réduit une image (fichier) et la renvoie en base64 JPEG, prête pour Claude. */
export async function fileToBase64Jpeg(file: Blob, max = 1400): Promise<{ mediaType: string; data: string; dataUrl: string }> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg", data: dataUrl.split(",")[1], dataUrl };
}
