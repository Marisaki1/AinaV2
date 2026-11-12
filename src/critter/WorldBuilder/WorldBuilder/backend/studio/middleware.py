from django.http import JsonResponse
from django.conf import settings
from urllib.parse import urlparse


class LocalHeaders:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.META.get("REMOTE_ADDR") not in ("127.0.0.1", "::1", None):
            return JsonResponse(
                {"error": "WorldBuilder accepts connections from this computer only."},
                status=403,
            )
        response = self.get_response(request)
        response["X-Content-Type-Options"] = "nosniff"
        response["Referrer-Policy"] = "same-origin"
        response["Cross-Origin-Resource-Policy"] = "same-origin"
        response["X-Frame-Options"] = "DENY"
        response["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
        )
        parent = getattr(settings, "AINA_PARENT", "")
        parsed = urlparse(parent)
        if parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and parsed.port and parsed.path == "":
            response.xframe_options_exempt = True
            if "X-Frame-Options" in response:
                del response["X-Frame-Options"]
            response["Content-Security-Policy"] += "; frame-ancestors " + parent
        else:
            response["Content-Security-Policy"] += "; frame-ancestors 'none'"
        response["Cache-Control"] = (
            "no-store"
            if request.path.startswith(("/api/", "/media/")) or request.path == "/"
            else "no-cache"
        )
        return response
