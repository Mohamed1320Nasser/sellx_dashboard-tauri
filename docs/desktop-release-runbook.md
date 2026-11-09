# Desktop App — Release & Auto-Update Runbook

How a new version of SellX POS reaches every installed PC without anyone sending an exe.

```
npm run release:version 1.1.0  →  commit  →  git tag -a v1.1.0 -m "notes"  →  git push --follow-tags
        │
        ▼  GitHub Actions (.github/workflows/build.yml)
   build + sign  →  POST /desktop/releases  →  the API stores the bundle under CDN_DIR/app-updates/…
        │
        ▼  every installed app (at launch + every 4 h)
   banner "إصدار جديد من التطبيق متاح" → [تحديث الآن] → download → verify signature → install → restart
```

Pieces:
- App: `src/hooks/useDesktopUpdate.ts`, `src/components/layout/DesktopUpdateBanner.tsx` (shown at the top of every page), Tauri `plugins.updater` in `src-tauri/tauri.conf.json`.
- API (`sellx_backend`): `src/api/desktop/` (router + service), table `DesktopRelease`, migration `prisma/migrations/add_desktop_release.sql`.

---

## 1. One-time setup

### 1.1 Updater signing key (generated 2026-11-10)

| File | What it is | Where it goes |
|---|---|---|
| `~/.tauri/sellx-pos-updater.key` | **private key** | GitHub secret `TAURI_SIGNING_PRIVATE_KEY` |
| `~/.tauri/sellx-pos-updater.key.password` | key password | GitHub secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| `~/.tauri/sellx-pos-updater.key.pub` | public key | already in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |

> ⚠️ **Back up the private key and its password offline** (password manager). Installed apps only
> accept updates signed with this key. **If it is lost, every PC must be reinstalled by hand.**
> Never commit it. (`sellx-pos-local.key` is a different app's key — don't mix them.)

### 1.2 GitHub secrets (`sellx_dashboard-tauri` repo)

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY          < ~/.tauri/sellx-pos-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < ~/.tauri/sellx-pos-updater.key.password
openssl rand -hex 32 > ~/.tauri/sellx-release-token          # once; the same value goes to the API .env
gh secret set DESKTOP_RELEASE_TOKEN               < ~/.tauri/sellx-release-token
```
Every build needs the signing key now (the updater is on); tagged builds also need the token.
CI publishes to `https://api.sellx.monasser.me` unless the repository variable `SELLX_API_URL` says otherwise.

### 1.3 API server (production)

1. Run `prisma/migrations/add_desktop_release.sql` on the database (creates `DesktopRelease`).
2. `.env`:
   ```
   DESKTOP_RELEASE_TOKEN=<contents of ~/.tauri/sellx-release-token>
   CDN_LINK=https://api.sellx.monasser.me
   ```
   No token = publishing is off (CI gets 401). Without `CDN_LINK` the download links use the address the request came to.
3. `CDN_DIR` must be on persistent storage: it holds the bundles (`app-updates/`). It is served by the API itself.
4. Web server / proxy must allow large uploads on `/desktop/releases` and `/desktop/installers` (~100 MB, up to 15 min), or CI gets `413`.
5. Restart the API.

---

## 2. The one-time move to the first auto-updating version (last manual install)

Version 1.0.0 has no updater, and it was installed **per machine** (Program Files). From now on the
app installs **per user**, so updates install silently with no administrator prompt. On each PC, once:

1. **Uninstall** "SellX POS" from Windows Settings → Apps. Data is on the server; nothing is lost.
   Leave "delete the application data" unticked to keep the printer settings.
2. Install from the download link: **https://api.sellx.monasser.me/app-updates/download/SellX-POS-windows-x64-setup.exe**

From then on, every later version arrives through the in-app banner.

---

## 3. Releasing a new version

```bash
npm run release:version 1.1.0          # keeps package.json, tauri.conf.json, Cargo.toml, Cargo.lock in sync
git commit -am "Desktop 1.1.0"
git tag -a v1.1.0 -m "تحسين سرعة شاشة البيع
إصلاح طباعة الإيصال"                    # the tag message is the update notes users see
git push --follow-tags
```

CI then:
1. Fails fast if the tag doesn't match the four version fields, the tag has no message, or a secret is missing.
2. Builds and signs Windows (setup.exe) and macOS (Apple Silicon + Intel).
3. Publishes each update bundle to the API, and replaces the setup.exe behind the download link.
4. Attaches the installers to a GitHub Release.

Installed apps show the banner at next launch, or within 4 hours.

Rules:
- The updater only installs a **higher** version. Every release needs a new number.
- A published version can't be re-published (409). To fix a bad build, release a higher version.
- If one platform failed for a reason outside the code (server, network), use **Re-run failed jobs** on
  the same tag; platforms already published just answer 409.

---

## 4. Withdraw a release or make it mandatory

```bash
TOKEN=$(cat ~/.tauri/sellx-release-token); API=https://api.sellx.monasser.me
curl -s -H "X-Release-Token: $TOKEN" $API/desktop/releases                       # list
curl -s -X PATCH -H "X-Release-Token: $TOKEN" -H 'Content-Type: application/json' \
     -d '{"mandatory":true}' $API/desktop/releases/1.1.0                          # make mandatory
curl -s -X PATCH -H "X-Release-Token: $TOKEN" -H 'Content-Type: application/json' \
     -d '{"active":false}' $API/desktop/releases/1.1.0                            # withdraw
```

| Setting | Effect |
|---|---|
| `active: false` | Withdraws the version on all platforms. Apps that haven't installed it get the previous active version instead; apps that already have it are **not** downgraded. |
| `mandatory: true` | Apps on an older version can't skip it. Found **at launch** → a blocking dialog until the user updates. Found **mid-session** → a banner without "later", so the cashier can finish the sale first. Skipping a mandatory version is impossible: any newer one becomes mandatory too. |

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| CI: `TAURI_SIGNING_PRIVATE_KEY secret is not set` | Section 1.2. |
| CI: `desktop versions disagree with tag` | `npm run release:version <tag version>`, commit, tag again with a new number. |
| CI: `is not an annotated tag` | Tag with `git tag -a vX.Y.Z -m "…"`. |
| CI publish: HTTP 401 | `DESKTOP_RELEASE_TOKEN` differs between GitHub and the API `.env` (or the API was not restarted). |
| CI publish: HTTP 413 | Upload size limit of the web server / proxy (section 1.3, step 4). |
| App never shows the banner | `curl https://api.sellx.monasser.me/desktop/updates/windows/x86_64/1.0.1` → 200 with JSON means an update exists; 204 means no newer **active** release for that platform. Dev builds (`tauri dev`) and the web version never check. |
| Update fails with a signature error | The bundle wasn't signed with the key whose public half is in the installed app. Check the CI secrets hold `sellx-pos-updater.key`. |
| Banner on a PC still on 1.0.0 | It can't: 1.0.0 has no updater. Do section 2 on that PC. |
