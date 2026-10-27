# Aina CritterDB connector

Install this folder in **your existing Brave profile** using `brave://extensions` → Developer mode → Load unpacked. Refresh Aina after installing or reloading the extension.

Open CritterDB and sign in yourself. In Aina's CritterDB account dialog click **Connect existing tab**. If several CritterDB tabs exist, select one. Keep the Aina tab and chosen CritterDB tab open. They may remain in the background.

The connector never opens, closes, activates, or navigates tabs/windows. It uses the selected CritterDB tab's own Angular Auth and `$http` services. Passwords, session tokens and cookies are not read or transferred. Only creature/bestiary data and fixed connection statuses pass to the local editor.

Only the configured local Aina origin can send requests. Its default is `http://127.0.0.1:4317`. If using another port, change the address in this extension's popup and refresh Aina. Allowed operations are account probe, owned creature read, owned collection read, and checked creature-content update. The connector cannot execute arbitrary commands or URLs. There is no externally connectable messaging interface.

For complete save, reconnect and recovery steps see [the project guide](../../docs/critterdb-direct-editing.md).
