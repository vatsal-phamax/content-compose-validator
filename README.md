# Ariya — Validator Suite

A browser-based validator suite with two tools:

- Content Compose Validator for `output_design_*.json`
- Template Validator for `template.json`

No backend, no build step - pure HTML/CSS/JS deployed to GitHub Pages.

## Home Page

The root page (`index.html`) is now a launcher with two cards that navigate to:

- `validators/content-compose-validator.html`
- `validators/template-validator.html`

## Access

The tool is protected by a key gate. Obtain the access key from your team lead.

**Two ways to open the tool:**

| Method            | How                                                   |
| ----------------- | ----------------------------------------------------- |
| URL (recommended) | Append `#your-key` to the URL and share the full link |
| Manual entry      | Visit the URL and type the key into the form          |

The key is hashed with SHA-256 in the browser and never transmitted anywhere. The session stays unlocked within the same browser tab.

## Usage

1. Open the home page and choose a validator card
2. **Upload** an `output_design_*.json` file via drag-and-drop or file picker — or **paste** raw JSON into the text area
3. Click **Run Validation**
4. Review results across two panels:

| Panel        | Contents                                                                    |
| ------------ | --------------------------------------------------------------------------- |
| **Findings** | All validation checks sorted by severity (Critical → Warning → Info → Pass) |
| **Explorer** | Generated Blocks, References, Content Selection, Raw JSON                   |

## Validation checks

| Check                                                       | Severity    |
| ----------------------------------------------------------- | ----------- |
| Reference block populated                                   | Fail / Warn |
| Template metadata refs non-empty                            | Fail        |
| All enabled blocks generated                                | Fail        |
| Subject line & preheader present                            | Fail        |
| `<sup>` tags inside block elements (not after closing tags) | Fail        |
| `<sup>` tags carry explicit color style                     | Warn        |
| No short-form abbreviated references                        | Warn        |
| No enabled instructions targeting Container nodes           | Warn        |
| No placeholder URLs (`example.com`, `lorem`, …)             | Warn        |
| Adjacent citations in ascending order                       | Warn        |
| Search chunks relevant to the symptom                       | Warn        |
| `constraints: false` blocks flagged                         | Warn        |
| Citation-required blocks have at least one `<sup>`          | Warn        |
| Generation time & token usage                               | Info        |

## Deployment

The tool deploys automatically to GitHub Pages on every push to `main` via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). No manual steps required.

**Prerequisites (one-time, done by repo admin):**

- GitHub Pages enabled in repository Settings → Pages → Source: GitHub Actions

## Changing the access key

1. Choose a new key string
2. Compute its SHA-256 hash — paste this in your browser console:
   ```js
   crypto.subtle
     .digest("SHA-256", new TextEncoder().encode("your-new-key"))
     .then((b) =>
       console.log(
         Array.from(new Uint8Array(b))
           .map((x) => x.toString(16).padStart(2, "0"))
           .join(""),
       ),
     );
   ```
3. Replace the `ACCESS_HASH` constant in [`assets/js/access.js`](assets/js/access.js)
4. Push to `main` — the new key takes effect after the deploy completes (~1 min)
5. Distribute the new key to your team out-of-band (Slack, email, etc.)

> Do not commit the plain-text key anywhere in the repository.

## Local development

The Web Crypto API requires a secure context. Use a local HTTPS server:

```bash
# Python 3 (simplest)
python -m http.server 8080
# then open http://localhost:8080 — localhost counts as a secure context
```

Or use the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) VS Code extension (serves on `localhost`).

Opening `index.html` directly via `file://` will show a "Requires HTTPS" error on the gate screen.
