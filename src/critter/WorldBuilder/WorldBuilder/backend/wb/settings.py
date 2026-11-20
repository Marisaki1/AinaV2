import os
import hashlib
import json
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
BUNDLE_DIR = Path(os.environ.get("WORLDBUILDER_BUNDLE", BASE_DIR / "dist")).resolve()
DATA_DIR = Path(os.environ.get("WORLDBUILDER_DATA", BASE_DIR / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
keyfile = DATA_DIR / ".secret-key"
if not keyfile.exists():
    try:
        with keyfile.open("x", encoding="utf-8") as stream:
            stream.write(secrets.token_urlsafe(64))
    except FileExistsError:
        pass
SECRET_KEY = keyfile.read_text(encoding="utf-8").strip()
DEBUG = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "studio",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "studio.middleware.LocalHeaders",
]
ROOT_URLCONF = "wb.urls"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "worldbuilder.sqlite3",
        "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"},
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "Asia/Singapore"
SESSION_COOKIE_HTTPONLY = True
# Cookies are scoped to hosts, not ports. Isolate QA/restored installations on the same PC.
INSTANCE_ID = hashlib.sha256(str(DATA_DIR).casefold().encode("utf-8")).hexdigest()[:12]
SESSION_COOKIE_NAME = "worldbuilder_session_" + INSTANCE_ID
CSRF_COOKIE_NAME = "worldbuilder_csrf_" + INSTANCE_ID
SESSION_COOKIE_SAMESITE = "Strict"
CSRF_COOKIE_SAMESITE = "Strict"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_SAVE_EVERY_REQUEST = False
DATA_UPLOAD_MAX_MEMORY_SIZE = 32 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
X_FRAME_OPTIONS = "DENY"
MEDIA_ROOT = DATA_DIR / "media"
MEDIA_ROOT.mkdir(exist_ok=True)
CSRF_FAILURE_VIEW = "studio.views.csrf_failure"
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        }
    },
}

# Only Aina's configured local origin may embed the managed application.
AINA_PARENT = os.environ.get("AINA_WORLDBUILDER_PARENT", "")
AINA_ARTWORK_DIRECTORIES = json.loads(os.environ.get("AINA_ARTWORK_DIRECTORIES", "{}"))
