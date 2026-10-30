# Store submission kit

Everything needed to fill in the Chrome Web Store and Microsoft Edge Add-ons dashboards for Field Day 1.0.0. Both stores take the same ZIP and the same description. Copy each block into the matching field.

Repository: https://github.com/r3hab-media/field-day

Project site: https://r3hab-media.github.io/field-day/ (built from `site/` and deployed by `.github/workflows/pages.yml` on every push to `main`). The site hosts the privacy policy and the demo form that the reviewers use, so it has to be live before you submit.

## 0. Set up the repository (first time only)

1. On GitHub, create a new **public** repository named `field-day` under `r3hab-media`, with no README, license or .gitignore (the project already has them).
2. Point the local project at it and push:
   ```
   git remote set-url origin https://github.com/r3hab-media/field-day.git
   git push -u origin main
   ```
3. In the new repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**. Then open the **Actions** tab and re-run the **Deploy Pages** workflow if the first push ran before Pages was turned on.
4. Check that https://r3hab-media.github.io/field-day/, https://r3hab-media.github.io/field-day/privacy.html and https://r3hab-media.github.io/field-day/demo.html all load.

## Character limits used

| Field | Chrome Web Store | Edge Add-ons |
|---|---|---|
| Name | 75 (manifest `name`) | from the manifest, read-only |
| Short description | 132 (manifest `description`, shown as the summary) | from the manifest `description`, read-only |
| Description | 16,000 | 250 minimum, 10,000 maximum |
| Search terms | none | up to 7 terms, 30 characters each, 21 words in total |

`npm run package` refuses to build when the manifest description is over 132 characters or the manifest and `package.json` versions differ.

## 1. Build the upload

```
npm run package
```

This builds `dist/extension/` and zips it as `dist/field-day-1.0.0.zip`. Upload that ZIP to both stores.

To refresh the icons and store images after changing the logo or the panel: `npm run store-assets`. It uses your installed Chrome (set `PW_CHANNEL=msedge` to use Edge instead). It rewrites the PNG icons in `src/extension/icons/` from `logo.svg` and `logo-small.svg`, and the images in `store/` from live captures of the panel on `site/demo.html`.

## 2. Shared text

### Short description (both stores, from the manifest)

```
Fill and submit web forms with realistic test data. Handles multi-step forms and conditional fields, and pauses for CAPTCHAs.
```

### Description (both stores, plain text; neither store renders Markdown)

```
Field Day fills out web forms for you with realistic test data, then submits them, so you can check that a form works without typing the same details over and over.

Open the page with the form, right-click and choose "Field Day: fill a form on this page" (or click the toolbar button). A panel lists every form on the page. Hover to see which one is which, pick one, and click Fill form.

FILLS EVERY KIND OF FIELD
• Believable names, emails, phone numbers, addresses, companies and messages
• Picks a random option in dropdowns, radio buttons and checkboxes, including custom dropdowns
• Dates, numbers, sliders and file uploads (it attaches a small dummy file)
• Always ticks required boxes such as "I agree to the terms"
• Skips hidden "honeypot" fields that websites use to catch bots

HANDLES REAL-WORLD FORMS
• Clicks through multi-step forms ("Next", "Continue") until it reaches the end
• Works on forms embedded from other websites, such as HubSpot and Marketo forms
• Pauses when there's a CAPTCHA so you can solve it, then submits
• Tells you whether the submission went through, and shows any errors the page reported

TESTS EVERY BRANCH
• Search for conditionals: Field Day tries each option to find fields that only appear for certain answers, then plans the fewest runs that cover every branch
• Run several entries in a row, with auto-continue to go straight to the next one
• The panel reopens by itself when a test reloads the page

MAKE IT YOURS
• Set an email pattern, such as qa+{random}@yourdomain.com, so test submissions are easy to find and filter
• Pin values for specific fields, such as company=QA Team
• Fill without submitting when you only want to check the fields

PRIVATE BY DESIGN
No accounts, no analytics, no tracking. Field Day only runs when you open it, the test data is made up on your computer, and it makes no network requests of its own. A form is only sent to the website it belongs to, and only when you choose to submit it.

Please only use Field Day on forms you own or have permission to test. Every submission is real: it may send emails, create records or notify people.

Website and privacy policy: https://r3hab-media.github.io/field-day/
```

## 3. Chrome Web Store

Dashboard: https://chrome.google.com/webstore/devconsole

### Package tab

Upload `dist/field-day-1.0.0.zip`.

### Store listing tab

- **Name and summary:** come from the manifest (section 2).
- **Description:** the description in section 2.
- **Category:** Developer Tools
- **Language:** English

**Images:**

| Field | File |
|---|---|
| Store icon (128×128) | `src/extension/icons/128.png` |
| Screenshots (1280×800) | `store/screenshot-1-pick.png`, `store/screenshot-2-fill.png`, `store/screenshot-3-conditionals.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `store/promo-marquee-1400x560.png` (optional; only used if Google features the extension) |

**Additional fields:**
- Homepage URL: https://r3hab-media.github.io/field-day/
- Support URL: https://github.com/r3hab-media/field-day/issues

### Privacy practices tab

**Single purpose:**

```
Fill in and optionally submit a form on the current web page with generated test data, so the people who build and maintain the form can check that it works.
```

**Permission justifications:**

| Permission | Justification to paste |
|---|---|
| Host permission (`<all_urls>`) | Field Day fills forms on whichever page the user opens it on, so it can't be limited to a list of sites. It also needs access to the frames inside that page, because many forms are embedded from another domain (for example HubSpot, Marketo or Cognito Forms), and activeTab does not grant access to cross-origin frames. Finally, when a multi-run test reloads the page, it reinjects its panel so the test can continue; the activeTab grant does not survive that reload. Nothing runs until the user opens Field Day from the context menu or toolbar button. |
| `activeTab` | Gives access to the tab the user opened Field Day from, through the context menu or toolbar button. |
| `scripting` | Injects the extension's form filler and panel into the page (and its frames) when the user opens Field Day. There are no content scripts that run automatically. |
| `contextMenus` | Adds "Field Day: fill a form on this page" to the right-click menu, the main way to open it. |
| `storage` | Saves the user's settings (email pattern, pinned field values, checkbox options) locally, and keeps a per-tab flag in session storage so the panel reopens after a multi-run test reloads the page. |
| Remote code | Answer **No, I am not using remote code.** All JavaScript ships inside the package. |

**Data usage:** check none of the data-type boxes. Field Day reads the forms on the page only to fill them in, and nothing it reads or generates is sent to the developer or anyone else. (Image Size Checker Pro, which also reads page content only locally, passed review with the same answer.)

Then check all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://r3hab-media.github.io/field-day/privacy.html

### Distribution tab

- Visibility: **Public**
- Regions: all regions
- Pricing: free

## 4. Microsoft Edge Add-ons

Dashboard: https://partner.microsoft.com/dashboard/microsoftedge

**Packages:** upload `dist/field-day-1.0.0.zip`, the same ZIP as Chrome.

**Availability:** Public; all markets.

**Properties:**
- Category: Developer tools
- Website: https://r3hab-media.github.io/field-day/
- Support contact: https://github.com/r3hab-media/field-day/issues
- Mature content: No

**Privacy:** the same single purpose, permission justifications, remote code answer and data usage as the Chrome privacy practices tab (section 3). Privacy policy URL: https://r3hab-media.github.io/field-day/privacy.html

**Store listings (English):**

| Field | What to use |
|---|---|
| Description (250 to 10,000 characters) | The description in section 2 |
| Extension logo (1:1, 300×300 recommended) | `store/logo-300x300.png` |
| Small promotional tile (440×280) | `store/promo-small-440x280.png` |
| Large promotional tile (1400×560) | `store/promo-marquee-1400x560.png` |
| Screenshots (1280×800) | The same three screenshots as Chrome |
| Search terms (up to 7, 30 characters each, 21 words total) | `form testing`, `form filler`, `test data`, `fake data`, `qa testing`, `fill forms`, `web forms` |

**Notes for certification** (on the Submit page):

```
First submission.

No account or sign-in is needed. To test: open https://r3hab-media.github.io/field-day/demo.html (a two-step demo form that sends nothing anywhere). Right-click the page and choose "Field Day: fill a form on this page", or click the toolbar button. A panel opens at the top right listing the form. Untick "Submit after filling" and click "Fill form": every field in both steps is filled with made-up data, and the panel lists what was entered. Tick "Search for conditionals" and click "Fill form" again to see the plan of runs that covers the form's conditional fields.

The extension needs access to all sites because it fills forms on whichever page the user opens it on, including forms embedded in frames from other domains, which activeTab does not reach. Nothing runs until the user opens it. Nothing is sent anywhere by the extension; a form is only submitted to its own website when the user chooses to submit it.
```

## 5. Before you press Submit

- [ ] The `r3hab-media/field-day` repository is public, so the support URL (its Issues page) and the source links work
- [ ] GitHub Pages has deployed from `main`, and https://r3hab-media.github.io/field-day/, `/privacy.html` and `/demo.html` load
- [ ] `npm run package` built `dist/field-day-1.0.0.zip` from committed code
- [ ] Loaded `dist/extension/` unpacked once in Chrome and once in Edge and clicked through on the demo form: right-click menu, toolbar button, fill without submitting, submit, search for conditionals, 2 entries with auto-continue
- [ ] Tried it on a form embedded from another domain (for example a HubSpot form) to check the frame access works
- [ ] Chrome: listing, privacy and distribution tabs filled in; no warnings shown in the dashboard
- [ ] Edge: properties, privacy and store listing filled in; certification notes pasted
- [ ] Expect review to take a few days on Chrome (longer for a first submission that asks for all-sites access) and up to seven business days on Edge

## After it is published

- Add the Chrome and Edge listing links to this file, `README.md` and `site/index.html` (replace the "install it from the source" line).
- For each update: bump `version` in `src/extension/manifest.json` and `package.json` (the stores reject a version they have already seen), run `npm run package`, and upload the new ZIP to both stores. Adding a permission or host permission disables the update for existing users until they accept the new warning, so avoid it where you can.
