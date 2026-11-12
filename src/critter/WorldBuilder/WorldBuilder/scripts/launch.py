"""Native Windows launcher. No development server, cloud service or Docker required."""

import argparse
import json
import os
from pathlib import Path
import socket
import sys
import threading
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wb.settings")


def main():
    parser = argparse.ArgumentParser(description="Run WorldBuilder on this PC only.")
    parser.add_argument("--port", type=int, default=8777)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port between 1024 and 65535.")
    url = f"http://127.0.0.1:{args.port}/"
    probe = socket.socket()
    try:
        probe.bind(("127.0.0.1", args.port))
    except OSError:
        try:
            with urllib.request.urlopen(url + "api/bootstrap", timeout=3) as response:
                existing = json.load(response)
            if existing.get("app") == "worldbuilder-local":
                from wb import settings as local_settings

                if existing.get("instance") != local_settings.INSTANCE_ID:
                    raise SystemExit(
                        f"Port {args.port} belongs to another WorldBuilder data folder. Use a different --port."
                    )
                print("WorldBuilder is already running: " + url)
                if not args.no_browser:
                    webbrowser.open(url)
                return
        except (OSError, ValueError, urllib.error.URLError):
            pass
        raise SystemExit(
            f"Port {args.port} is in use by another program. Use --port with a different number."
        )
    finally:
        probe.close()
    from wb import settings as bundle_settings
    if not (bundle_settings.BUNDLE_DIR / "index.html").is_file():
        raise SystemExit(
            "The browser app has not been built. Run Setup WorldBuilder.cmd first."
        )
    import django

    django.setup()
    from django.core.management import call_command
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connection)
    pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
    if pending and "studio_world" in connection.introspection.table_names():
        from studio.services import make_backup

        print("Saving a complete backup before updating the database...", flush=True)
        make_backup()
    call_command("migrate", interactive=False, verbosity=0)
    from django.core.wsgi import get_wsgi_application
    from waitress import serve

    print("\nWorldBuilder: " + url)
    from django.conf import settings

    print("Data: " + str(settings.DATA_DIR))
    print(
        "Keep this window open while using WorldBuilder. Press Ctrl+C to stop.\n",
        flush=True,
    )
    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    try:
        serve(
            get_wsgi_application(),
            host="127.0.0.1",
            port=args.port,
            threads=6,
            max_request_body_size=513 * 1024 * 1024,
            clear_untrusted_proxy_headers=True,
        )
    except KeyboardInterrupt:
        print("\nWorldBuilder stopped. Saved data stays on this PC.")


if __name__ == "__main__":
    main()
