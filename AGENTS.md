# BirthdayManu

This is the standalone GitHub Pages application in AbouDjafar/BirthdayManu.
The initial UI was imported from a separate private Lovable repository; that
repository and its published history must remain untouched.

- Keep the app static: Vite + React, hash routes, no server runtime.
- All browser data access belongs in src/app/api.ts and its adapter modules.
- Production data always uses Supabase. Do not restore a demo adapter or fake data.
- Database installation scripts belong in database/, not supabase/migrations/.
- Never commit real quiz answers, private letters, access codes or privileged keys.
- Preserve the French UI, mobile layout and existing visual assets.
- Keep original image sources in ignored assets-originaux/; publish only optimized assets.
- Email sending has been removed at the user's request. Keep only the two-day Supabase keepalive.
- Use npm ci and the committed package-lock.json; verify with npm run typecheck,
  npm run test:all and npm run build.
- Do not force-push or rewrite published Git history.
