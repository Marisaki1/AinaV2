"""Run under Aina; terminate if its private stdin pipe closes, including parent crashes."""
import os
import sys
import threading
from launch import main

def watch_parent():
    while os.read(sys.stdin.fileno(), 1):
        pass
    # SQLite transactions are atomic; no orphan background server survives Aina.
    os._exit(0)

threading.Thread(target=watch_parent, daemon=True).start()
main()
