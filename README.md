# Field Day

Field Day fills out web forms for you with realistic fake information, then submits them. It's useful for checking that a form works without typing the same test data over and over.

It will:

- Fill in names, emails, phone numbers, addresses, companies, messages, and similar fields with believable fake data
- Pick a **random option** in dropdowns, radio buttons, and checkboxes
- Always tick required boxes such as "I agree to the terms"
- Fill in dates, numbers, sliders, and file uploads (it attaches a small dummy file)
- Click through multi-step forms ("Next", "Continue") until it reaches the end
- Submit the form, **unless** there's a CAPTCHA ("I'm not a robot"). In that case it waits for you to solve it.
- Skip hidden "honeypot" fields that websites use to catch bots

> Only use Field Day on forms you own or have permission to test. Every submission is real: it may send emails, create records, or notify people.

---

## Ways to use it

| | **Browser extension** (recommended) | **Local app** |
|---|---|---|
| Setup | Install once in Edge or Chrome | Install Node.js and the project |
| How you start | Right-click the page, or click the toolbar icon | Paste a URL into the app |
| Works on forms inside embedded frames from other sites (e.g. some HubSpot forms) | Yes | Yes |
| Continues after each page reload by itself | Yes | Yes |
| Best for | Everyday testing | Repeat or unattended testing |

---

## Option 1: The browser extension (recommended)

### Install it (testing build)

1. In the project folder, run `npm install` (first time only), then:
   ```
   npm run build:extension
   ```
   This creates the extension in `dist/extension`.
2. Open the extensions page: `edge://extensions` in Edge or `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `dist/extension` folder.
5. Optional: pin **Field Day** to the toolbar using the puzzle-piece (Extensions) button.

After changing the code, run `npm run build:extension` again and click the **reload** icon on the Field Day card in the extensions page.

To use it on pages opened from your computer (`file://`), open the extension's **Details** and turn on **Allow access to file URLs**.

### Use it

1. Open the page that has the form.
2. **Right-click** anywhere on the page and choose **Field Day: fill a form on this page**, or click the **Field Day** toolbar icon.
3. A panel opens in the top-right corner and lists every form on the page, including forms embedded from other websites. Hover over one to highlight it, then select it.
4. Optional: open **Options** to [set a test email or fixed values](#options).
5. Click **Fill form**.

The panel then shows each field it filled and what it entered, and whether the form was submitted.

If a **CAPTCHA** is detected, the form is filled but not submitted. Solve the CAPTCHA on the page, then click **Submit now** in the panel, or submit the form yourself.

To fill but not submit, untick **Submit after filling**.

When a run reloads the page (multiple entries, conditionals), the panel **reopens by itself**. Your settings (email pattern, pinned values, checkboxes) are remembered and shared across all websites.

Want to try it first? Use the [demo form](https://r3hab-media.github.io/field-day/demo.html).

It can't run on browser pages such as `edge://` or `chrome://` pages or the extension stores. The toolbar icon shows **!** if you try.

---

## Option 2: The local app

The local app opens its own browser window, so you can watch it work.

### Install (one time)

1. Install **Node.js** (version 20 or newer) from <https://nodejs.org>. Choose the "LTS" version.
2. Download this project, either with **Code → Download ZIP** on GitHub (unzip it) or with git:
   ```
   git clone https://github.com/r3hab-media/field-day.git
   ```
3. Open a terminal in the project folder. On Windows, you can open the folder in File Explorer, click the address bar, type `cmd`, and press Enter.
4. Run:
   ```
   npm install
   ```
   This downloads everything needed, including a browser for the app to control. It may take a few minutes the first time.

### Use it with the web interface (easiest)

1. In the project folder, run:
   ```
   npm run ui
   ```
2. Open <http://localhost:3210> in your browser.
3. Paste the form's URL and click **Load forms**. A separate browser window opens with the page.
4. Choose a form from the list and click **Fill form**.
5. Watch the browser window. The results appear in the web interface.

If a **CAPTCHA** is detected, solve it in the browser window that opened, then click **I solved it, submit now**. If you submitted it yourself, click **I submitted it myself**.

Other controls:

- **Submit after filling**: untick to fill without submitting.
- **Headless**: runs without showing the browser window. CAPTCHAs can't be solved in this mode.
- **Rescan**: use this if a form only appears after you close a popup or cookie banner in the browser window.
- **Close browser**: closes the browser window when you're done.

When you're finished, go back to the terminal and press **Ctrl+C** to stop the app.

### Use it from the command line

```
node src/cli.js https://example.com/contact
```

If the page has more than one form, it lists them and asks which one to fill. Results print in the terminal.

Useful extras:

| Add this | What it does |
|---|---|
| `--no-submit` | Fill the form but don't submit it |
| `--headless` | Don't show the browser window |
| `--form 2` | Choose form #2 without being asked |
| `--email "qa+{random}@yourcompany.com"` | Use your own test email format |
| `--set company="QA Team"` | Always use this value for a field (repeat for more fields) |
| `--help` | Show all options |

Example:

```
node src/cli.js https://example.com/contact --no-submit --email "qa+{random}@yourcompany.com" --set company="QA Team"
```

---

## Options

Both versions have the same two optional settings.

### Email pattern

By default, emails look like `mary.kim.6hmq7z@example.com`. These addresses don't belong to anyone.

To receive the confirmation emails yourself, enter a pattern. These placeholders are replaced automatically:

| Placeholder | Becomes |
|---|---|
| `{random}` | A short random code, e.g. `7k2mxa` |
| `{timestamp}` | The current time as a number |
| `{first}` / `{last}` | The fake first / last name being used |

Example: `qa+{random}@yourcompany.com` produces `qa+7k2mxa@yourcompany.com`. Many email providers, including Gmail and Outlook, deliver `name+anything@` to `name@`.

### Pinned values

Use these when you want a specific value instead of a random one. Enter one per line in the format `field=value`:

```
company=QA Team
country=United States
topic=Support
```

- The text before `=` is matched against the field's name, ID, or label, so `company` matches a field labeled "Company Name".
- For dropdowns and radio buttons, the value must match one of the visible options.
- For checkboxes, use `yes` or `no`. For a group of checkboxes, list the options separated by commas.

The settings are remembered the next time you use the tool.

### Multiple entries

Use the **Entries** dropdown to submit the same form up to **5** times in a row (or `--entries 3` on the command line). Each entry reloads the form and uses new random data, and the results show whether each one went through. If one entry fails, the rest still run.

The dropdown is hidden when **Search for conditionals** is ticked, because the conditionals plan decides how many submissions to make.

### Auto-continue

When running multiple entries or a conditionals plan, tick **Auto-continue to the next submission** to run them all without stopping. Once a submission is confirmed, the form reloads and the next one starts automatically.

- **Unticked (default):** one submission at a time. The extension shows a button such as **Reload for entry 2 of 3**; the local app shows **Run next**.
- **If a submission isn't confirmed,** auto-continue pauses and asks whether to **Continue** with the rest or **Stop**.

### Search for conditionals

Some forms show extra questions only for certain answers. For example, answering **Yes** to "Do you require electrical access?" reveals "I will… use facility electricity / provide my own electricity".

Tick **Search for conditionals** (or use `--conditionals` on the command line) and Field Day will:

1. Try every option of each dropdown, radio button, and checkbox, and note which new fields appear. It checks up to 3 levels deep, so it also catches a revealed question that reveals more questions.
2. Show what it found and a **plan**: the list of submissions needed to try every branch at least once.
3. Wait for you to confirm, then reload the form and submit it once per planned run, forcing that run's choices. Everything else stays random.

Independent conditionals are tested side by side, so the number of submissions stays small. For example, 3 branches of one question plus 2 of another need 3 submissions, not 6. Options that reveal nothing are grouped into a single branch.

---

## Troubleshooting

**"No forms found"**
The form may still be loading, or hidden behind a popup or cookie banner. Close the popup, then click **Rescan**.

**"Still failing validation" appears in the results**
Some fields didn't accept the generated value, for example a strict format rule. The message tells you which fields. Use a [pinned value](#pinned-values) to supply a valid one.

**A dropdown wasn't filled**
Some custom-built dropdowns aren't recognized. Untick **Submit after filling**, pick the option yourself, then submit.

**"Could not find a submit button"**
The form uses an unusual button. Untick **Submit after filling**, let it fill, then click the button yourself.

**`npm` or `node` is "not recognized"**
Node.js isn't installed, or the terminal was opened before installing it. Install Node.js, then open a new terminal.

---

## For developers

```
src/engine/engine.js      Shared fill logic (runs inside the web page)
src/panel/panel.js        Panel UI the extension injects into the page
src/extension/            Extension manifest, service worker, and page helper
src/extension/icons/      Logo (logo.svg, logo-small.svg) and the PNG icons rendered from it
src/runner.js             Browser automation with Playwright
src/cli.js                Command-line interface
src/server.js, src/ui/    Local web interface (localhost only)
site/                     GitHub Pages site, privacy policy, and demo form
store/                    Store screenshots, promo tiles, and LISTING.md (the store submission kit)
scripts/build-pages.js    Builds the Pages site into dist/
scripts/build-extension.js  Builds the extension into dist/extension/
scripts/package-extension.js  Zips the extension for the stores
scripts/store-assets.js   Renders the icons and store images
```

- `npm run build:extension` builds the extension into `dist/extension/`.
- `npm run package` builds the extension and zips it as `dist/field-day-<version>.zip` for the Chrome Web Store and Edge Add-ons. See [store/LISTING.md](store/LISTING.md) for everything to fill in on each store.
- `npm run store-assets` re-renders the icons from the logo and the store images from the panel on the demo form. It uses your installed Chrome.
- `npm run build:pages` builds the GitHub Pages site into `dist/`.
- To test locally, open `dist/index.html` and `site/demo.html` in a browser.
- **Publishing:** push to `main` on GitHub, then go to **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` builds and deploys the site automatically on every push.

---

## Support Field Day

Field Day is free, with no ads or tracking. If it saves you time, you can [buy me a coffee](https://buymeacoffee.com/r3habmedia).
