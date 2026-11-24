// Builds the directory. Each plugin lives in its creator's own public GitHub
// repository; plugins/<id>.json names that repository and the commit to list:
//
//   { "repo": "owner/name", "commit": "<40-character SHA>" }
//
// For each listing this fetches that exact commit, checks the plugin with the
// app's rules (manifest, mod CSS, size, no network), requires a cover and at
// least one screenshot, bundles it into dist/<id>-<version>.bvplugin.json,
// copies its pictures into assets/<id>/, reads the repository's stars and
// owner, and writes registry.json. With --check it only checks (pull
// requests). Keep the rules in step with the app: lib/plugins/manifest.ts and
// lib/plugins/css.ts in better-vault/better-vault.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const graphColour = z.union([z.string().regex(/^[a-z][a-z0-9-]{0,40}$/), colour]);
const graphStyle = z.object({
  layout: z.enum(["force", "radial"]).default("force"),
  background: graphColour.optional(),
  node: z.object({ color: z.union([z.literal("vault"), graphColour]).default("vault"), size: z.number().min(0.4).max(3).default(1), hubRing: z.boolean().default(false) }).partial().default({}),
  link: z.object({ color: graphColour, width: z.number().min(0.25).max(4), opacity: z.number().min(0.05).max(1), curved: z.boolean() }).partial().default({}),
  label: z.object({ font: z.enum(["sans", "mono", "serif"]), color: graphColour, uppercase: z.boolean(), size: z.number().min(8).max(18) }).partial().default({}),
});

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
      graph: z
        .array(z.object({ id: z.string().regex(PLUGIN_ID), title: z.string().min(1).max(60), style: graphStyle }))
        .max(5)
        .default([]),
    })
    .refine(
      (value) => value.panels.length > 0 || value.theme || value.mods.length > 0 || value.graph.length > 0,
      "Add a panel, a theme, a mod or a graph style.",
    ),
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

const listingSchema = z.object({
  repo: z.string().regex(/^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/, "Use owner/name."),
  commit: z.string().regex(/^[0-9a-f]{40}$/, "Use the full 40-character commit SHA."),
});
const MAX_COVER = 2 * 1024 * 1024;
const MAX_SCREENSHOT = 4 * 1024 * 1024;

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "better-vault-plugins",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};
async function github(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${pathname}`);
  return response.json();
}

/** Downloads a repository at a commit and unpacks it; returns its folder. */
async function checkout(repo, commit, into) {
  const response = await fetch(`https://codeload.github.com/${repo}/tar.gz/${commit}`, {
    headers: { "User-Agent": "better-vault-plugins" },
  });
  if (!response.ok) throw new Error(`can't download ${repo} at ${commit} (${response.status}).`);
  const archive = path.join(into, "source.tar.gz");
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const folder = path.join(into, "source");
  mkdirSync(folder);
  execFileSync("tar", ["-xzf", archive, "-C", folder, "--strip-components=1", "--no-same-owner"]);
  return folder;
}

const problems = [];
const entries = [];
const bundles = [];
const pictures = [];
const previous = existsSync(path.join(root, "registry.json"))
  ? JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8"))
  : { plugins: [] };
const pluginsDir = path.join(root, "plugins");
const work = mkdtempSync(path.join(tmpdir(), "bv-plugins-"));

for (const file of readdirSync(pluginsDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const id = file.slice(0, -5);
  const fail = (message) => problems.push(`plugins/${file}: ${message}`);
  if (!PLUGIN_ID.test(id)) {
    fail("name the file after the plugin's id: lowercase words joined by hyphens.");
    continue;
  }
  let listing;
  try {
    listing = listingSchema.parse(JSON.parse(readFileSync(path.join(pluginsDir, file), "utf8")));
  } catch (error) {
    fail(`the listing can't be read (${error.message})`);
    continue;
  }
  let repoInfo;
  let dir;
  try {
    repoInfo = await github(`/repos/${listing.repo}`);
    if (repoInfo.private) throw new Error("the repository must be public.");
    dir = await checkout(listing.repo, listing.commit, mkdtempSync(path.join(work, `${id}-`)));
  } catch (error) {
    fail(error.message);
    continue;
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  } catch (error) {
    fail(`manifest.json can't be read at the repository's root (${error.message})`);
    continue;
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fail(`manifest ${issue.path.join(".") || ""}: ${issue.message}`);
    continue;
  }
  const manifest = parsed.data;
  if (manifest.id !== id) fail(`its id is "${manifest.id}", but its listing is "${file}".`);
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

  // Pictures are required: a cover for its card and at least one screenshot for its dialog.
  const cover = ["cover.png", "cover.jpg", "cover.jpeg", "cover.webp"].find((name) => existsSync(path.join(dir, name)));
  if (!cover) fail("add cover.png (1200 × 630) at the repository's root: the card's header picture.");
  else if (statSync(path.join(dir, cover)).size > MAX_COVER) fail(`${cover} is larger than 2 MB.`);
  const shots = existsSync(path.join(dir, "screenshots"))
    ? readdirSync(path.join(dir, "screenshots")).filter((name) => /^[\w.-]+\.(png|jpe?g|webp)$/i.test(name)).sort()
    : [];
  if (shots.length === 0) fail("add at least one picture of the plugin at work in screenshots/.");
  if (shots.length > 6) fail("use six screenshots at most.");
  for (const name of shots)
    if (statSync(path.join(dir, "screenshots", name)).size > MAX_SCREENSHOT) fail(`screenshots/${name} is larger than 4 MB.`);

  // An update must raise the version.
  const before = previous.plugins.find((each) => each.id === id);
  if (before?.commit && before.commit !== listing.commit && !newer(manifest.version, before.version))
    fail(`raise the manifest's version above ${before.version} for this update.`);

  const coverPath = cover ? `assets/${id}/${cover.replace("jpeg", "jpg")}` : undefined;
  if (cover) pictures.push({ from: path.join(dir, cover), to: coverPath });
  const screenshots = shots.slice(0, 6).map((name) => {
    const to = `assets/${id}/screenshots/${name}`;
    pictures.push({ from: path.join(dir, "screenshots", name), to });
    return to;
  });
  const bundlePath = `dist/${id}-${manifest.version}.bvplugin.json`;
  bundles.push({ bundlePath, bundle });
  entries.push({
    id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: repoInfo.owner.login,
    icon: manifest.icon,
    tags: manifest.tags,
    permissions: manifest.permissions,
    adds: {
      studioTools: manifest.contributes.panels.filter((panel) => panel.slot === "studio-tool").length,
      panels: manifest.contributes.panels.filter((panel) => panel.slot === "studio").length,
      mods: manifest.contributes.mods.length,
      theme: Boolean(manifest.contributes.theme),
      graphStyles: manifest.contributes.graph.length,
    },
    bundle: bundlePath,
    sha256: createHash("sha256").update(bundle).digest("hex"),
    size: bundle.length,
    repo: listing.repo,
    commit: listing.commit,
    owner: repoInfo.owner.login,
    ownerType: repoInfo.owner.type === "Organization" ? "organization" : "user",
    stars: repoInfo.stargazers_count,
    ...(coverPath ? { cover: coverPath } : {}),
    screenshots,
  });
}

/** Whether version a is above version b (major.minor.patch). */
function newer(a, b) {
  const parts = (version) => version.split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let at = 0; at < 3; at++) if (x[at] !== y[at]) return x[at] > y[at];
  return false;
}

if (problems.length) {
  rmSync(work, { recursive: true, force: true });
  console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${entries.length} plugin(s) pass the checks.`);
if (check) {
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

// Keep each plugin's date from the last registry unless its bundle changed.
const now = new Date().toISOString();
const registry = {
  version: 1,
  updatedAt: now,
  plugins: entries
    .map((entry) => {
      const before = previous.plugins.find((each) => each.id === entry.id);
      return { ...entry, updatedAt: before && before.sha256 === entry.sha256 ? before.updatedAt : now };
    })
    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name)),
};
for (const folder of ["dist", "assets"]) {
  rmSync(path.join(root, folder), { recursive: true, force: true });
  mkdirSync(path.join(root, folder), { recursive: true });
}
for (const { bundlePath, bundle } of bundles) writeFileSync(path.join(root, bundlePath), bundle);
for (const { from, to } of pictures) {
  mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  copyFileSync(from, path.join(root, to));
}
rmSync(work, { recursive: true, force: true });
const unchanged =
  JSON.stringify(previous.plugins?.map(({ updatedAt, ...rest }) => rest)) ===
  JSON.stringify(registry.plugins.map(({ updatedAt, ...rest }) => rest));
if (!unchanged) writeFileSync(path.join(root, "registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(unchanged ? "Registry unchanged." : `Wrote registry.json, ${bundles.length} bundle(s) and their pictures.`);
