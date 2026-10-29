import type { Metadata } from "next";

/* Page publique : jamais indexée, et le lien secret n'est jamais transmis aux sites tiers. */
export const metadata: Metadata = {
  title: "Fiche de renseignements",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Toujours en clair pour le candidat, avant même le premier affichage
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'try{var h=document.documentElement;h.classList.remove("dark");h.dataset.theme="light";document.body.style.background="#fff"}catch(e){}' }} />
      {children}
    </>
  );
}
