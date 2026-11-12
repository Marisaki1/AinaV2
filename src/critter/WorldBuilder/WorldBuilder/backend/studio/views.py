import copy
import csv
import functools
import io
import json
import re
import uuid
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, OperationalError, transaction
from django.http import JsonResponse, HttpResponse, FileResponse, Http404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import World, Resource, Asset, Activity
from .catalog import templates
from .documents import reference_ids, plain_text
from .services import (
    Conflict,
    Limit,
    check_json,
    owned_world,
    owned_resource,
    short,
    strings,
    snapshot,
    serialize,
    save_resource,
    index_resource,
    search_resources,
    store_asset,
    asset_json,
    make_backup,
    world_archive,
    checked_archive,
    import_world_archive,
)
from .tools import dice_roll, weighted, date_info, integer
from .importing import scan, import_selected, ALLOWED_FOLDERS
from .organization import collection_contents, organize
from .history import history_view, create_history_event


def csrf_failure(request, reason=""):
    return JsonResponse(
        {"error": "Your session needs a refresh. Reload the page and try again."},
        status=403,
    )


def payload(request):
    try:
        value = json.loads(
            request.body or "{}",
            parse_constant=lambda _: (_ for _ in ()).throw(
                ValueError("Non-finite number")
            ),
        )
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object.")
        check_json(value, 4000000)
        return value
    except (json.JSONDecodeError, UnicodeError, RecursionError) as error:
        raise ValueError("The request is not valid JSON.") from error


def endpoint(methods, public=False):
    def decorate(function):
        @functools.wraps(function)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                response = JsonResponse(
                    {"error": "This action does not support that request method."},
                    status=405,
                )
                response["Allow"] = ", ".join(methods)
                return response
            if not public and not request.user.is_authenticated:
                return JsonResponse(
                    {"error": "Sign in to your local workspace."}, status=401
                )
            try:
                return function(request, *args, **kwargs)
            except Http404:
                return JsonResponse(
                    {"error": "That item is not available."}, status=404
                )
            except Conflict as error:
                return JsonResponse(
                    {"error": str(error), "code": "revision_conflict"}, status=409
                )
            except Limit as error:
                return JsonResponse({"error": str(error)}, status=413)
            except (
                ValueError,
                ValidationError,
                TypeError,
                KeyError,
                OverflowError,
            ) as error:
                return JsonResponse(
                    {
                        "error": str(error)
                        if isinstance(error, ValueError)
                        else "Some of the supplied fields are invalid. Please check the values."
                    },
                    status=400,
                )
            except OperationalError as error:
                if "locked" not in str(error).lower():
                    raise
                return JsonResponse(
                    {
                        "error": "WorldBuilder is finishing another save. Your changes were not applied. Try again shortly.",
                        "code": "write_busy",
                    },
                    status=503,
                )
            except IntegrityError:
                return JsonResponse(
                    {
                        "error": "That entry or connection already exists. Refresh and try again."
                    },
                    status=409,
                )

        return wrapped

    return decorate


def world_json(world):
    return {
        "id": str(world.id),
        "name": world.name,
        "tagline": world.tagline,
        "description": world.description,
        "data": world.data,
        "created_at": world.created_at.isoformat(),
        "updated_at": world.updated_at.isoformat(),
    }


@endpoint(["GET"])
def world_history(request, world_id):
    world = owned_world(request.user, world_id)
    return JsonResponse(
        history_view(
            world,
            request.GET.get("calendar", "none"),
            request.GET.get("timeline"),
            request.GET.get("audience") == "reader",
            request.GET.get("q", "")[:200],
            request.GET.get("from_year"),
            request.GET.get("to_year"),
        )
    )


@endpoint(["POST"])
def history_event(request, world_id):
    world = owned_world(request.user, world_id)
    return JsonResponse(create_history_event(world, payload(request)), status=201)


@ensure_csrf_cookie
@endpoint(["GET"], True)
def bootstrap(request):
    base = {
        "app": "worldbuilder-local",
        "version": "0.23.0",
        "aina_parent": getattr(settings,"AINA_PARENT", ""),
        "instance": settings.INSTANCE_ID,
        "csrf_cookie": settings.CSRF_COOKIE_NAME,
        "configured": User.objects.exists(),
        "authenticated": request.user.is_authenticated,
        "templates": templates(),
        "import_folders": sorted(ALLOWED_FOLDERS),
    }
    base["test_workspace"] = (
        settings.BASE_DIR / ".preview"
    ) in settings.DATA_DIR.parents
    if request.user.is_authenticated:
        base.update(
            user={
                "name": request.user.first_name or request.user.username,
                "username": request.user.username,
                "installation_owner": request.user.username == "owner" or request.user.is_staff,
            },
            worlds=[world_json(w) for w in World.objects.filter(owner=request.user)],
        )
    return JsonResponse(base)


@endpoint(["POST"], True)
def setup(request):
    value = payload(request)
    if User.objects.exists():
        raise Conflict("This workspace is already set up. Sign in instead.")
    username = str(value.get("username", "owner")).strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,79}", username):
        raise ValueError("Use 3-80 letters, numbers, dots, underscores or hyphens for your username.")
    name = short(value.get("name", "Worldbuilder"), "Name", 80, False)
    password = short(value.get("password", ""), "Password", 256, False)
    if len(password) < 8:
        raise ValueError("Use at least eight characters for your local password.")
    world_name = short(value.get("world_name", "My first world"), "Name", 120, False)
    with transaction.atomic():
        if User.objects.exists():
            raise Conflict("The workspace was set up in another tab.")
        user = User.objects.create_user(
            username=username, password=password, first_name=name, is_staff=True
        )
        world = World.objects.create(
            owner=user, name=world_name, tagline="A world of your own making."
        )
    login(request, user)
    return JsonResponse({"world": world_json(world)}, status=201)


@endpoint(["POST"], True)
def signin(request):
    value = payload(request)
    username = str(value.get("username", "owner")).strip().lower()
    user = authenticate(request, username=username, password=value.get("password", ""))
    if not user and username and not User.objects.filter(username__iexact=username).exists():
        aliases = list(User.objects.filter(first_name__iexact=username, is_active=True)[:2])
        if len(aliases) == 1:
            user = authenticate(request, username=aliases[0].username, password=value.get("password", ""))
    if not user:
        return JsonResponse(
            {"error": "The username or password is incorrect."}, status=401
        )
    login(request, user)
    return JsonResponse({"ok": True})


@endpoint(["POST"], True)
def register(request):
    value = payload(request)
    username = str(value.get("username", "")).strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,79}", username):
        raise ValueError("Use 3-80 letters, numbers, dots, underscores or hyphens for your username.")
    if username == "owner":
        raise ValueError("The owner username is reserved. Choose another username, or log in as owner.")
    name = short(value.get("name", username), "Name", 80, False)
    password = short(value.get("password", ""), "Password", 256, False)
    if len(password) < 8:
        raise ValueError("Use at least eight characters for your local password.")
    world_name = short(value.get("world_name", "My first world"), "World name", 120, False)
    with transaction.atomic():
        if User.objects.filter(username__iexact=username).exists():
            raise Conflict("That username is already in use.")
        user = User.objects.create_user(username=username, password=password, first_name=name)
        world = World.objects.create(owner=user, name=world_name)
    login(request, user)
    return JsonResponse({"world": world_json(world)}, status=201)


@endpoint(["POST"])
def signout(request):
    logout(request)
    return JsonResponse({"ok": True})


@endpoint(["GET", "POST"])
def worlds(request):
    if request.method == "GET":
        return JsonResponse(
            {
                "worlds": [
                    world_json(w) for w in World.objects.filter(owner=request.user)
                ]
            }
        )
    value = payload(request)
    world = World.objects.create(
        owner=request.user,
        name=short(value.get("name", ""), "Name", 120, False),
        tagline=short(value.get("tagline", ""), "Tagline", 240),
    )
    return JsonResponse(world_json(world), status=201)


@endpoint(["GET", "PATCH"])
def world_detail(request, world_id):
    world = owned_world(request.user, world_id)
    if request.method == "PATCH":
        value = payload(request)
        for key, limit in [("name", 120), ("tagline", 240), ("description", 100000)]:
            if key in value:
                setattr(
                    world,
                    key,
                    short(
                        value[key],
                        "Name" if key == "name" else key,
                        limit,
                        key != "name",
                    ),
                )
        if "data" in value:
            if not isinstance(value["data"], dict):
                raise ValueError("World settings must be an object.")
            check_json(value["data"])
            world.data = value["data"]
        world.save()
    counts = {}
    for kind in world.resources.filter(deleted_at=None).values_list("kind", flat=True):
        counts[kind] = counts.get(kind, 0) + 1
    activities = [
        {
            "id": a.id,
            "kind": a.kind,
            "title": a.title,
            "data": a.data,
            "created_at": a.created_at.isoformat(),
        }
        for a in world.activities.all()[:30]
    ]
    return JsonResponse(
        {
            **world_json(world),
            "counts": counts,
            "activities": activities,
            "asset_count": world.assets.count(),
        }
    )


@endpoint(["GET", "POST"])
def resources(request, world_id):
    world = owned_world(request.user, world_id)
    if request.method == "POST":
        return JsonResponse(
            serialize(save_resource(world, payload(request))), status=201
        )
    values = search_resources(
        world,
        request.GET.get("q", ""),
        request.GET.get("audience") == "reader",
        request.GET.get("trash") == "1",
    )
    if request.GET.get("kind"):
        values = [v for v in values if v["kind"] == request.GET["kind"]]
    return JsonResponse({"resources": values})


@endpoint(["GET", "PATCH", "DELETE"])
def resource_detail(request, resource_id):
    resource = owned_resource(request.user, resource_id)
    if request.method == "GET":
        result = serialize(resource, reader=request.GET.get("audience") == "reader")
        if result is None:
            raise Http404()
        if request.GET.get("audience") != "reader":
            result["backlinks"] = [
                {"id": str(r.id), "title": r.title, "kind": r.kind}
                for r in Resource.objects.filter(world=resource.world, deleted_at=None)
                if str(resource.id) in reference_ids(r.document)
            ]
        return JsonResponse(result)
    value = payload(request)
    if request.method == "DELETE":
        if value.get("expected_revision") != resource.revision:
            raise Conflict("This entry changed. Refresh before moving it to trash.")
        changed = Resource.objects.filter(
            id=resource.id, revision=resource.revision
        ).update(
            deleted_at=timezone.now(),
            revision=resource.revision + 1,
            updated_at=timezone.now(),
        )
        if not changed:
            raise Conflict("Another tab saved first.")
        resource.refresh_from_db()
        index_resource(resource)
        return JsonResponse({"ok": True})
    if resource.deleted_at:
        raise ValueError("Restore this entry from trash before editing it.")
    return JsonResponse(serialize(save_resource(resource.world, value, resource)))


@endpoint(["GET"])
def historical_map(request, resource_id):
    from .cartography import map_state

    resource = owned_resource(request.user, resource_id)
    event = owned_resource(request.user, request.GET.get("event"))
    return JsonResponse(
        map_state(
            resource,
            event,
            request.GET.get("audience") == "reader",
            request.GET.get("occurrence"),
            request.GET.get("special_day_id"),
        )
    )


@endpoint(["GET"])
def resource_occurrences(request, resource_id):
    from .recurrence import compact

    resource = owned_resource(request.user, resource_id)
    reader = request.GET.get("audience") == "reader"
    value = serialize(resource, False, reader)
    if (
        value is None
        or resource.deleted_at
        or resource.kind not in ("event", "calendar")
    ):
        raise Http404()
    calendar = (
        str(resource.id)
        if resource.kind == "calendar"
        else value["data"].get("calendar_id")
        or ("unavailable" if value["data"].get("calendar_unavailable") else "none")
    )
    if (
        resource.kind == "event"
        and calendar not in ("none", "unavailable")
        and not Resource.objects.filter(
            id=calendar, world=resource.world, kind="calendar", deleted_at=None
        ).exists()
    ):
        calendar = "unavailable"
    view = history_view(
        resource.world,
        calendar,
        reader=reader,
        from_year=request.GET.get("from_year"),
        to_year=request.GET.get("to_year"),
        event_id=resource.id if resource.kind == "event" else None,
    )
    view["events"] = [compact(e) for e in view["events"]]
    warned = {w["id"] for w in view["recurrence_warnings"]}
    for event in view["events"]:
        if event.get("date_warning") and event["id"] not in warned:
            view["recurrence_warnings"].append(
                {"id": event["id"], "message": event["date_warning"]}
            )
            warned.add(event["id"])
    for event in view["events"]:
        event["data"] = {
            k: v
            for k, v in event["data"].items()
            if k
            in (
                "year",
                "month",
                "day",
                "special_day_id",
                "end_special_day_id",
                "end_year",
                "end_month",
                "end_day",
            )
        }
    return JsonResponse(
        {
            k: view[k]
            for k in (
                "events",
                "occurrence_window",
                "occurrences_truncated",
                "recurrence_warnings",
            )
        }
    )


@endpoint(["GET"])
def revisions(request, resource_id):
    resource = owned_resource(request.user, resource_id)
    return JsonResponse(
        {
            "revisions": [
                {
                    "number": r.number,
                    "title": r.snapshot["title"],
                    "created_at": r.created_at.isoformat(),
                    "word_count": len(
                        plain_text(r.snapshot.get("document", {})).split()
                    ),
                }
                for r in resource.revisions.all()[:100]
            ]
        }
    )


@endpoint(["GET"])
def revision_detail(request, resource_id, number):
    resource = owned_resource(request.user, resource_id)
    revision = resource.revisions.filter(number=number).first()
    if revision is None:
        raise Http404()
    return JsonResponse({
        "number": revision.number,
        "created_at": revision.created_at.isoformat(),
        "snapshot": revision.snapshot,
        "text": plain_text(revision.snapshot.get("document", {})),
        "current_text": plain_text(resource.document),
        "changed_fields": [key for key, value in snapshot(resource).items()
                           if revision.snapshot.get(key) != value],
    })


@endpoint(["POST"])
def restore_revision(request, resource_id):
    resource = owned_resource(request.user, resource_id)
    value = payload(request)
    if value.get("expected_revision") != resource.revision:
        raise Conflict("This entry changed. Refresh before restoring.")
    number = value.get("number")
    if number:
        revision = resource.revisions.filter(number=number).first()
        if not revision:
            raise ValueError("That revision is not available.")
        restored = {**revision.snapshot, "expected_revision": resource.revision}
    else:
        restored = {**snapshot(resource), "expected_revision": resource.revision}
    if (
        restored.get("parent")
        and not Resource.objects.filter(id=restored["parent"], deleted_at=None).exists()
    ):
        restored["parent"] = None
    return JsonResponse(
        serialize(save_resource(resource.world, restored, resource, restore=True))
    )


@endpoint(["POST"])
def publish(request, resource_id):
    resource = owned_resource(request.user, resource_id)
    value = payload(request)
    if resource.deleted_at:
        raise ValueError("Restore this entry before publishing.")
    if value.get("expected_revision") != resource.revision:
        raise Conflict("The entry changed. Save or reload before publishing.")
    if resource.template.startswith("custom:"):
        template = owned_resource(request.user, resource.template.split(":", 1)[1])
        if template.world_id != resource.world_id or template.kind != "template":
            raise ValueError("Choose a template from this world.")
        for field in template.data.get("fields", []):
            value = resource.data.get("fields", {}).get(field["name"])
            if field.get("required") and (value is None or value == ""):
                raise ValueError("Complete the required field: " + field["name"])
    published = {**snapshot(resource), "_revision": resource.revision}
    changed = Resource.objects.filter(
        id=resource.id, revision=resource.revision
    ).update(published=published, updated_at=timezone.now())
    if not changed:
        raise Conflict("Another tab saved first.")
    resource.refresh_from_db()
    return JsonResponse(serialize(resource))


@endpoint(["POST"])
def reorder(request, world_id):
    world = owned_world(request.user, world_id)
    value = payload(request)
    rows = value.get("entries")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 500:
        raise ValueError("Choose up to 500 entries to reorder.")
    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Choose each entry once.")
    with transaction.atomic():
        for row in rows:
            resource = owned_resource(request.user, row["id"])
            if resource.world_id != world.id or resource.deleted_at:
                raise ValueError("Choose active entries from this world.")
            save_resource(
                world,
                {"position": row["position"], "expected_revision": row["revision"]},
                resource,
            )
    return JsonResponse({"ok": True})


@endpoint(["GET", "POST", "DELETE"])
def connections(request, world_id):
    world = owned_world(request.user, world_id)
    from .graphs import visible_connections, create_connection

    if (
        request.method == "GET"
        and request.GET.get("trash") == "1"
        and request.GET.get("audience") != "reader"
    ):
        from .services import connection_json

        return JsonResponse(
            {
                "connections": [
                    connection_json(edge)
                    for edge in world.connections.filter(
                        deleted_at__isnull=False
                    ).order_by("-updated_at")
                ]
            }
        )
    if request.method == "GET":
        return JsonResponse(
            {
                "connections": visible_connections(
                    world, request.GET.get("audience") == "reader"
                )
            }
        )
    value = payload(request)
    if request.method == "DELETE":
        from .connection_history import save

        return JsonResponse(
            save(
                world,
                {"expected_revision": value.get("expected_revision")},
                value.get("id"),
                action="deleted",
            )
        )
    return JsonResponse(create_connection(world, value), status=201)


@endpoint(["GET", "PATCH", "DELETE"])
def connection_detail(request, connection_id):
    from .connection_history import owned, save
    from .services import connection_json

    edge = owned(request.user, connection_id)
    if request.method == "GET":
        if request.GET.get("audience") == "reader":
            from .graphs import visible_connections

            value = next(
                (
                    row
                    for row in visible_connections(edge.world, True)
                    if row["id"] == str(edge.id)
                ),
                None,
            )
            if value is None:
                raise Http404()
            return JsonResponse(value)
        return JsonResponse(connection_json(edge))
    return JsonResponse(
        save(
            edge.world,
            payload(request),
            edge.id,
            action="deleted" if request.method == "DELETE" else "updated",
        )
    )


@endpoint(["GET"])
def connection_revisions(request, connection_id):
    if request.GET.get("audience") == "reader":
        raise Http404()
    from .connection_history import owned, revisions

    edge = owned(request.user, connection_id)
    return JsonResponse(
        {
            "connection": str(edge.id),
            "revision": edge.revision,
            "revisions": revisions(edge),
        }
    )


@endpoint(["POST"])
def connection_restore(request, connection_id):
    from .connection_history import owned, save

    edge = owned(request.user, connection_id)
    value = payload(request)
    return JsonResponse(
        save(
            edge.world,
            {"expected_revision": value.get("expected_revision")},
            edge.id,
            action="restored",
            number=value.get("number"),
        )
    )


@endpoint(["GET"])
def family_graph(request, world_id):
    from .graphs import family_view

    world = owned_world(request.user, world_id)
    try:
        depth = int(request.GET.get("depth", "6"))
    except ValueError:
        raise ValueError("Choose a whole-number family depth.")
    return JsonResponse(
        family_view(
            world,
            request.GET.get("root", ""),
            request.GET.get("partner", ""),
            request.GET.get("direction", "family"),
            depth,
            request.GET.get("adoptive") == "1",
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def hierarchy_graph(request, resource_id):
    from .graphs import hierarchy_view

    return JsonResponse(
        hierarchy_view(
            owned_resource(request.user, resource_id),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def saved_graph(request, resource_id):
    from .relationship_views import relationship_view

    return JsonResponse(
        relationship_view(
            owned_resource(request.user, resource_id),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def campaign_map_guide(request, resource_id):
    from .map_guide import map_guide

    return JsonResponse(
        map_guide(
            owned_resource(request.user, resource_id),
            request.GET.get("campaign", ""),
            request.GET.get("marker", ""),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def session_desk(request, resource_id):
    from .session_guide import session_guide

    return JsonResponse(
        session_guide(
            owned_resource(request.user, resource_id),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET", "POST"])
def campaign_continuity(request, resource_id):
    from .continuity import act, projection

    if request.GET.get("audience") == "reader":
        raise Http404()
    campaign = owned_resource(request.user, resource_id)
    return JsonResponse(act(campaign, payload(request)) if request.method == "POST" else projection(campaign, request.GET.get("session", "")))


@endpoint(["GET"])
def campaign_lifecycle(request, resource_id):
    from .planning import lifecycle

    if request.GET.get("audience") == "reader":
        raise Http404()
    return JsonResponse(
        lifecycle(
            owned_resource(request.user, resource_id),
            *(
                request.GET.get(key, "")
                for key in ("session", "q", "person", "place", "thread")
            ),
        )
    )


@endpoint(["GET", "POST"])
def notebook_desk(request, world_id):
    from .notebooks import act, desk

    if request.GET.get("audience") == "reader":
        raise Http404()
    world = owned_world(request.user, world_id)
    return JsonResponse(act(world, payload(request)) if request.method == "POST" else desk(world, request.GET))


@endpoint(["GET"])
def notebook_audit(request, world_id):
    from .notebooks import audit

    if request.GET.get("audience") == "reader":
        raise Http404()
    return JsonResponse(audit(owned_world(request.user, world_id)))


@endpoint(["GET"])
def notebook_export(request, resource_id):
    from .notebooks import export_book

    result = export_book(owned_resource(request.user, resource_id), request.GET.get("section", ""), request.GET.get("audience") == "owner")
    response = HttpResponse(result, content_type="text/html; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="notebook.html"'
    return response


@endpoint(["POST"])
def session_recap_draft(request, resource_id):
    from .planning import recap_draft

    return JsonResponse(
        recap_draft(
            owned_resource(request.user, resource_id), payload(request).get("ids", [])
        )
    )


@endpoint(["POST"])
def session_handoff(request, resource_id):
    from .planning import handoff

    return JsonResponse(
        handoff(owned_resource(request.user, resource_id), payload(request))
    )


@endpoint(["POST"])
def followup_convert(request, resource_id):
    from .planning import followup_task

    return JsonResponse(
        followup_task(owned_resource(request.user, resource_id), payload(request))
    )


@endpoint(["GET"])
def campaign_handout(request, resource_id):
    from .planning import handout_preview

    result = handout_preview(
        owned_resource(request.user, resource_id),
        request.GET.get("audience") == "reader",
        request.GET.get("export") == "html",
    )
    if isinstance(result, str):
        response = HttpResponse(result, content_type="text/html; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="campaign-handout.html"'
        return response
    return JsonResponse(result)


@endpoint(["GET"])
def campaign_desk(request, resource_id):
    from .workbench import campaign_workbench

    if request.GET.get("audience") == "reader":
        raise Http404()
    return JsonResponse(
        campaign_workbench(owned_resource(request.user, resource_id), request.GET)
    )


@endpoint(["GET"])
def campaign_thread(request, resource_id):
    from .workbench import thread_guide

    return JsonResponse(
        thread_guide(
            owned_resource(request.user, resource_id),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def location_desk(request, resource_id):
    from .dossiers import location_guide

    return JsonResponse(
        location_guide(
            owned_resource(request.user, resource_id),
            request.GET.get("campaign", ""),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def character_guide(request, resource_id):
    from .dossiers import character_dossier

    return JsonResponse(
        character_dossier(
            owned_resource(request.user, resource_id),
            request.GET.get("campaign", ""),
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["GET"])
def graph_export(request, resource_id):
    from .relationship_views import relationship_view
    from .graph_exports import export_graph
    from django.utils.http import content_disposition_header
    from django.utils.text import slugify

    reader = request.GET.get("audience") == "reader"
    graph = relationship_view(owned_resource(request.user, resource_id), reader)
    if len(graph["nodes"]) > 5000:
        raise Limit("Filter this graph to at most 5,000 entries before exporting.")
    format_name = request.GET.get("format", "svg")
    contents, content_type = export_graph(graph, format_name, reader)
    response = HttpResponse(contents, content_type=content_type)
    name = (slugify(graph["view"]["title"])[:80] or "graph") + "." + format_name
    response["Content-Disposition"] = content_disposition_header(True, name)
    response["Cache-Control"] = "no-store"
    return response


@endpoint(["GET", "POST"])
def assets(request, world_id):
    world = owned_world(request.user, world_id)
    if request.method == "GET":
        return JsonResponse(
            {"assets": [asset_json(a) for a in world.assets.order_by("-created_at")]}
        )
    upload = request.FILES.get("file")
    if not upload:
        raise ValueError("Choose an image to upload.")
    try:
        tags = json.loads(request.POST.get("tags", "[]"))
    except json.JSONDecodeError as error:
        raise ValueError("Media tags must be a list.") from error
    asset = store_asset(world, upload, request.POST.get("credit", ""), tags)
    return JsonResponse(asset_json(asset), status=201)


@endpoint(["GET", "PATCH"])
def asset_detail(request, asset_id):
    try:
        asset = Asset.objects.get(id=asset_id, world__owner=request.user)
    except Asset.DoesNotExist:
        raise Http404()
    if request.method == "PATCH":
        value = payload(request)
        if set(value) - {"name", "credit", "tags", "expected_revision"}:
            raise ValueError("Unsupported media field.")
        revision = value.get("expected_revision")
        if (
            isinstance(revision, bool)
            or not isinstance(revision, int)
            or revision != asset.revision
        ):
            raise Conflict(
                "This image's details changed. Reopen the image before saving."
            )
        fields = {}
        if "name" in value:
            name = short(value["name"], "Name", 200, False)
            if re.search(r"[\\/:\x00-\x1f]", name):
                raise ValueError(
                    "Use an image name without path separators or control characters."
                )
            fields["filename"] = name
        if "credit" in value:
            fields["credit"] = short(value["credit"], "Credit", 300)
        if "tags" in value:
            fields["tags"] = strings(value["tags"], "Media tags")
        with transaction.atomic():
            changed = Asset.objects.filter(id=asset.id, revision=revision).update(
                **fields, revision=revision + 1
            )
            if not changed:
                raise Conflict(
                    "Another tab changed this image first. Reopen it before saving."
                )
            asset.refresh_from_db()
            Activity.objects.create(
                world=asset.world,
                kind="media_updated",
                title=asset.filename,
                data={"asset_id": str(asset.id)},
            )
    return JsonResponse(asset_json(asset))


@endpoint(["GET"])
def collection_detail(request, world_id, collection_id):
    world = owned_world(request.user, world_id)
    return JsonResponse(
        collection_contents(
            world,
            collection_id,
            request.GET.get("recursive") == "1",
            request.GET.get("audience") == "reader",
        )
    )


@endpoint(["POST"])
def organize_entries(request, world_id):
    world = owned_world(request.user, world_id)
    return JsonResponse(organize(world, payload(request).get("entries")))


@endpoint(["GET"])
def media(request, asset_id):
    try:
        asset = Asset.objects.get(id=asset_id, world__owner=request.user)
    except Asset.DoesNotExist:
        raise Http404()
    path = settings.MEDIA_ROOT / asset.storage_name
    if not path.is_file():
        raise Http404()
    return FileResponse(path.open("rb"), content_type=asset.mime)


@endpoint(["GET"])
def export_world(request, world_id):
    world = owned_world(request.user, world_id)
    data = world_archive(world)
    response = HttpResponse(data, content_type="application/zip")
    response["Content-Disposition"] = 'attachment; filename="worldbuilder-world.zip"'
    return response


@endpoint(["POST"])
def import_archive(request):
    file = request.FILES.get("file")
    if not file:
        raise ValueError("Choose an exported WorldBuilder world archive.")
    contents = file.read(512 * 1024 * 1024 + 1)
    world = import_world_archive(request.user, contents)
    return JsonResponse(world_json(world), status=201)


@endpoint(["POST"])
def import_scan(request):
    return JsonResponse(scan(payload(request).get("folders", [])))


@endpoint(["POST"])
def import_files(request, world_id):
    return JsonResponse(
        import_selected(
            owned_world(request.user, world_id), payload(request).get("files", [])
        )
    )


@endpoint(["GET", "POST"])
def backups(request):
    if request.user.username != "owner" and not request.user.is_staff:
        return JsonResponse({"error": "Only the installation owner can access complete backups. Export your own world instead."}, status=403)
    if request.method == "POST":
        return JsonResponse(make_backup(), status=201)
    folder = settings.DATA_DIR / "backups"
    return JsonResponse(
        {
            "backups": [
                {
                    "name": p.name,
                    "size": p.stat().st_size,
                    "created_at": timezone.datetime.fromtimestamp(
                        p.stat().st_mtime, tz=timezone.get_current_timezone()
                    ).isoformat(),
                }
                for p in sorted(folder.glob("*.wbbackup.zip"), reverse=True)
            ]
            if folder.exists()
            else []
        }
    )


def backup_path(filename):
    if not re.fullmatch(r"[0-9_-]+[a-f0-9]{6}\.wbbackup\.zip", filename):
        raise Http404()
    path = settings.DATA_DIR / "backups" / filename
    if not path.is_file():
        raise Http404()
    return path


@endpoint(["GET"])
def backup_download(request, filename):
    if request.user.username != "owner" and not request.user.is_staff:
        return JsonResponse({"error": "Only the installation owner can access complete backups. Export your own world instead."}, status=403)
    return FileResponse(
        backup_path(filename).open("rb"),
        as_attachment=True,
        filename=filename,
        content_type="application/zip",
    )


@endpoint(["POST"])
def backup_verify(request, filename):
    if request.user.username != "owner" and not request.user.is_staff:
        return JsonResponse({"error": "Only the installation owner can access complete backups. Export your own world instead."}, status=403)
    archive, manifest = checked_archive(
        backup_path(filename).read_bytes(), "worldbuilder-backup-v1"
    )
    return JsonResponse(
        {
            "ok": True,
            "files": len(manifest["files"]),
            "created_at": manifest["created_at"],
        }
    )


@endpoint(["POST"])
def dice(request):
    value = payload(request)
    world = owned_world(request.user, value.get("world_id"))
    result = dice_roll(value.get("formula", ""))
    Activity.objects.create(
        world=world,
        kind="roll",
        title=result["formula"] + " → " + str(result["total"]),
        data=result,
    )
    return JsonResponse(result)


@endpoint(["POST"])
def roll_table(request, resource_id):
    resource = owned_resource(request.user, resource_id)
    if resource.kind not in ("table", "generator"):
        raise ValueError("Choose a table or generator.")
    result = copy.deepcopy(weighted(resource.data.get("rows", [])))
    result["rolled"] = {
        col["id"]: dice_roll(result.get("cells", {}).get(col["id"], ""))
        for col in resource.data.get("columns", [])
        if col.get("type") == "dice" and result.get("cells", {}).get(col["id"])
    }
    Activity.objects.create(
        world=resource.world,
        kind="generated",
        title=resource.title,
        data={"resource_id": str(resource.id), "result": result},
    )
    return JsonResponse({"result": result})


@endpoint(["POST"])
def csv_preview(request):
    text = short(payload(request).get("text", ""), "CSV", 2000000, False)
    try:
        rows = list(csv.reader(io.StringIO(text)))
        if not rows or not 1 <= len(rows[0]) <= 40 or len(rows) > 5001:
            raise ValueError("Use a header and up to 5,000 rows / 40 columns.")
        columns = [
            {"id": str(uuid.uuid4()), "label": name[:100] or "Column", "type": "text"}
            for name in rows[0]
        ]
        for number, row in enumerate(rows[1:], 2):
            if len(row) != len(columns):
                raise ValueError(
                    f"CSV row {number} has {len(row)} columns; expected {len(columns)}."
                )
        data = [
            {
                "id": str(uuid.uuid4()),
                "weight": 1,
                "cells": {col["id"]: row[i] for i, col in enumerate(columns)},
            }
            for row in rows[1:]
        ]
        return JsonResponse({"columns": columns, "rows": data})
    except csv.Error as error:
        raise ValueError("This CSV could not be read: " + str(error)) from error


@endpoint(["POST"])
def calendar_preview(request):
    from .calendar_engine import MAX_DAY, date_from_ordinal, month_preview

    value = payload(request)
    calendar = value.get("calendar", {})
    result = (
        date_from_ordinal(calendar, value["ordinal"])
        if "ordinal" in value
        else date_info(
            calendar,
            integer(value.get("year", 1), "Year"),
            integer(value.get("month", 1), "Month", 1, 60),
            integer(value.get("day", 1), "Day", 1, MAX_DAY),
            value.get("special_day_id"),
        )
    )
    if value.get("include_month"):
        result["days"] = month_preview(
            calendar, result["year"], result["month"], result.get("special_day_id")
        )["days"]
    return JsonResponse(result)


@endpoint(["GET"])
def calendar_export(request, resource_id):
    from .calendar_engine import definition
    from django.utils.http import content_disposition_header
    from django.utils.text import slugify

    resource = owned_resource(request.user, resource_id)
    if resource.kind != "calendar" or resource.deleted_at:
        raise Http404()
    value = serialize(resource, reader=request.GET.get("audience") == "reader")
    if value is None:
        raise Http404()
    response = JsonResponse(
        {
            "format": "worldbuilder-calendar-v1",
            "name": value["title"],
            "calendar": definition(value["data"]),
        },
        json_dumps_params={"ensure_ascii": False},
    )
    response["Content-Disposition"] = content_disposition_header(
        True, (slugify(value["title"])[:80] or "calendar") + ".json"
    )
    response["Cache-Control"] = "no-store"
    return response


@endpoint(["POST"])
def calendar_import(request, world_id):
    from .calendar_engine import definition

    world = owned_world(request.user, world_id)
    value = payload(request).get("definition")
    if (
        not isinstance(value, dict)
        or set(value) != {"format", "name", "calendar"}
        or value.get("format") != "worldbuilder-calendar-v1"
    ):
        raise ValueError("Choose a WorldBuilder calendar definition JSON file.")
    name = short(value["name"], "Calendar name", 180, False)
    check_json(value, 100000)
    data = definition(value["calendar"])
    if value["calendar"] != data:
        raise ValueError("Calendar definitions contain calendar settings only.")
    resource = save_resource(
        world,
        {"kind": "calendar", "title": name, "data": data, "visibility": "private"},
    )
    return JsonResponse(serialize(resource), status=201)


def index(request):
    path = settings.BUNDLE_DIR / "index.html"
    return (
        HttpResponse(path.read_text(encoding="utf-8"), content_type="text/html")
        if path.is_file()
        else HttpResponse(
            "WorldBuilder needs its browser bundle. Run npm.cmd run build in WorldBuilder.",
            status=503,
            content_type="text/plain",
        )
    )


def static_file(request, name):
    base = settings.BUNDLE_DIR
    path = (base / name).resolve()
    if base not in path.parents or not path.is_file():
        raise Http404()
    return FileResponse(path.open("rb"))


def favicon(request):
    return HttpResponse(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#244b3b"/><path d="M9 29V12l11-4 11 4v17l-11-4-11 4zm11-19v14" fill="none" stroke="#e9cf8c" stroke-width="2"/></svg>',
        content_type="image/svg+xml",
    )


@endpoint(["POST"])
def parse_document(request):
    from .documents import from_source, render
    value = payload(request)
    text = short(value.get("text", ""), "Markdown", 200000)
    document = from_source(text)
    return JsonResponse({"document": document, "html": render(document)})
