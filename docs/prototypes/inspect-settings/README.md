# Metadata views and SiliconFlow setup

Local image inspection offers original text and two-space formatted JSON for prompts, full generation information and embedded JSON fields. Original text remains exact. Plain text can be expanded, with the JSON option disabled and explained. Copy uses the current view; cards and dialogs share mode state. Escape, backdrop clicks and the close button dismiss the native dialog; focus returns to the trigger.

The settings Agent section links to `https://siliconflow.cn/`. The setup button previews the four steps through its native hover tooltip and opens the existing `DocumentDialog` on click/tap. Both languages use the existing typed `useTranslation` catalogue. Instructions were checked against [SiliconFlow quickstart](https://docs.siliconflow.cn/cn/userguide/quickstart).

Renderer links reuse standard `target="_blank"` anchors. The main window delegates HTTP(S) links to the system browser and denies child application windows. Restart the application after changing the main process to enable this behavior.

The verification uses an isolated hidden Electron profile, the existing CDP driver and a fresh static export. It uploads synthetic PNGs through the real parser and checks format switching, copying, dialog synchronization/focus, plain-text fallback, existing locale switching, registration help and 390/320px layouts. The external-link handler is also checked with a mocked browser opener; no real registration or API-key operations are performed.

After building and recording the source fingerprint, run from the repository root:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
.\node_modules\.bin\electron.CMD docs/prototypes/inspect-settings/verify.cjs
```

`verification.json` records the passing result. `metadata-json.png`, `metadata-390.png`, `setup-zh-CN.png`, `setup-en.png` and `setup-320.png` show the final UI. `failure.png` is retained from an intermediate test run for diagnosis.
