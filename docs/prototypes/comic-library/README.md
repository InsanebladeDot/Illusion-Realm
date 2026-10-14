# Comic editor regression

The editor keeps its original fixed layout. The right sidebar switches between layout properties and the storyboard directory. Enter finishes polygon editing except when typing in a field or modal.

“完成自定义排版” saves geometry, panel order, page dimensions and paper background into built-in or custom template categories. Pictures and prompts are excluded; saved layouts use numbered solid-color placeholders. The template library uses the global theme and primary color.

The workspace uses a fine dot grid with light/dark colors. The toolbar’s native color picker changes the template paper and gutters. This color is persisted in drafts and templates, appears in thumbnails and is used for PNG export. Dots belong to the workspace and are excluded from exported pictures.

Draft/project format: version 3. Unified user document section: `comicTemplates: { version: 1, templates: [...] }`. Old drafts/templates without `backgroundColor` use white. Invalid geometry and categories are rejected; unknown image fields are stripped.

Run schema compatibility checks from the repository root:

```powershell
node docs/prototypes/comic-library/verify-schema.cjs
```

Build the Next static export and record its fingerprint before the browser regression. Then run it alone:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
.\node_modules\.bin\electron.CMD docs/prototypes/comic-library/verify.cjs
```

The browser regression uses an isolated temporary profile and five rounds: real theme switching, merged sidebar/Enter, categorized saving with failure/retry, persistence/PNG/image tools, and 1100/390/320px layouts. `verification.json` records the outcome; PNG files capture the editor and library in both themes and narrow layouts. `failure.png` is retained from an intermediate failed run for diagnosis, not evidence of the final result.
