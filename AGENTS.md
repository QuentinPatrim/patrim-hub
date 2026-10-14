# PATRIM Hub – conventions pour les développeurs (humains et agents)

Application tout-en-un de l'agence immobilière PATRIM (Toulouse) pour un conseiller en vente : biens/mandats, contacts (acquéreurs, vendeurs), agenda des visites, estimations, studio marketing, assistant IA, agents de nuit.
Utilisateur : Quentin Delsol, conseiller vente. Tout le texte de l'interface est en **français**, simple, chaleureux, sans jargon technique (jamais "id", "JSON", "API" à l'écran).

## Stack
- Next.js 15 (App Router), React 19, TypeScript strict, Tailwind 3, lucide-react (icônes), clsx.
- Données : `lib/store.ts` (`useCollection(kind)`, `useDoc(kind, id)`, `create/update/remove/getAll/bulkCreate`). Types dans `lib/types.ts`. Les données sont locales (navigateur) ou Supabase selon la config : ne t'en occupe pas, passe toujours par le store.
- IA : côté client `ask({ system, prompt, json, smart, images })` de `lib/ai.ts` → `/api/ai` (Claude). Le ton PATRIM et les règles de confidentialité sont déjà ajoutés côté serveur. Pour une réponse structurée, demande un JSON et passe `json: true`, puis lis `res.json`. Gère toujours l'erreur (afficher `e.message` dans l'UI).
- Formatage et libellés : `lib/format.ts` (eur, eurK, m2, dateCourte, dateLongue, heure, today, addDays, ilya, nomComplet, STATUT_BIEN, ETAPE, ROLE, SOURCE, RDV_TYPE, TYPE_BIEN).
- Rapprochement acquéreur/bien : `lib/matching.ts`.
- Estimation : `lib/expressEstimate.ts`, `lib/dvf.ts` (serveur : ventes DVF autour d'une adresse), `lib/toulouseQuartiers.ts`, `lib/financing.ts`.

## Design (charte PATRIM)
- Couleurs de marque : bordeaux `brand` (#6c191e), gris anthracite, filet `coral` (#ef402a) en touche discrète, `ink` (#0d1420) pour les fonds sombres. Thème clair/sombre automatique via les couleurs sémantiques : `bg`, `surface`, `surface-2`, `line`, `fg`, `muted`, `accent`, `ok`, `warn`, `danger`. N'utilise PAS de couleurs Tailwind brutes (gray-500, white…) pour le texte/fond, sauf sur fond `ink`/`brand`.
- Classes : `.card`, `.card-pad`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`, `.input`, `.label`, `.chip`, `.h-title` (titre serif), `.h-section`, `.skeleton`.
- Composants : `components/ui.tsx` → `PageHeader`, `Card`, `Stat`, `Empty`, `Field`, `Sheet` (modal = feuille du bas sur mobile), `Tabs`, `Badge`, `Avatar`, `DpeBadge`, `Spinner`.
- Titres en Playfair Display (`font-serif`), texte en Inter. Beaucoup d'espace, coins arrondis (rounded-2xl), ombres douces, animations légères (`animate-fade-up`).
- **Mobile d'abord** : tout doit être parfait à 375 px de large (le conseiller l'utilise sur son téléphone entre deux visites). Pas de tableau large sur mobile : utiliser des listes de cartes, et des tableaux seulement à partir de `md:`. Zones tactiles ≥ 40 px. Barre d'onglets en bas (déjà gérée par `AppShell`), donc rien de fixe en bas de page.
- Liens téléphone/mail/SMS/WhatsApp cliquables (`tel:`, `mailto:`, `sms:`, `https://wa.me/`).
- États vides soignés (`Empty`) avec une action claire.

## Règles métier
- Ne jamais inventer un fait sur un bien. Info manquante = champ vide ou `[À compléter]`.
- Confidentialité : identité/situation du vendeur, montants d'offres, marge de négociation et autres acquéreurs ne doivent jamais apparaître dans un contenu destiné au public (annonce, post, mail acquéreur).
- Rien n'est envoyé automatiquement à un client : l'appli prépare des brouillons (copier, ouvrir dans le mail avec `mailto:`, partager via `navigator.share`).
- Démarchage téléphonique : depuis le 11/08/2026 il faut l'accord préalable du particulier (`Contact.optinTel`).
- Annonces : classe DPE obligatoire si connue, prix honoraires inclus, mention "honoraires à la charge de …" si connue.

## Organisation du code
- Chaque module vit dans son dossier `app/<module>/` et, si besoin, `components/<module>/`. Ne modifie pas les fichiers partagés (`lib/types.ts`, `lib/store.ts`, `components/ui.tsx`, `components/AppShell.tsx`, `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `package.json`). Si un champ manque dans un type, ajoute-le dans ton module via une intersection de type, ou signale-le dans ton compte rendu.
- Pages client : `"use client"` en tête. Paramètres dynamiques : `useParams()`.
- Vérification : `npx tsc --noEmit` doit passer. Ne lance PAS `next build` ni `next dev` (dossier `.next` partagé entre plusieurs développeurs en parallèle).
- Pas de nouvelle dépendance npm.
