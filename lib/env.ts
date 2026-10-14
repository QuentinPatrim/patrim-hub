/* Clés serveur : accepte aussi les noms saisis à la main dans Vercel
   (ex. « antropic_api_key », « subabase_secret_key »). */
const lire = (...noms: string[]) => noms.map((n) => process.env[n]).find((v) => v && v.trim())?.trim();

export const cleClaude = () => lire("ANTHROPIC_API_KEY", "anthropic_api_key", "antropic_api_key", "ANTROPIC_API_KEY");
export const cleServiceSupabase = () =>
  lire("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "supabase_secret_key", "subabase_secret_key", "SUBABASE_SECRET_KEY");
export const secretSynchro = () => lire("HUB_SYNC_SECRET");
