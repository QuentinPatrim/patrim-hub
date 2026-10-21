"use client";

import { niveauMatch } from "@/lib/matching";
import Link from "next/link";
import { titrePublic } from "@/lib/titrePublic";
import { useState } from "react";
import { Check, Mail, MessageCircle, Phone, Send, Sparkles, Users } from "lucide-react";
import { Avatar, Badge, Card, Empty, cx } from "@/components/ui";
import { update } from "@/lib/store";
import { ETAPE, eurK, initiales, nomComplet } from "@/lib/format";
import type { Bien, Contact } from "@/lib/types";
import type { Match } from "@/lib/matching";
import { mailHref, telHref, texteProposition, waHref } from "./utils";
import { BrouillonMail } from "@/components/matching/BrouillonMail";

/** Note le bien comme proposé dans la fiche de l'acquéreur (une seule fois). */
export function marquerPropose(b: Bien, c: Contact) {
  if ((c.biensProposes ?? []).includes(b.id)) return;
  const now = new Date().toISOString();
  update("contacts", c.id, {
    biensProposes: [...(c.biensProposes ?? []), b.id],
    historique: [{ date: now, type: "mail", texte: `Bien proposé : ${b.titre}` }, ...(c.historique ?? [])],
    dernierContact: now,
  });
}

export function AcquereursCompatibles({ bien, matches }: { bien: Bien; matches: (Match & { item: Contact })[] }) {
  const [all, setAll] = useState(false);
  const [brouillon, setBrouillon] = useState<Contact | null>(null);
  const shown = all ? matches : matches.slice(0, 5);
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          Acquéreurs compatibles
          {matches.length > 0 && <span className="rounded-full bg-brand px-2 text-[11px] font-semibold text-white">{matches.length}</span>}
        </span>
      }
      pad={false}
    >
      {!matches.length ? (
        <Empty icon={<Users size={20} />} title="Aucun acquéreur compatible pour l'instant" text="Dès qu'un acquéreur aux critères proches sera enregistré, il apparaîtra ici." />
      ) : (
        <ul className="divide-y divide-line">
          {shown.map(({ item: c, score, raisons, ecarts }) => {
            const propose = (c.biensProposes ?? []).includes(bien.id);
            const etape = c.etape ? ETAPE[c.etape] : undefined;
            return (
              <li key={c.id} className="px-4 sm:px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar text={initiales(c)} />
                    <ScoreRing score={score} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link href={`/contacts/${c.id}`} className="font-medium hover:text-accent truncate">
                        {nomComplet(c)}
                      </Link>
                      {etape && <Badge tone={etape.tone}>{etape.label}</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {c.criteres?.budgetMax ? `Budget ${eurK(c.criteres.budgetMax)}` : "Budget non précisé"}
                      {c.financement?.accordBanque ? " · accord bancaire" : ""}
                    </div>
                    {(raisons.length > 0 || !!ecarts?.length) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {raisons.map((r) => (
                          <span key={r} className="chip !h-5 !text-[10px]">
                            <Check size={10} className="text-ok" /> {r}
                          </span>
                        ))}
                        {ecarts?.map((r) => (
                          <span key={r} className="chip !h-5 !text-[10px] text-warn">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 pl-12">
                  {c.tel && (
                    <a href={telHref(c.tel)} className="btn-secondary btn-sm !px-2.5" aria-label="Appeler">
                      <Phone size={14} />
                    </a>
                  )}
                  {c.email && (
                    <a href={mailHref(c.email)} className="btn-secondary btn-sm !px-2.5" aria-label="Écrire">
                      <Mail size={14} />
                    </a>
                  )}
                  {c.tel && (
                    <a href={waHref(c.tel)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm !px-2.5" aria-label="WhatsApp">
                      <MessageCircle size={14} />
                    </a>
                  )}
                  <button onClick={() => setBrouillon(c)} className={cx("btn-sm btn ml-auto", propose ? "btn-ghost text-ok" : "btn-primary")}>
                    {propose ? <Check size={14} /> : <Send size={14} />}
                    {propose ? "Proposé" : "Préparer un mail"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > 5 && (
        <div className="border-t border-line p-2">
          <button className="btn-ghost btn-sm w-full" onClick={() => setAll(!all)}>
            {all ? "Réduire" : `Voir les ${matches.length} acquéreurs`}
          </button>
        </div>
      )}
      {brouillon && (
        <BrouillonMail
          open
          onClose={() => setBrouillon(null)}
          titre={`Proposer à ${nomComplet(brouillon)}`}
          to={brouillon.email}
          tel={brouillon.tel}
          sujet={`Un bien pour vous : ${titrePublic(bien)}`}
          corps={texteProposition(bien, brouillon)}
          onPrepare={() => marquerPropose(bien, brouillon)}
        />
      )}
    </Card>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <span className="absolute -bottom-1.5 -right-1.5 grid place-items-center size-6 rounded-full bg-surface ring-2 ring-surface" title={`Compatibilité : ${niveauMatch(score)}`}>
      <Sparkles size={13} className={score >= 85 ? "text-ok" : score >= 70 ? "text-accent" : "text-muted"} />
    </span>
  );
}
