# Fer vs. Fluff — Street Brawler

A cute browser brawler starring Fer, a Mexican girl with long curly hair, a flowery sundress, and cowboy boots. Fight giant plush enemies with kisses, flowers, and bombs. Win eggs and unlock perks (horse, jetpack). Happy colors and sounds included.

## Play
Open `index.html` in a modern browser.

## Controls
- Move: Left/Right or A/D
- Jump: Up/W/Space
- Kiss: Z/J
- Flower: X/K
- Bomb: C/L
- Pause: P
- Mute: button in top bar

## Notes
- Eggs persist in localStorage.
- Perks unlock each level: Level 1 → Horse (speed), Level 2 → Jetpack (hover).
- Between levels: tiny duck celebration.

## Global Scoreboard (no login for players)
- This project can optionally use a public, write-allowed anonymous key from a backend like Supabase to store scores.
- To enable, create `scoreboard_config.json` in the project root with the same shape as `scoreboard_config.example.json` and deploy.
- Schema example (Supabase):
  - Table: `scores` with columns `name` (text), `score` (int), `eggs` (int), `level` (int), `created_at` (timestamp default now()).
  - RLS example (simplified; set policies to allow insert/select for anon):
    - Enable RLS on `scores`.
    - Policy: `allow_insert`: `using (true)` `with check (true)` for anon role.
    - Policy: `allow_select`: `using (true)` for anon role.
  - Use the project anon public key in `scoreboard_config.json`.



