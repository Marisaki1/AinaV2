import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class World(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    tagline = models.CharField(max_length=240, blank=True)
    description = models.TextField(blank=True)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]


class Resource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="resources")
    kind = models.CharField(max_length=32, default="article")
    template = models.CharField(max_length=60, default="generic")
    title = models.CharField(max_length=180)
    summary = models.TextField(blank=True)
    document = models.JSONField(default=dict)
    source = models.TextField(blank=True)
    private_notes = models.TextField(blank=True)
    tags = models.JSONField(default=list)
    aliases = models.JSONField(default=list)
    data = models.JSONField(default=dict)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )
    position = models.IntegerField(default=0)
    visibility = models.CharField(max_length=12, default="private")
    status = models.CharField(max_length=16, default="draft")
    revision = models.PositiveIntegerField(default=1)
    published = models.JSONField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "-updated_at"]
        indexes = [
            models.Index(fields=["world", "kind", "deleted_at"]),
            models.Index(fields=["world", "title"]),
        ]


class Revision(models.Model):
    resource = models.ForeignKey(
        Resource, on_delete=models.CASCADE, related_name="revisions"
    )
    number = models.PositiveIntegerField()
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        constraints = [
            models.UniqueConstraint(
                fields=["resource", "number"], name="unique_resource_revision"
            )
        ]


class Connection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    world = models.ForeignKey(
        World, on_delete=models.CASCADE, related_name="connections"
    )
    source = models.ForeignKey(
        Resource, on_delete=models.CASCADE, related_name="outgoing"
    )
    target = models.ForeignKey(
        Resource, on_delete=models.CASCADE, related_name="incoming"
    )
    kind = models.CharField(max_length=40, default="related")
    label = models.CharField(max_length=120, blank=True)
    strength = models.IntegerField(default=0)
    notes = models.TextField(blank=True)
    visibility = models.CharField(max_length=12, default="private")
    revision = models.PositiveIntegerField(default=1)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target", "kind"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_active_connection",
            )
        ]


class ConnectionRevision(models.Model):
    connection = models.ForeignKey(
        Connection, on_delete=models.CASCADE, related_name="revisions"
    )
    number = models.PositiveIntegerField()
    snapshot = models.JSONField()
    action = models.CharField(max_length=20, default="updated")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "number"], name="unique_connection_revision"
            )
        ]


class Asset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="assets")
    filename = models.CharField(max_length=200)
    storage_name = models.CharField(max_length=100)
    mime = models.CharField(max_length=80)
    digest = models.CharField(max_length=64)
    size = models.PositiveIntegerField()
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    credit = models.CharField(max_length=300, blank=True)
    tags = models.JSONField(default=list)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)


class Activity(models.Model):
    world = models.ForeignKey(
        World, on_delete=models.CASCADE, related_name="activities"
    )
    kind = models.CharField(max_length=30)
    title = models.CharField(max_length=240)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
