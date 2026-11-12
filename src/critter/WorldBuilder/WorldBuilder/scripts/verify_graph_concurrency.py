"""Exercise graph write races in the isolated QA SQLite database."""

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "wb.settings")
import django

django.setup()
from django.conf import settings
from django.contrib.auth.models import User
from django.db import close_old_connections
from django.test import Client
from studio.models import World
from studio.services import save_resource

if ROOT / ".preview" not in settings.DATA_DIR.parents:
    raise SystemExit("Isolated .preview workspace required.")
user = User.objects.first()
world = World.objects.filter(owner=user).first()
clients = [Client(HTTP_HOST="127.0.0.1") for _ in range(2)]
for client in clients:
    client.force_login(user)


def parallel(path, payloads, method="post"):
    barrier = threading.Barrier(2)

    def run(index):
        close_old_connections()
        barrier.wait(timeout=10)
        response = getattr(clients[index], method)(
            "/api" + path, json.dumps(payloads[index]), content_type="application/json"
        )
        close_old_connections()
        return response.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        return sorted(executor.map(run, range(2)))


a, b = [
    save_resource(
        world, {"title": "QA concurrent ancestor " + name, "kind": "character"}
    )
    for name in ("A", "B")
]
status = parallel(
    f"/worlds/{world.id}/connections",
    [
        {"source": str(a.id), "target": str(b.id), "kind": "parent"},
        {"source": str(b.id), "target": str(a.id), "kind": "adoptive-parent"},
    ],
)
assert status == [201, 400], status
assert world.connections.filter(source__in=[a, b], target__in=[a, b]).count() == 1
tree = save_resource(
    world,
    {
        "title": "QA concurrent hierarchy",
        "kind": "tree",
        "data": {"items": [str(a.id), str(b.id)], "parents": {}},
    },
)
status2 = parallel(
    f"/resources/{tree.id}",
    [
        {
            "expected_revision": 1,
            "data": {
                "items": [str(a.id), str(b.id)],
                "parents": {str(a.id): str(b.id)},
            },
        },
        {
            "expected_revision": 1,
            "data": {
                "items": [str(a.id), str(b.id)],
                "parents": {str(b.id): str(a.id)},
            },
        },
    ],
    "patch",
)
assert status2 == [200, 409], status2
# Two edits against the same connection revision must not both succeed.
edge = (
    clients[0]
    .post(
        "/api/worlds/" + str(world.id) + "/connections",
        json.dumps({"source": str(a.id), "target": str(b.id), "kind": "friend"}),
        content_type="application/json",
    )
    .json()
)
status3 = parallel(
    "/connections/" + edge["id"],
    [
        {"expected_revision": 1, "notes": "First edit"},
        {"expected_revision": 1, "notes": "Second edit"},
    ],
    "patch",
)
assert status3 == [200, 409], status3
from studio.models import Connection

current = Connection.objects.get(id=edge["id"])
assert current.revision == 2 and current.revisions.count() == 2
# Simultaneous type changes cannot create opposite parent links.
x, y = [save_resource(world, {"title": "QA edit-cycle " + name}) for name in ("X", "Y")]
edges = []
for source, target in [(x, y), (y, x)]:
    edges.append(
        clients[0]
        .post(
            "/api/worlds/" + str(world.id) + "/connections",
            json.dumps(
                {"source": str(source.id), "target": str(target.id), "kind": "friend"}
            ),
            content_type="application/json",
        )
        .json()
    )
barrier = threading.Barrier(2)


def edit_parent(index):
    close_old_connections()
    barrier.wait(timeout=10)
    response = clients[index].patch(
        "/api/connections/" + edges[index]["id"],
        json.dumps({"expected_revision": 1, "kind": "parent"}),
        content_type="application/json",
    )
    close_old_connections()
    return response.status_code


with ThreadPoolExecutor(max_workers=2) as pool:
    status4 = sorted(pool.map(edit_parent, range(2)))
assert status4 == [200, 400], status4
print(
    json.dumps(
        {
            "concurrent_parent_cycle": status,
            "concurrent_hierarchy_stale_write": status2,
            "concurrent_connection_stale_edit": status3,
            "concurrent_connection_edit_cycle": status4,
            "all_or_nothing": True,
        }
    )
)
