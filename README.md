# better-vault plugins

This is the plugin directory for [better-vault](https://github.com/better-vault/better-vault). Every plugin here was reviewed before it was merged, and the app and [better-vault.dev/plugins](https://better-vault.dev/plugins) list them straight from this repository.

## Install a plugin

Open better-vault, go to **Settings → Plugins → Browse**, and choose a plugin. Its dialog shows what it adds and what it may read or change, with a warning that it is a third-party plugin. Choose **Install…**, untick anything you don't want it to do, and confirm. You can turn it off or uninstall it at any time, which puts the app back as it was.

## What a plugin can be

| Kind            | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Studio tool** | A tool of its own in the Studio, beside the built-in ones, as a sandboxed page.                  |
| **Panel**       | A smaller page in the Studio sheet's Plugins group.                                              |
| **Mod**         | CSS for the whole app: layout, spacing, corners, type. It can load nothing and run nothing.      |
| **Theme**       | New colours for light and dark mode.                                                             |

Pages run in a sandbox with no network and no access to the app's storage, keys or settings. They reach the user's data only through the bridge, and only as far as the user allows. The [plugin docs](https://better-vault.dev/docs/plugins) explain how to build one.

## Submit a plugin

Each plugin lives in its creator's own public GitHub repository, and this directory lists it with a small file, `plugins/<id>.json`, that names the repository and the commit to list. Read [CONTRIBUTING.md](CONTRIBUTING.md), then open a pull request that adds your listing. The checks confirm you own the repository; once a maintainer has reviewed and merged it, the plugin appears in the app and on the website on its own, with your GitHub avatar and your repository's stars.

To update your plugin, raise its version and open a pull request that changes the listed commit. Only the repository's owner can do this.

## Request a plugin

If you have an idea but won't build it yourself, [open a plugin request](https://github.com/better-vault/better-vault-plugins/issues/new?template=plugin-request.yml).

## How the registry is made

`scripts/build.mjs` downloads each listed commit, checks it against the same rules the app uses (including a required cover and screenshots), bundles it into `dist/<id>-<version>.bvplugin.json`, copies its pictures into `assets/<id>/`, reads its repository's stars, and writes `registry.json` with each bundle's SHA-256. The app checks that hash before it installs anything. A workflow runs it on every push to `main` and every six hours; pull requests run `scripts/verify-owner.mjs` (the author owns the repository) and the same checks with `npm run validate`.
