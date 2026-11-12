import json
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import World, Resource
from .services import save_resource, world_archive, import_world_archive, serialize


class CampaignRecordTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="campaign-owner", password="campaign-tests-only"
        )
        self.client.force_login(self.user)
        self.world = World.objects.create(owner=self.user, name="Campaign QA")
        self.campaign = self.add("Journey", "campaign", {})
        self.other = self.add("Other campaign", "campaign", {})
        self.session = self.add(
            "First session",
            "session",
            {"campaign_id": str(self.campaign.id), "number": 1},
        )

    def add(self, title, kind, data, **fields):
        return save_resource(
            self.world, {"title": title, "kind": kind, "data": data, **fields}
        )

    def post(self, path, value):
        return self.client.post(
            "/api" + path, json.dumps(value), content_type="application/json"
        )

    def update(self, record, data):
        return self.client.patch(
            f"/api/resources/{record.id}",
            json.dumps({"data": data, "expected_revision": record.revision}),
            content_type="application/json",
        )

    def publish(self, record):
        record.visibility = "public"
        record.save(update_fields=["visibility"])
        self.assertEqual(
            self.post(
                f"/resources/{record.id}/publish",
                {"expected_revision": record.revision},
            ).status_code,
            200,
        )
        record.refresh_from_db()

    def journal(self, **values):
        return self.add(
            "Road journal",
            "note",
            {
                "campaign_id": str(self.campaign.id),
                "session_id": str(self.session.id),
                "record_type": "journal",
                "logged_on": "2026-11-05",
                "world_day": "Day 12 — Forest road",
                **values,
            },
        )

    def test_daily_journal_and_milestones_are_private_versioned_records(self):
        for kind in ("journal", "milestone", "note"):
            record = self.journal(record_type=kind)
            self.assertEqual(record.visibility, "private")
            self.assertEqual(record.revisions.count(), 1)
            self.assertEqual(record.data["session_id"], str(self.session.id))

    def test_structured_session_fields_save_and_reader_excludes_gm_plans(self):
        data = {
            **self.session.data,
            "session_status": "completed",
            "prep": "Hidden ambush",
            "recap": "Found the shrine",
            "consequences": "Secret faction response",
            "rewards": "Level 3, 200 gold",
            "next_steps": "Prepare the villain",
        }
        response = self.update(self.session, data)
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.publish(self.session)
        reader = serialize(self.session, reader=True)
        self.assertEqual(reader["data"]["recap"], "Found the shrine")
        self.assertEqual(reader["data"]["rewards"], "Level 3, 200 gold")
        for key in ("prep", "consequences", "next_steps", "campaign_id"):
            self.assertNotIn(key, reader["data"])
        response = self.client.get(f"/api/resources/{self.session.id}?audience=reader")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(b"Hidden ambush", response.content)
        self.assertNotIn(b"Secret faction response", response.content)
        for secret in (
            "Hidden ambush",
            "Secret faction response",
            "Prepare the villain",
        ):
            result = self.client.get(
                f"/api/worlds/{self.world.id}/resources",
                {"audience": "reader", "q": secret},
            )
            self.assertEqual(result.json()["resources"], [])

    def test_reader_uses_published_recap_and_omits_private_link_ids(self):
        public = self.add("Known character", "character", {})
        private = self.add("Hidden place", "article", {})
        self.publish(public)
        record = self.journal(related_entries=[str(public.id), str(private.id)])
        self.publish(record)
        reader = serialize(record, reader=True)
        self.assertEqual(reader["data"]["related_entries"], [str(public.id)])
        self.assertNotIn("session_id", reader["data"])
        self.assertIsNone(reader["parent"])
        self.publish(self.campaign)
        self.publish(self.session)
        reader = serialize(record, reader=True)
        self.assertEqual(reader["data"]["session_id"], str(self.session.id))
        self.assertEqual(reader["data"]["campaign_id"], str(self.campaign.id))

    def test_reader_recap_is_snapshot_not_draft(self):
        response = self.update(
            self.session, {**self.session.data, "recap": "Published recap"}
        )
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.publish(self.session)
        self.assertEqual(
            self.update(
                self.session, {**self.session.data, "recap": "Draft change"}
            ).status_code,
            200,
        )
        self.session.refresh_from_db()
        self.assertEqual(
            serialize(self.session, reader=True)["data"]["recap"], "Published recap"
        )

    def test_wrong_campaign_kind_and_foreign_world_rejected(self):
        world = World.objects.create(owner=self.user, name="Foreign")
        foreign = save_resource(world, {"title": "Foreign", "kind": "campaign"})
        for identity in (str(self.session.id), str(foreign.id), "not-a-uuid", True):
            with self.subTest(identity=identity):
                response = self.post(
                    f"/worlds/{self.world.id}/resources",
                    {
                        "title": "Invalid note",
                        "kind": "note",
                        "data": {"campaign_id": identity},
                    },
                )
                self.assertEqual(response.status_code, 400)

    def test_session_must_match_selected_campaign(self):
        record = self.journal()
        self.assertEqual(
            self.update(
                record, {**record.data, "campaign_id": str(self.other.id)}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.update(
                record,
                {**record.data, "campaign_id": str(self.other.id), "session_id": ""},
            ).status_code,
            200,
        )

    def test_wrong_session_kind_rejected(self):
        response = self.post(
            f"/worlds/{self.world.id}/resources",
            {
                "title": "Wrong session",
                "kind": "note",
                "data": {"session_id": str(self.campaign.id)},
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_status_number_and_field_bounds(self):
        for patch in (
            {"session_status": "mystery"},
            {"number": True},
            {"number": 0},
            {"number": 1000001},
            {"prep": []},
            {"recap": "x" * 50001},
        ):
            with self.subTest(patch=list(patch)):
                self.assertEqual(
                    self.update(
                        self.session, {**self.session.data, **patch}
                    ).status_code,
                    400,
                )

    def test_journal_record_types_and_dates(self):
        for patch in (
            {"record_type": "oops"},
            {"logged_on": "2026-02-30"},
            {"logged_on": "20261105"},
            {"logged_on": True},
            {"logged_on": []},
            {"logged_on": {}},
            {"logged_on": 0},
            {"world_day": "x" * 121},
        ):
            response = self.post(
                f"/worlds/{self.world.id}/resources",
                {"title": "Bad journal", "kind": "note", "data": patch},
            )
            self.assertEqual(response.status_code, 400)
        self.journal(logged_on="2024-02-29", world_day="Chapter II / third night")

    def test_related_entry_list_validation(self):
        world = World.objects.create(owner=self.user, name="Foreign")
        foreign = save_resource(world, {"title": "Foreign", "kind": "map"})
        for linked in (
            "bad",
            [True],
            [str(foreign.id)],
            [str(self.session.id)] * 2,
            ["bad-uuid"],
            list(map(str, range(501))),
        ):
            response = self.post(
                f"/worlds/{self.world.id}/resources",
                {
                    "title": "Bad links",
                    "kind": "note",
                    "data": {"related_entries": linked},
                },
            )
            self.assertEqual(response.status_code, 400)

    def test_deleted_links_preserve_existing_records_but_reject_new_links(self):
        linked = self.add("Place", "article", {})
        record = self.journal(related_entries=[str(linked.id)])
        Resource.objects.filter(id__in=[linked.id, self.session.id]).update(
            deleted_at=timezone.now()
        )
        self.assertEqual(
            self.update(record, {**record.data, "world_day": "Next day"}).status_code,
            200,
        )
        self.assertEqual(
            self.post(
                f"/worlds/{self.world.id}/resources",
                {"title": "New record", "kind": "note", "data": record.data},
            ).status_code,
            400,
        )

    def test_stale_session_and_campaign_link_updates_do_not_overwrite(self):
        for record in (self.session, self.campaign):
            first = {**record.data, "related_entries": [str(self.other.id)]}
            self.assertEqual(self.update(record, first).status_code, 200)
            self.assertEqual(
                self.update(record, {**record.data, "related_entries": []}).status_code,
                409,
            )
            record.refresh_from_db()
            self.assertEqual(record.data, first)

    def test_restore_keeps_journal_content_and_associations(self):
        record = self.journal()
        self.assertEqual(
            self.update(record, {**record.data, "world_day": "Changed"}).status_code,
            200,
        )
        record.refresh_from_db()
        response = self.post(
            f"/resources/{record.id}/restore",
            {"number": 1, "expected_revision": record.revision},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["world_day"], "Day 12 — Forest road")

    def test_world_archive_remaps_campaign_session_and_related_entries(self):
        linked = self.add("Map", "map", {})
        record = self.journal(related_entries=[str(linked.id)])
        self.publish(record)
        clone = import_world_archive(self.user, world_archive(self.world))
        copied = Resource.objects.get(world=clone, title=record.title)
        self.assertEqual(
            copied.data["campaign_id"],
            str(Resource.objects.get(world=clone, title=self.campaign.title).id),
        )
        self.assertEqual(
            copied.data["session_id"],
            str(Resource.objects.get(world=clone, title=self.session.title).id),
        )
        self.assertEqual(
            copied.data["related_entries"],
            [str(Resource.objects.get(world=clone, title=linked.title).id)],
        )
        self.assertEqual(copied.published["data"], copied.data)

    def test_legacy_parent_session_accepts_journal_association(self):
        session = self.add(
            "Legacy session", "session", {}, parent=str(self.campaign.id)
        )
        record = self.journal(session_id=str(session.id))
        self.assertEqual(record.data["session_id"], str(session.id))
