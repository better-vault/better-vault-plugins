// Runs on every pull request: a listing (plugins/<id>.json) may be added or
// changed only by the owner of the repository it lists, so nobody can list
// someone else's work or push an update to a plugin that isn't theirs.
//
//   - A repository owned by a person: the pull request's author must be that person.
//   - A repository owned by an organization: the author must be a public member of it.
//   - An update may not move a plugin to another repository.
//   - Maintainers of this directory (owners, members, collaborators) may change anything.
//
// Everything else in a pull request from a creator must stay out of the way:
// only files under plugins/ may change.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;
const author = pr.user.login;
const maintainer = ["OWNER", "MEMBER", "COLLABORATOR"].includes(pr.author_association);
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "better-vault-plugins",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const base = pr.base.sha;
const changed = git("diff", "--name-status", `${base}...HEAD`)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status: status[0], path: paths.at(-1), from: paths[0] };
  });

const problems = [];
const listingAt = (ref, file) => {
  try {
    return JSON.parse(git("show", `${ref}:${file}`));
  } catch {
    return null;
  }
};

async function ownsRepo(user, repo) {
  const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!response.ok) return { ok: false, why: `${repo} can't be read (${response.status}).` };
  const info = await response.json();
  if (info.owner.type === "Organization") {
    const member = await fetch(`https://api.github.com/orgs/${info.owner.login}/public_members/${user}`, { headers });
    return member.status === 204
      ? { ok: true }
      : { ok: false, why: `@${user} is not a public member of ${info.owner.login}, which owns ${repo}.` };
  }
  return info.owner.login.toLowerCase() === user.toLowerCase()
    ? { ok: true }
    : { ok: false, why: `${repo} belongs to @${info.owner.login}, not @${user}.` };
}

if (maintainer) {
  console.log(`✓ @${author} maintains this directory.`);
  process.exit(0);
}

for (const file of changed) {
  if (!/^plugins\/[a-z0-9-]+\.json$/.test(file.path)) {
    problems.push(`${file.path}: only listings in plugins/ may change in a creator's pull request.`);
    continue;
  }
  if (file.status === "D") {
    const before = listingAt(base, file.path);
    const owns = before ? await ownsRepo(author, before.repo) : { ok: false, why: "unknown listing." };
    if (!owns.ok) problems.push(`${file.path}: only its owner can remove it. ${owns.why}`);
    continue;
  }
  const after = listingAt("HEAD", file.path);
  if (!after?.repo) {
    problems.push(`${file.path}: the listing can't be read.`);
    continue;
  }
  const before = file.status === "A" ? null : listingAt(base, file.from);
  if (before && before.repo.toLowerCase() !== after.repo.toLowerCase())
    problems.push(`${file.path}: an update can't move the plugin from ${before.repo} to ${after.repo}.`);
  const owns = await ownsRepo(author, after.repo);
  if (!owns.ok) problems.push(`${file.path}: ${owns.why}`);
}

if (problems.length) {
  console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
  process.exit(1);
}
console.log(`✓ @${author} owns every plugin this pull request lists or updates.`);
