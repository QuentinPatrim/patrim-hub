"use client";

import { Check, Gauge, ImagePlus, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, Spinner, cx } from "@/components/ui";
import { FONDS, choisirFond, enregistrerPhotoPerso, photoPerso, useFond } from "@/lib/fond";
import { setTheme, useTheme, type Theme } from "@/lib/theme";
import { useCollection } from "@/lib/store";
import { locationSeule } from "@/components/location/bienLocation";

const THEMES: { id: Theme; nom: string; icon: typeof Sun }[] = [
  { id: "light", nom: "Clair", icon: Sun },
  { id: "dark", nom: "Sombre", icon: Moon },
  { id: "dashboard", nom: "Dashboard", icon: Gauge },
];

/** Réglages : thème de l'appli et photo de fond du thème « Dashboard » (gardés sur cet appareil). */
export function ApparenceCard() {
  const { theme } = useTheme();
  const fond = useFond();
  const { items: biens } = useCollection("biens");
  const [perso, setPerso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setPerso(photoPerso()), [fond.id]);

  // Photos de mes biens en vente (photos de l'annonce uniquement)
  const photosBiens = biens
    .filter((b) => !locationSeule(b) && b.photos?.[0] && b.statut !== "vendu" && b.statut !== "retire")
    .slice(0, 8)
    .map((b) => ({ id: `url:${b.photos![0]}`, nom: b.quartier || b.titre || "Bien", mini: b.photos![0] }));

  const prendre = (id: string) => {
    choisirFond(id);
    if (theme !== "dashboard") setTheme("dashboard");
    setMsg("");
  };

  const importer = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      await enregistrerPhotoPerso(file);
      setPerso(photoPerso());
      if (theme !== "dashboard") setTheme("dashboard");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "La photo n'a pas pu être enregistrée.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Card title="Apparence">
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map(({ id, nom, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTheme(id)}
            className={cx("flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-1 text-[13px] font-semibold transition active:scale-[.98]", theme === id ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-surface-2/60 text-fg/80")}
          >
            <Icon size={16} /> {nom}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted">Photo de fond du thème Dashboard, gardée sur ce téléphone.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {FONDS.map((f) => (
          <Vignette key={f.id} nom={f.nom} image={f.mini} actif={theme === "dashboard" && fond.id === f.id} onClick={() => prendre(f.id)} />
        ))}
        {perso ? (
          <Vignette nom="Ma photo" image={perso} actif={theme === "dashboard" && fond.id === "perso"} onClick={() => prendre("perso")} />
        ) : (
          <button onClick={() => input.current?.click()} className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-[11px] font-semibold text-muted active:scale-[.98]">
            {busy ? <Spinner /> : <ImagePlus size={20} />} Ma photo
          </button>
        )}
      </div>
      <button onClick={() => input.current?.click()} disabled={busy} className="btn-secondary btn-sm mt-3">
        {busy ? <Spinner /> : <ImagePlus size={14} />} {perso ? "Changer ma photo" : "Choisir dans ma galerie"}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => importer(e.target.files?.[0])} />

      {photosBiens.length > 0 && (
        <>
          <p className="mt-4 text-sm text-muted">Ou la photo d&apos;un de mes biens :</p>
          <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {photosBiens.map((p) => (
              <div key={p.id} className="w-[72px] shrink-0">
                <Vignette nom={p.nom} image={p.mini} actif={theme === "dashboard" && fond.id === p.id} onClick={() => prendre(p.id)} />
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <p className="mt-2 text-xs text-danger">{msg}</p>}
    </Card>
  );
}

function Vignette({ nom, image, actif, onClick }: { nom: string; image?: string; actif: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("relative block w-full aspect-[3/4] overflow-hidden rounded-xl ring-2 transition active:scale-[.98]", actif ? "ring-accent" : "ring-transparent")} aria-pressed={actif}>
      <span className="absolute inset-0 bg-cover bg-center" style={image ? { backgroundImage: `url("${image}")` } : { background: "radial-gradient(90% 60% at 100% 0%, #8e2a30, transparent 70%), linear-gradient(180deg, #3a0f13, #140a0c)" }} />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-left text-[10.5px] font-semibold text-white truncate">{nom}</span>
      {actif && <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-accent text-white"><Check size={12} /></span>}
    </button>
  );
}
