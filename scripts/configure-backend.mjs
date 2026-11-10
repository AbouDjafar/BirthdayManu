import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const filename = process.argv[2] || "birthday.private.json";
  if (!filename.endsWith(".private.json")) throw new Error("Le fichier de contenu doit se terminer par .private.json pour rester ignoré par Git.");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key?.startsWith("sb_secret_")) throw new Error("Renseigner SUPABASE_URL et SUPABASE_SECRET_KEY dans .env.local.");
  if (new URL(url).protocol !== "https:") throw new Error("SUPABASE_URL doit utiliser HTTPS.");
  const content = JSON.parse(await readFile(resolve(filename), "utf8"));
  const questions = JSON.parse(await readFile(new URL("../src/app/questions.json", import.meta.url), "utf8"));
  if (!content.correctAnswers || Object.keys(content.correctAnswers).length !== questions.length) throw new Error("Fournir exactement une réponse pour chaque question.");
  const answers = Object.fromEntries(questions.map((question) => {
    const index = content.correctAnswers[question.id];
    if (!Number.isInteger(index) || index < 0 || index >= question.options.length) throw new Error(`Réponse manquante ou invalide pour ${question.id} (indice à partir de zéro).`);
    return [question.id, question.options[index]];
  }));
  if (typeof content.manuellaText !== "string" || !content.manuellaText.trim()) throw new Error("La lettre privée est obligatoire.");
  if (content.manuellaPhotoUrl) throw new Error("La première version utilise une lettre texte seule. Ne pas placer de photo privée dans un bucket public.");
  const linkFile = resolve("manuella-link.private.json");
  let code;
  try {
    const previous = JSON.parse(await readFile(linkFile, "utf8"));
    if (previous.projectUrl !== url || !/^[A-Za-z0-9_-]{43}$/.test(previous.code)) {
      throw new Error("Le fichier du lien privé ne correspond pas au projet configuré.");
    }
    code = previous.code;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    code = randomBytes(32).toString("base64url");
    const siteUrl = process.env.SITE_URL || "https://aboudjafar.github.io/BirthdayManu/";
    const site = new URL(siteUrl);
    if (site.protocol !== "https:") throw new Error("SITE_URL doit utiliser HTTPS.");
    site.hash = `/m-${code}`;
    // Save first so a network failure cannot discard the only copy of the code.
    await writeFile(linkFile, JSON.stringify({ projectUrl: url, code, link: site.href }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.rpc("configure_birthday", {
    p_correct_answers: answers,
    p_code_hash: createHash("sha256").update(code).digest("hex"),
    p_manuella_text: content.manuellaText.trim(),
    p_manuella_photo_url: null,
  });
  if (error) throw new Error("Configuration Supabase refusée. Vérifier que database/setup.sql a été appliqué et que la clé privilégiée correspond au projet.");
  console.log("Configuration terminée. Le lien privé est enregistré uniquement dans manuella-link.private.json (ignoré par Git).");
}

main().catch((error) => {
  console.error(error instanceof SyntaxError ? "Le fichier JSON privé est invalide." : error.message);
  process.exitCode = 1;
});
