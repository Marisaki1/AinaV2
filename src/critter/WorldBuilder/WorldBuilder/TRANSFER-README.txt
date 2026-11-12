WorldBuilder transfer

1. Extract this ZIP to a normal writable folder on the other Windows PC.
2. Install Python 3.12+ and Node.js 22+ if missing (add Python to PATH).
3. Run Setup WorldBuilder.cmd. Internet is needed to install dependencies.
4. Run Restore transferred data.cmd. It verifies the complete backup and
   restores into a NEW data folder; it refuses to overwrite an existing one.
5. Run Open WorldBuilder.cmd. Sign in with your existing local password.

The backup contains all worlds, accounts/password hashes, revisions,
relationships and uploaded images. Keep this package private. Linked external
images retain their URLs; the image host must remain available. Browser-only
preferences and reference-tray pins are not database content.

If data already exists at the destination, do not delete it. Restore into a
different folder using Restore WorldBuilder.cmd and follow its instructions,
or choose an empty installation folder for this transfer.
