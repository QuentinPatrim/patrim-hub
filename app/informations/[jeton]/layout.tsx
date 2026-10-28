import type { Metadata } from "next";

/* Page publique : jamais indexée, et le lien secret n'est jamais transmis aux sites tiers. */
export const metadata: Metadata = {
  title: "Votre fiche PATRIM",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
