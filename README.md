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

Read [CONTRIBUTING.md](CONTRIBUTING.md), then open a pull request that adds your plugin under `plugins/<id>/`. Once it is reviewed and merged, the registry is rebuilt and the plugin appears in the app and on the website on its own, with no release.

## Request a plugin

If you have an idea but won't build it yourself, [open a plugin request](https://github.com/better-vault/better-vault-plugins/issues/new?template=plugin-request.yml).

## How the registry is made

`scripts/build.mjs` checks every plugin against the same rules the app uses, bundles each into `dist/<id>-<version>.bvplugin.json`, and writes `registry.json` with each bundle's SHA-256. The app checks that hash before it installs anything. A workflow runs it on every push to `main`; pull requests run the same checks with `npm run validate`.
