"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { refreshAll } from "@/lib/store";

/** Avec Supabase configuré, l'appli exige une connexion. Sinon, mode local. */
export function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ok, setOk] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session && !path.startsWith("/connexion")) router.replace("/connexion");
      else setOk(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") refreshAll();
      if (event === "SIGNED_OUT") router.replace("/connexion");
    });
    return () => sub.subscription.unsubscribe();
  }, [path, router]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (!ok && !path.startsWith("/connexion")) return <div className="min-h-dvh grid place-items-center"><div className="size-8 rounded-full border-2 border-accent border-r-transparent animate-spin" /></div>;
  return <>{children}</>;
}
