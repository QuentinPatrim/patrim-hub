import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "PATRIM Hub", template: "%s · PATRIM Hub" },
  description: "L'espace de vente de l'agence PATRIM.",
  applicationName: "PATRIM Hub",
  appleWebApp: { capable: true, title: "PATRIM", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Couleur de la barre d'état du téléphone : suit le thème choisi dans l'appli (voir lib/theme.ts) */}
        <meta name="theme-color" content="#f7f5f1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </body>
    </html>
  );
}
