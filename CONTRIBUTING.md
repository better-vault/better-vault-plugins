# Contributing a plugin

Thank you for building for better-vault. This page explains how to submit a plugin and what reviewers look for.

## Layout

Each plugin is a folder in `plugins/`, named after its id:

```text
plugins/piano-coach/
  manifest.json      the plugin's manifest
  files/             everything the plugin ships: HTML, CSS, JavaScript
  screenshots/       optional pictures for the directory (not shipped)
  README.md          what it does, for reviewers and users (not shipped)
```

The manifest follows the format in the [plugin docs](https://better-vault.dev/docs/plugins/manifest). Use `"manifestVersion": 2`, an id of lowercase words joined by hyphens, and a version like `1.0.0`. Every file the manifest names (a panel's `entry`, a mod's `file`) must be in `files/`.

## Steps

1. Fork this repository and add your folder under `plugins/`.
2. Run `npm install` and `npm run validate`. It checks your manifest, your mod CSS and the bundle size with the app's own rules.
3. Open a pull request using the template. Say what the plugin does and why it asks for each permission.

Do not commit `registry.json` or anything in `dist/`: they are rebuilt when your pull request is merged.

## What reviewers check

| Area            | We look for                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **Permissions** | It asks only for what it uses, and says why. `write:` permissions and `use:ai` need a clear reason. |
| **Code**        | Readable source, no minified or obfuscated code, no attempts to leave the sandbox.                  |
| **Mods**        | CSS that targets the `data-bv` hooks and tokens, and keeps the app usable in light and dark mode.   |
| **Content**     | It works without placeholder data, in the user's language where it shows text, and is accessible.   |
| **Licence**     | Your plugin is MIT-licensed, like this repository, and uses only material you may share.            |

To update a plugin, raise its `version` in the manifest and open a pull request. Users see the update in the app.
