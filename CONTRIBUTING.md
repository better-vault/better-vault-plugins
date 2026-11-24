# Contributing a plugin

Thank you for building for better-vault. A plugin lives in **your own public GitHub repository**; this directory lists it. This page explains how to list a plugin, how to update it, and what reviewers look for.

## Your repository

Put these at the root of your repository:

```text
manifest.json      the plugin's manifest
files/             everything the plugin ships: HTML, CSS, JavaScript
cover.png          the card's header picture, 1200 × 630 (required, 2 MB at most)
screenshots/       one to six pictures of the plugin at work, shown in its dialog (required, 4 MB each at most)
README.md          what it does, for reviewers and users
LICENSE            MIT, like this directory
```

The manifest follows the format in the [plugin docs](https://better-vault.dev/docs/plugins/manifest). Use `"manifestVersion": 2`, an id of lowercase words joined by hyphens, and a version like `1.0.0`. Every file the manifest names (a panel's `entry`, a mod's `file`) must be in `files/`. A plugin without a cover or without a screenshot is refused.

Pictures should show the plugin with sample data, never your own notes or sources.

## List a plugin

1. Push your plugin to your repository and copy the full 40-character SHA of the commit to list (`git rev-parse HEAD`).
2. Fork this repository and add `plugins/<id>.json`, named after your plugin's id:

   ```json
   {
     "repo": "your-name/your-plugin",
     "commit": "0123456789abcdef0123456789abcdef01234567"
   }
   ```

3. Run `npm install` and `npm run validate`. It downloads that commit and checks it with the app's own rules.
4. Open a pull request using the template.

The checks confirm that **you own the repository**: its owner must be you, or, for a repository in an organization, you must be a public member of that organization. A maintainer reviews the code, and merging lists it. The app and better-vault.dev show it within minutes, with your GitHub avatar and your repository's stars.

## Update a plugin

Raise `version` in your manifest, push, and open a pull request that changes only the `commit` in your listing. The same ownership check runs, so only you can update your plugin, and an update can't point the listing at another repository. Once it is merged, people who installed your plugin see an **Update** button in Settings → Plugins.

Do not commit `registry.json`, `dist/` or `assets/`: they are rebuilt from the listed commits when your pull request is merged, and every six hours to refresh stars.

## What reviewers check

| Area            | We look for                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **Permissions** | It asks only for what it uses, and says why. `write:` permissions and `use:ai` need a clear reason. |
| **Code**        | Readable source, no minified or obfuscated code, no attempts to leave the sandbox.                  |
| **Mods**        | CSS that targets the `data-bv` hooks and tokens, and keeps the app usable in light and dark mode.   |
| **Pictures**    | A cover and screenshots that show what the plugin really does, with sample data.                    |
| **Licence**     | Your plugin is MIT-licensed and uses only material you may share.                                   |
