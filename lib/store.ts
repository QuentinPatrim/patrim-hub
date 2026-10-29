"use client";

/* ============================================================
   Stockage des données PATRIM Hub
   - Connecté à Supabase : table hub_docs (une ligne par objet,
     données en JSON), réservée à l'utilisateur connecté.
   - Sans Supabase ou hors connexion : stockage local du navigateur.
   Le cache local sert toujours d'affichage immédiat, puis la
   version Supabase le remplace dès qu'elle arrive.
   ============================================================ */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { Collections, Kind } from "./types";

type Any = Collections[Kind];
const PREFIX = "patrim-hub:";

const memory: Partial<Record<Kind, Any[]>> = {};
const listeners: Partial<Record<Kind, Set<() => void>>> = {};
const loaded: Partial<Record<Kind, boolean>> = {};
const EMPTY: Any[] = [];

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

function readLocal<K extends Kind>(kind: K): Collections[K][] {
  try {
    const raw = localStorage.getItem(PREFIX + kind);
    return raw ? (JSON.parse(raw) as Collections[K][]) : [];
  } catch {
    return [];
  }
}
function writeLocal(kind: Kind, items: Any[]) {
  try {
    localStorage.setItem(PREFIX + kind, JSON.stringify(items));
  } catch {
    /* stockage plein ou indisponible */
  }
}
function emit(kind: Kind) {
  listeners[kind]?.forEach((l) => l());
}
function setItems(kind: Kind, items: Any[]) {
  memory[kind] = items;
  writeLocal(kind, items);
  emit(kind);
}
function current<K extends Kind>(kind: K): Collections[K][] {
  if (!memory[kind] && typeof window !== "undefined") memory[kind] = readLocal(kind);
  return (memory[kind] ?? EMPTY) as Collections[K][];
}

let userIdPromise: Promise<string | null> | null = null;
async function userId(): Promise<string | null> {
  if (!supabase) return null;
  if (!userIdPromise) userIdPromise = supabase.auth.getUser().then((r) => r.data.user?.id ?? null);
  return userIdPromise;
}
export function resetSession() {
  userIdPromise = null;
  (Object.keys(loaded) as Kind[]).forEach((k) => (loaded[k] = false));
}

async function pull(kind: Kind) {
  if (!supabase || loaded[kind]) return;
  loaded[kind] = true;
  const uidv = await userId();
  if (!uidv) return;
  const { data, error } = await supabase.from("hub_docs").select("id,data").eq("kind", kind).limit(5000);
  if (error || !data) {
    loaded[kind] = false;
    return;
  }
  setItems(kind, data.map((r: { id: string; data: Any }) => ({ ...r.data, id: r.id })));
}

async function push(kind: Kind, item: Any) {
  if (!supabase) return;
  const uidv = await userId();
  if (!uidv) return;
  await supabase.from("hub_docs").upsert({ id: item.id, kind, data: item, user_id: uidv, updated_at: item.updatedAt });
}
/** Supprime en base. Faux si la base a refusé (fiche d'un autre compte de l'équipe, par exemple). */
async function drop(id: string): Promise<boolean> {
  if (!supabase) return true;
  const uidv = await userId();
  if (!uidv) return true;
  const { error, count } = await supabase.from("hub_docs").delete({ count: "exact" }).eq("id", id);
  return !error && count !== 0;
}

/* ---------- API impérative (utilisable hors composants) ---------- */

export function getAll<K extends Kind>(kind: K): Collections[K][] {
  return current(kind);
}

export function create<K extends Kind>(kind: K, data: Omit<Collections[K], "id" | "createdAt" | "updatedAt"> & { id?: string }): Collections[K] {
  const now = new Date().toISOString();
  const item = { ...data, id: data.id ?? uid(), createdAt: now, updatedAt: now } as Collections[K];
  setItems(kind, [item, ...current(kind)]);
  void push(kind, item);
  return item;
}

export function update<K extends Kind>(kind: K, id: string, patch: Partial<Collections[K]>): Collections[K] | undefined {
  let updated: Collections[K] | undefined;
  const items = current(kind).map((it) => {
    if (it.id !== id) return it;
    updated = { ...it, ...patch, id, updatedAt: new Date().toISOString() } as Collections[K];
    return updated;
  });
  setItems(kind, items);
  if (updated) void push(kind, updated);
  return updated;
}

/** Retire tout de suite de l'écran ; si la base refuse, la fiche revient et le résultat vaut faux. */
export async function remove(kind: Kind, id: string): Promise<boolean> {
  const item = current(kind).find((it) => it.id === id);
  setItems(
    kind,
    current(kind).filter((it) => it.id !== id)
  );
  const ok = await drop(id);
  if (!ok && item && !current(kind).some((it) => it.id === id)) setItems(kind, [item, ...current(kind)]);
  return ok;
}

/** Importe plusieurs objets d'un coup (import CSV, données de démonstration…). */
export async function bulkCreate<K extends Kind>(kind: K, rows: Array<Partial<Collections[K]>>) {
  const now = new Date().toISOString();
  const items = rows.map((r) => ({ ...r, id: r.id ?? uid(), createdAt: r.createdAt ?? now, updatedAt: now })) as Collections[K][];
  setItems(kind, [...items, ...current(kind)]);
  if (supabase) {
    const uidv = await userId();
    if (uidv) await supabase.from("hub_docs").upsert(items.map((it) => ({ id: it.id, kind, data: it, user_id: uidv, updated_at: it.updatedAt })));
  }
  return items;
}

/* ---------- Hooks React ---------- */

function subscribe(kind: Kind, cb: () => void) {
  (listeners[kind] ??= new Set()).add(cb);
  return () => {
    listeners[kind]?.delete(cb);
  };
}

/** Liste réactive d'une collection, triée du plus récent au plus ancien. */
export function useCollection<K extends Kind>(kind: K) {
  const items = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(kind, cb), [kind]),
    () => current(kind),
    () => EMPTY as Collections[K][]
  );
  useEffect(() => {
    void pull(kind);
  }, [kind]);
  return {
    items,
    create: useCallback((d: Parameters<typeof create<K>>[1]) => create(kind, d), [kind]),
    update: useCallback((id: string, p: Partial<Collections[K]>) => update(kind, id, p), [kind]),
    remove: useCallback((id: string) => remove(kind, id), [kind]),
  };
}

/** Un objet par son id (undefined tant qu'il n'est pas chargé ou s'il n'existe pas). */
export function useDoc<K extends Kind>(kind: K, id: string | undefined) {
  const { items, update: up, remove: rm } = useCollection(kind);
  const doc = useMemo(() => items.find((i) => i.id === id), [items, id]);
  return {
    doc,
    update: useCallback((p: Partial<Collections[K]>) => (id ? up(id, p) : undefined), [id, up]),
    remove: useCallback(() => id && rm(id), [id, rm]),
  };
}

/** Recharge tout depuis Supabase (après connexion). */
export function refreshAll() {
  resetSession();
  (Object.keys(listeners) as Kind[]).forEach((k) => void pull(k));
}

/** Recharge depuis Supabase ce qui est affiché (après une synchro Google faite par le serveur). */
export function rechargerAffiche() {
  (Object.keys(listeners) as Kind[]).forEach((k) => {
    if (!listeners[k]?.size) return;
    loaded[k] = false;
    void pull(k);
  });
}

/* Quand l'appli revient au premier plan (téléphone déverrouillé, onglet rouvert),
   on recharge ce qui est affiché : les leads et RDV arrivés de Gmail apparaissent. */
let dernierRetour = 0;
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - dernierRetour < 30000) return;
    dernierRetour = Date.now();
    (Object.keys(listeners) as Kind[]).forEach((k) => {
      if (!listeners[k]?.size) return;
      loaded[k] = false;
      void pull(k);
    });
  });
}
