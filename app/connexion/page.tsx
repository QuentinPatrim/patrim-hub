"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return router.replace("/");
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) setErr("Identifiants incorrects.");
    else router.replace("/");
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr] bg-bg">
      <div className="relative isolate overflow-hidden bg-gradient-to-br from-brand via-[#4a1013] to-ink text-white flex flex-col justify-between px-6 pt-[calc(env(safe-area-inset-top)+28px)] pb-16 lg:p-14">
        <div aria-hidden className="arcades absolute inset-x-0 bottom-0 h-40 lg:h-72 opacity-[0.10] -z-10" />
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-coral/20 blur-3xl -z-10" />
        <div className="flex items-center gap-3">
          <Image src="/emblem.png" alt="" width={44} height={44} className="rounded-xl ring-1 ring-white/15 shadow-lg" />
          <div>
            <div className="font-semibold tracking-[0.24em] text-[15px]">PATRIM</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/55">
              <span className="h-px w-3 bg-coral" /> Espace vente
            </div>
          </div>
        </div>
        <div className="mt-10 lg:mt-0">
          <h1 className="font-serif text-[34px] lg:text-[56px] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
            Vendre mieux,
            <br />
            avec moins d&apos;efforts.
          </h1>
          <p className="mt-4 max-w-md text-sm lg:text-base leading-relaxed text-white/65">Biens, acquéreurs, visites, estimations et documents réunis dans un seul outil, pensé pour l&apos;agence PATRIM.</p>
        </div>
        <div className="hidden lg:block text-xs text-white/40">PATRIM · 45 allées Jean Jaurès · Toulouse</div>
      </div>
      <div className="relative -mt-8 lg:mt-0 rounded-t-[28px] lg:rounded-none bg-bg grid place-items-start lg:place-items-center px-6 pt-8 pb-12 lg:p-12">
        <form onSubmit={go} className="w-full max-w-sm mx-auto space-y-4 animate-fade-up">
          <div className="mb-2">
            <div className="eyebrow">Bon retour</div>
            <h2 className="mt-1 font-serif text-[28px] font-semibold tracking-tight">Connexion</h2>
            <p className="mt-1 text-sm text-muted">Accédez à votre espace de vente.</p>
          </div>
          <label className="block">
            <span className="label">E-mail</span>
            <input className="input !h-11" type="email" placeholder="prenom@patrim.fr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="block">
            <span className="label">Mot de passe</span>
            <input className="input !h-11" type="password" placeholder="Votre mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" required />
          </label>
          {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <button className="btn-primary w-full !h-12 !text-[15px]" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
          <p className="pt-4 text-center text-xs text-muted lg:hidden">PATRIM · 45 allées Jean Jaurès · Toulouse</p>
        </form>
      </div>
    </div>
  );
}
