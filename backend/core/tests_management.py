from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from .models import Lecture, SemesterGroup, Series, CourseMembership
import json

User = get_user_model()

class ManagementTests(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(username="staff", password="password", is_staff=True)
        self.prof_user = User.objects.create_user(username="prof", password="password")
        self.assistant_user = User.objects.create_user(username="asst", password="password")
        self.normal_user = User.objects.create_user(username="norm", password="password")

        # Make prof a professor in a dummy course to get "global professor" status
        l1 = Lecture.objects.create(name="DUMMY", long_name="Dummy Lecture")
        sg1 = SemesterGroup.objects.create(lecture=l1, year=2020, semester="HS")
        CourseMembership.objects.create(user=self.prof_user, semester_group=sg1, role="professor")

    def test_create_lecture_permissions(self):
        payload = {"name": "NEW", "long_name": "New Lecture"}
        
        # Staff
        self.client.force_login(self.staff_user)
        res = self.client.post("/api/lectures", data=payload, content_type="application/json")
        self.assertEqual(res.status_code, 200)

        # Global Professor
        self.client.force_login(self.prof_user)
        res = self.client.post("/api/lectures", data={"name": "PROF_LEC", "long_name": "Prof Lecture"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)

        # Assistant (not global prof)
        self.client.force_login(self.assistant_user)
        res = self.client.post("/api/lectures", data={"name": "FAIL", "long_name": "Fail"}, content_type="application/json")
        self.assertEqual(res.status_code, 403)

    def test_delete_lecture(self):
        l = Lecture.objects.create(name="DEL", long_name="Delete Me")
        
        # Non-empty check
        SemesterGroup.objects.create(lecture=l, year=2024, semester="FS")
        self.client.force_login(self.prof_user)
        res = self.client.delete(f"/api/lectures/{l.id}")
        self.assertEqual(res.status_code, 400) # Cannot delete with children

        # Empty check
        l.semester_groups.all().delete()
        res = self.client.delete(f"/api/lectures/{l.id}")
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Lecture.objects.filter(id=l.id).exists())

    def test_add_semester_group(self):
        l = Lecture.objects.create(name="TEST", long_name="Test")
        payload = {"year": 2025, "semester": "HS", "professors": "P", "assistants": "A"}

        # Prof
        self.client.force_login(self.prof_user)
        res = self.client.post(f"/api/lectures/{l.id}/semester_groups", data=payload, content_type="application/json")
        self.assertEqual(res.status_code, 200)

        # Assistant -> 403
        self.client.force_login(self.assistant_user)
        res = self.client.post(f"/api/lectures/{l.id}/semester_groups", data=payload, content_type="application/json")
        self.assertEqual(res.status_code, 403)

    def test_delete_semester_group(self):
        l = Lecture.objects.create(name="TEST2", long_name="Test 2")
        sg = SemesterGroup.objects.create(lecture=l, year=2025, semester="FS")

        # Assistant of this group can delete
        CourseMembership.objects.create(user=self.assistant_user, semester_group=sg, role="assistant")
        
        self.client.force_login(self.assistant_user)
        
        # Non-empty (simulate series)
        Series.objects.create(semester_group=sg, number=1)
        res = self.client.delete(f"/api/semester_groups/{sg.id}")
        self.assertEqual(res.status_code, 400)

        # Empty
        sg.series.all().delete()
        res = self.client.delete(f"/api/semester_groups/{sg.id}")
        self.assertEqual(res.status_code, 204)
        self.assertFalse(SemesterGroup.objects.filter(id=sg.id).exists())

    def test_delete_semester_group_strangers(self):
        l = Lecture.objects.create(name="TEST3", long_name="Test 3")
        sg = SemesterGroup.objects.create(lecture=l, year=2025, semester="FS")
        
        # Random user cannot delete
        self.client.force_login(self.normal_user)
        res = self.client.delete(f"/api/semester_groups/{sg.id}")
        self.assertEqual(res.status_code, 403)
