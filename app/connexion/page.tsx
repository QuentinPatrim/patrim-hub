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
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="hidden lg:flex relative bg-ink text-white flex-col justify-between p-12 overflow-hidden">
        <Image src="/arcades.png" alt="" fill className="object-cover object-bottom opacity-[0.07] invert" />
        <Image src="/emblem.png" alt="" width={56} height={56} className="relative rounded-xl" />
        <div className="relative">
          <h1 className="font-serif text-5xl leading-tight">Vendre mieux,<br />avec moins d&apos;efforts.</h1>
          <p className="mt-4 max-w-md text-white/60">Biens, acquéreurs, visites, estimations et marketing réunis dans un seul outil, pensé pour l&apos;agence PATRIM.</p>
        </div>
        <div className="relative text-xs text-white/40">PATRIM · 45 allées Jean Jaurès · Toulouse</div>
      </div>
      <div className="grid place-items-center p-6">
        <form onSubmit={go} className="w-full max-w-sm space-y-4">
          <Image src="/logo.png" alt="PATRIM" width={220} height={60} className="mb-6 dark:brightness-[2.2] dark:grayscale" />
          <h2 className="font-serif text-2xl">Connexion</h2>
          <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <input className="input" type="password" placeholder="Mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" required />
          {err && <p className="text-sm text-danger">{err}</p>}
          <button className="btn-primary w-full h-11" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
        </form>
      </div>
    </div>
  );
}
