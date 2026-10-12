# Lumi AI Web v3.5 — Supabase Setup

Lumi works in guest mode without Supabase.

To enable email accounts and cross-device sync:

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run all of `SUPABASE_SETUP.sql`.
4. Find your Project URL and browser-safe Publishable/Anon key.
5. Put them into `supabase-config.js`.
6. In Supabase Auth URL settings, add your live GitHub Pages URL as the Site URL and allowed redirect URL.

Never put a `service_role` or secret key in a public GitHub repository.

Synced data:
- Threads and text messages
- Memories
- Settings
- Lumi Happiness / Energy / Bond
- Star balance
- Snack inventory

Photo files remain local.
