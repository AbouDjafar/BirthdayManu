-- TEMPLATE ONLY: replace every placeholder in a private, ignored copy.
-- Prefer scripts/configure-backend.mjs, which generates the random code locally.
-- No real answers, private letter, code or hash belong in this tracked file.
-- The invalid hash below deliberately prevents accidental placeholder setup.
begin;
select public.configure_birthday(
  p_correct_answers => '{
    "q1": "TEXTE EXACT DE LA BONNE OPTION 1",
    "q2": "TEXTE EXACT DE LA BONNE OPTION 2",
    "q3": "TEXTE EXACT DE LA BONNE OPTION 3",
    "q4": "TEXTE EXACT DE LA BONNE OPTION 4",
    "q5": "TEXTE EXACT DE LA BONNE OPTION 5"
  }'::jsonb,
  p_code_hash => 'REMPLACER_PAR_SHA256_HEXADECIMAL_64_CARACTERES_DU_CODE_ALEATOIRE',
  p_manuella_text => 'REMPLACER_PAR_LE_MESSAGE_PRIVE',
  p_manuella_photo_url => null
);
commit;
