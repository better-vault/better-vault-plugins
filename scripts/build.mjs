// Checks every plugin in plugins/ with the app's rules, bundles each into
// dist/<id>-<version>.bvplugin.json and writes registry.json. With --check it
// only checks (pull requests). Keep the rules in step with the app:
// lib/plugins/manifest.ts and lib/plugins/css.ts in better-vault/better-vault.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const root = path.resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");

const PLUGIN_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const permissions = [
  "read:notebooks", "read:sources", "read:notes", "read:skills", "read:calendar",
  "write:notes", "write:calendar", "use:ai",
];
const icons = [
  "puzzle", "chart", "table", "book", "calendar", "note", "palette", "sparkles",
  "code", "globe", "image", "music", "video", "brain", "clock", "target",
];
const tokens = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
  "muted-foreground", "accent", "accent-foreground", "destructive", "border", "input", "ring",
  "info", "info-foreground", "success", "warning", "chart-1", "chart-2", "chart-3", "chart-4",
  "chart-5",
];
const COLOUR = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(\s*[-0-9.%\s,/a-z]*\))$/i;
const colour = z.string().max(80).regex(COLOUR).refine((value) => !/url|var|expression|[;{}<>\\]/i.test(value));
const palette = z.partialRecord(z.enum(tokens), colour);
const MAX_BYTES = 2 * 1024 * 1024;

const manifestSchema = z.object({
  manifestVersion: z.union([z.literal(1), z.literal(2)]),
  id: z.string().regex(PLUGIN_ID),
  name: z.string().min(1).max(60),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/),
  description: z.string().min(1).max(500),
  author: z.string().min(1).max(100),
  icon: z.enum(icons).default("puzzle"),
  permissions: z.array(z.enum(permissions)).default([]),
  tags: z.array(z.string().max(30)).max(8).default([]),
  contributes: z
    .object({
      panels: z
        .array(
          z.object({
            id: z.string().regex(PLUGIN_ID),
            title: z.string().min(1).max(60),
            slot: z.enum(["studio", "studio-tool"]),
            entry: z.string().max(200).default("index.html"),
            description: z.string().max(140).optional(),
          }),
        )
        .max(10)
        .default([]),
      theme: z.object({ light: palette.optional(), dark: palette.optional() }).optional(),
      mods: z
        .array(z.object({ id: z.string().regex(PLUGIN_ID), title: z.string().min(1).max(60), file: z.string().max(200) }))
        .max(10)
        .default([]),
    })
    .refine((value) => value.panels.length > 0 || value.theme || value.mods.length > 0, "Add a panel, a theme or a mod."),
});

function unsafeCss(css) {
  if (css.length > 200_000) return "the CSS is larger than 200 KB.";
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\\[0-9a-f]/i.test(plain)) return "escaped characters are not allowed.";
  if (/@import/i.test(plain)) return "@import is not allowed.";
  if (/<\/?\s*style/i.test(plain)) return "the CSS may not close its <style>.";
  if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(plain)) return "scripting in CSS is not allowed.";
  for (const match of plain.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi))
    if (!/^data:(image|font)\//i.test(match[2].trim())) return "url() may only hold a data: picture or font.";
  return null;
}

/** Every file under a folder, by its path relative to that folder. */
function walk(folder, prefix = "") {
  if (!existsSync(folder)) return {};
  const out = {};
  for (const name of readdirSync(folder).sort()) {
    if (name.startsWith(".")) continue;
    const full = path.join(folder, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) Object.assign(out, walk(full, rel));
    else out[rel] = readFileSync(full, "utf8");
  }
  return out;
}

const problems = [];
const entries = [];
const bundles = [];
const pluginsDir = path.join(root, "plugins");
for (const id of readdirSync(pluginsDir).sort()) {
  const dir = path.join(pluginsDir, id);
  if (!statSync(dir).isDirectory()) continue;
  const fail = (message) => problems.push(`plugins/${id}: ${message}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  } catch (error) {
    fail(`manifest.json can't be read (${error.message})`);
    continue;
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fail(`manifest ${issue.path.join(".") || ""}: ${issue.message}`);
    continue;
  }
  const manifest = parsed.data;
  if (manifest.id !== id) fail(`its id is "${manifest.id}", but its folder is "${id}".`);
  const files = walk(path.join(dir, "files"));
  for (const filePath of Object.keys(files))
    if (!/^(?!.*\.\.)[\w-][\w./-]{0,199}$/.test(filePath)) fail(`bad file path: ${filePath}`);
  for (const panel of manifest.contributes.panels)
    if (!(panel.entry in files)) fail(`panel "${panel.id}" opens ${panel.entry}, which is not in files/.`);
  for (const mod of manifest.contributes.mods) {
    if (!(mod.file in files)) fail(`mod "${mod.id}" uses ${mod.file}, which is not in files/.`);
    else {
      const problem = unsafeCss(files[mod.file]);
      if (problem) fail(`mod "${mod.id}": ${problem}`);
    }
  }
  for (const [filePath, body] of Object.entries(files)) {
    if (/\.(html?|js|mjs)$/.test(filePath) && /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(body))
      fail(`${filePath} tries to use the network, which plugins can't.`);
  }
  const bundle = JSON.stringify({ manifest: raw, files });
  if (bundle.length > MAX_BYTES) fail("the plugin is larger than 2 MB.");
  const screenshots = existsSync(path.join(dir, "screenshots"))
    ? readdirSync(path.join(dir, "screenshots"))
        .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
        .sort()
        .map((name) => `plugins/${id}/screenshots/${name}`)
    : [];
  const bundlePath = `dist/${id}-${manifest.version}.bvplugin.json`;
  bundles.push({ bundlePath, bundle });
  entries.push({
    id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    icon: manifest.icon,
    tags: manifest.tags,
    permissions: manifest.permissions,
    adds: {
      studioTools: manifest.contributes.panels.filter((panel) => panel.slot === "studio-tool").length,
      panels: manifest.contributes.panels.filter((panel) => panel.slot === "studio").length,
      mods: manifest.contributes.mods.length,
      theme: Boolean(manifest.contributes.theme),
    },
    bundle: bundlePath,
    sha256: createHash("sha256").update(bundle).digest("hex"),
    size: bundle.length,
    screenshots,
  });
}

if (problems.length) {
  console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${entries.length} plugin(s) pass the checks.`);
if (check) process.exit(0);

// Keep each plugin's date from the last registry unless its bundle changed.
const previous = existsSync(path.join(root, "registry.json"))
  ? JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8"))
  : { plugins: [] };
const now = new Date().toISOString();
const registry = {
  version: 1,
  updatedAt: now,
  plugins: entries
    .map((entry) => {
      const before = previous.plugins.find((each) => each.id === entry.id);
      return { ...entry, updatedAt: before && before.sha256 === entry.sha256 ? before.updatedAt : now };
    })
    .sort((a, b) => a.name.localeCompare(b.name)),
};
rmSync(path.join(root, "dist"), { recursive: true, force: true });
mkdirSync(path.join(root, "dist"), { recursive: true });
for (const { bundlePath, bundle } of bundles) writeFileSync(path.join(root, bundlePath), bundle);
const unchanged =
  JSON.stringify(previous.plugins?.map(({ updatedAt, ...rest }) => rest)) ===
  JSON.stringify(registry.plugins.map(({ updatedAt, ...rest }) => rest));
if (!unchanged) writeFileSync(path.join(root, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(unchanged ? "Registry unchanged." : `Wrote registry.json and ${bundles.length} bundle(s).`);
