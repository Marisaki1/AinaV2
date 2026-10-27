# CritterDB connection through your existing Brave tab

Aina uses the local `extensions/aina-critterdb` extension and the CritterDB tab you select in your normal browser profile. It does not launch a browser, create a profile, open or navigate tabs, request your password, or copy session cookies/tokens. The old isolated-browser launch path is blocked, including requests from cached interfaces.

## Install and launch

1. Run `npm.cmd install` if dependencies are missing, then `npm.cmd start`. For the editor without Discord, use `npm.cmd run critter` instead. Run one mode at a time.
2. Open `http://127.0.0.1:4317` yourself in your existing Brave profile.
3. Once per Brave profile: open `brave://extensions`, enable **Developer mode**, click **Load unpacked**, and select:

   `C:\Users\Marisaki\Desktop\Hobbies\AinaV2\AinaV2\extensions\aina-critterdb`

4. Refresh Aina after installing or reloading the extension. Open CritterDB yourself and sign in in that same Brave profile.
5. In **Library & editor → Open from CritterDB**, click **Connect existing tab**. If several CritterDB tabs are open, choose one from the searchable dropdown and click **Use selected tab**. Wait for **Connected to CritterDB**.

The dialog includes the same setup steps and a **Copy folder path** button. The extension popup lets you change the authorized Aina address if `CRITTER_PORT` is different. Only an exact HTTP origin on `127.0.0.1` is accepted. The default is `http://127.0.0.1:4317`. No browser launch settings in `.env` can enable the old account browser.

## Load a creature or bestiary

Paste a normal CritterDB creature, bestiary, or published bestiary view/edit URL, then click **Load creature or bestiary**. Default HTTPS port `:443` is accepted. Other hosts, insecure URLs, credentials in URLs, nondefault ports, query parameters and invalid IDs are rejected.

The connection uses the selected tab's own Angular Auth and HTTP services, verifies the account, and checks collection ownership. A Discord identity or public URL never grants editing permission. Unauthorized or inaccessible records produce an error without adding a library record.

Whole-bestiary loading retains collection metadata and every creature's original data and ID. Existing loaded collections retain local edits rather than being silently replaced. If a collection overlaps separately loaded creatures, loading is stopped with a clear message so local edits are not duplicated or discarded. Export a backup and remove those local entries using **Clear** before importing the whole collection. Empty bestiaries are supported.

## Edit, review, save, and verify

1. Select the creature in the library and edit its stats, descriptions, actions, traits, reactions, legendary actions, or existing automation.
2. Click **Save to CritterDB** in the creature editor. Its local edits are saved first.
3. In the account dialog, click **Review changes for CritterDB** and inspect the differences.
4. Click **Save to CritterDB**. Aina keeps a recoverable original and candidate, checks current remote data for changes, updates that same creature, reloads it, and verifies persistence before displaying success.

A bestiary's creatures are saved individually. Creature IDs, collection membership, ownership metadata, unknown properties, hidden Avrae blocks, and unedited content are retained. Collection creation, publication, and new account creature creation still take place in CritterDB; creature/bestiary JSON export/import remain available.

Avoid editing the same creature simultaneously in the native CritterDB editor and Aina. The existing tab is left untouched, including any native unsaved form. CritterDB offers no atomic conditional-update contract: Aina reads and compares immediately before its update but cannot eliminate a simultaneous update in that final network interval.

## Reconnect and failed/uncertain saves

Keep the Aina page and selected CritterDB tab open. Neither needs to stay in the foreground. The tab selection is remembered locally and reused when possible; browser restart may require selecting a tab again. The CritterDB session stays in your regular Brave profile.

If authentication expires, sign in on your selected CritterDB tab and click **Check connection**. If the tab was closed, Aina restarted, or the connection was lost, click **Connect existing tab** again. Local edits and recovery drafts are retained. Keep an invalid form open and correct it before closing so a new valid draft can be saved.

If a save fails after it may have reached CritterDB, reconnect and choose **Verify last save** before retrying. That performs a read-only reload and comparison. A conflict preserves local work and does not silently overwrite changed remote data. An expired review must be reviewed again.

Recovery files remain on the Aina host under `data/critter/remote/recovery.json`, `data/critter/remote/backups/`, and normal workspace/creature backups. These contain creature data, not CritterDB authentication. Keep backups of the host's data directory. JSON exports remain usable without the extension/editor.

## Discord and Avrae

`/critter edit url:<creature URL>` supplies the existing local-editor link and remains owner-restricted. URLs in ordinary Discord messages do not authorize edits. The extension only accepts messages from the configured local editor origin, verifies the selected existing tab is on CritterDB, and allows fixed read/probe/checked-update operations. It exposes no arbitrary-code or arbitrary-URL operation.

After a verified save Aina offers `!bestiary update` to copy and send yourself. Aina posting it does not make Avrae execute it. Published collections may need their publication refreshed, and combatants already added to an encounter can retain old data.

## Host location

The extension, existing CritterDB tab, and graphical editor run in the same Brave profile. The local backend remains bound to `127.0.0.1`. If the Discord bot runs remotely, use the local editor with a local integration backend or an authenticated same-port tunnel to the remote loopback backend; configure the extension for the local tunnel's origin. This does not require a browser GUI or a copied CritterDB login on the remote bot host. No public listener or unauthenticated remote access was introduced.

## Verification, 2026-10-24

The user installed the extension in their existing Brave profile and connected successfully. Through that connection:

- Authenticated account probe passed.
- The initial Floor 8 request returned 0 creatures because the old connector added a cache-busting query that CritterDB treated as a creature filter. That result did **not** establish that the collection was empty. Connector **1.0.1** removes that query, and regression tests reproduce the server filtering behavior. Reload the unpacked connector and follow [the updated loading instructions](workshop-calculations.md). A fresh authenticated count has not been tested for this update.
- The previously authorized duplicate **Ancient Silver Dragon2** (`6adae6f675da40a67aedfc97`) was loaded, reviewed, saved with a temporary description comment, reloaded, then reviewed/saved/reloaded again to restore the original.
- Both writes and final restoration were verified. Hidden automation, stats, unknown properties, creature ID and collection membership were preserved. Comparison ignored server version metadata only.
- The main **Ancient Silver Dragon** (`6adb0e8a75da40a67aedfd09`) was not written.
- A missing-creature request returned the distinct `inaccessible`/404 state without importing anything.

These are actual authenticated live results. The test's original snapshot and normal pre-save backups remain under `data/critter/`.

Local Node/VM/HTTP tests separately cover ownership failures, bestiary import, checked updates, schema/identity restrictions, hidden YAML and unknown-field preservation, remote conflicts, expired authentication, recovery after reconnect, stale reply rejection, operation timeouts, cached launch rejection, extension origin restrictions, and the real account-dialog handlers. No browser was launched for these tests. Run `npm.cmd test`. Existing optional `test:critter:*` browser scripts are headless local fixtures, not evidence of a live save.

Implementation references: [Chrome scripting and MAIN-world execution](https://developer.chrome.com/docs/extensions/reference/api/scripting), [Chrome extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [CritterDB creature controller and ownership checks](https://github.com/haswellr/CritterDB/blob/master/server/controllers/creatures.js).
