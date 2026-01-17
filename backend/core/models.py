from django.db import models
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.contrib.postgres.indexes import GinIndex
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from pathlib import Path
import shutil
from django.conf import settings
import uuid

User = get_user_model()


# ------------ Soft delete + trash helpers ------------

TRASH_ROOT = Path(settings.MEDIA_ROOT) / "trash"


def _ensure_trash_dir(subpath: str) -> Path:
    target = TRASH_ROOT / subpath
    target.mkdir(parents=True, exist_ok=True)
    return target


def _move_to_trash(src: Path, subdir: str) -> Path | None:
    if not src or not src.exists():
        return None
    dst_dir = _ensure_trash_dir(subdir)
    dst = dst_dir / src.name
    try:
        shutil.move(str(src), str(dst))
    except OSError:
        return None
    return dst


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        return super().update(is_deleted=True, deleted_at=timezone.now())

    def hard_delete(self):
        return super().delete()

    def with_deleted(self):
        return super().all()


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(is_deleted=False)

    def with_deleted(self):
        return SoftDeleteQuerySet(self.model, using=self._db).all()


class SoftDeleteModel(models.Model):
    """
    Abstract base model that soft-deletes rows and records audit info.
    """

    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="%(class)s_deleted",
    )
    deleted_reason = models.CharField(max_length=255, blank=True, default="")

    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def soft_delete(self, user: User | None = None, reason: str = ""):
        if self.is_deleted:
            return
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.deleted_reason = reason or self.deleted_reason
        self.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "deleted_reason"])

    def restore(self):
        if not self.is_deleted:
            return
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        # Keep deleted_reason for audit trail
        self.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])

    def delete(self, using=None, keep_parents=False):
        self.soft_delete()

    def hard_delete(self, using=None, keep_parents=False):
        return super().delete(using=using, keep_parents=keep_parents)

    def purge(self):
        return self.hard_delete()

class Lecture(SoftDeleteModel):
    """
    A recurring lecture (e.g. Quantum Mechanics 1).
    """
    name = models.CharField(max_length=255, help_text="Short name (e.g. QM1)")
    long_name = models.CharField(max_length=1024, help_text="Full display name")
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name"],
                condition=Q(is_deleted=False),
                name="uniq_active_lecture_name",
            )
        ]

    def __str__(self):
        return f"{self.long_name} ({self.name})"

    def soft_delete(self, user: User | None = None, reason: str = ""):
        if self.is_deleted:
            return
        for sg in SemesterGroup.all_objects.filter(lecture=self, is_deleted=False):
            sg.soft_delete(user=user, reason=reason or "Lecture deleted")
        super().soft_delete(user=user, reason=reason or "Lecture deleted")

    def restore(self):
        if not self.is_deleted:
            return
        super().restore()
        for sg in SemesterGroup.all_objects.filter(lecture=self, is_deleted=True):
            sg.restore()

    def purge(self):
        for sg in SemesterGroup.all_objects.filter(lecture=self):
            sg.purge()
        return self.hard_delete()

class SemesterGroup(SoftDeleteModel):
    """
    A specific instance of a lecture in a semester (e.g. QM1 HS2023).
    """
    SEMESTER_CHOICES = [
        ('HS', 'Fall Semester'),
        ('FS', 'Spring Semester'),
    ]
    
    lecture = models.ForeignKey(Lecture, on_delete=models.CASCADE, related_name='semester_groups')
    year = models.IntegerField(help_text="Year (e.g. 2023)")
    semester = models.CharField(max_length=2, choices=SEMESTER_CHOICES)
    
    # Store lists of names as simple text for now, or use JSONField
    professors = models.TextField(help_text="One per line")
    assistants = models.TextField(help_text="One per line")
    
    fs_path = models.CharField(max_length=1024, help_text="Path on filesystem for PDF assets", blank=True)

    class Meta:
        ordering = ['-year', 'semester']
        constraints = [
            models.UniqueConstraint(
                fields=['lecture', 'year', 'semester'],
                condition=Q(is_deleted=False),
                name="uniq_active_semester_group",
            )
        ]

    def __str__(self):
        return f"{self.lecture.name} {self.semester}{self.year}"

    def soft_delete(self, user: User | None = None, reason: str = ""):
        if self.is_deleted:
            return
        for series in Series.all_objects.filter(semester_group=self, is_deleted=False):
            series.soft_delete(user=user, reason=reason or "Semester deleted")
        super().soft_delete(user=user, reason=reason or "Semester deleted")

    def restore(self):
        if not self.is_deleted:
            return
        super().restore()
        for series in Series.all_objects.filter(semester_group=self, is_deleted=True):
            series.restore()

    def purge(self):
        for series in Series.all_objects.filter(semester_group=self):
            series.purge()
        return self.hard_delete()

class CourseMembership(models.Model):
    """
    Links a User to a SemesterGroup with a specific role.
    """
    ROLE_CHOICES = [
        ('professor', 'Professor'),
        ('assistant', 'Assistant'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='course_memberships')
    semester_group = models.ForeignKey(SemesterGroup, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'semester_group']
        ordering = ['role', 'user__username']

    def __str__(self):
        return f"{self.user.username} - {self.role} ({self.semester_group})"

class Series(SoftDeleteModel):
    """
    An exercise sheet (e.g. Serie 1, Midterm Exam).
    """

    class RenderStatus(models.TextChoices):
        NOT_RENDERED = "not_rendered", "Not rendered"
        OK = "ok", "Rendered"
        FAILED = "failed", "Failed"

    semester_group = models.ForeignKey(SemesterGroup, on_delete=models.CASCADE, related_name='series')
    number = models.IntegerField(help_text="Series number (or ordering for special sheets)")
    title = models.CharField(max_length=255, blank=True, help_text="Special title (e.g. 'Midterm')")

    # Asset paths relative to semester_group.fs_path
    tex_file = models.CharField(max_length=255, blank=True)
    pdf_file = models.CharField(max_length=255, blank=True)
    solution_file = models.CharField(max_length=255, blank=True)

    # HTML rendering cache (derived from tex_file)
    html_content = models.TextField(blank=True, default="")
    html_rendered_at = models.DateTimeField(null=True, blank=True)
    render_status = models.CharField(
        max_length=20,
        choices=RenderStatus.choices,
        default=RenderStatus.NOT_RENDERED,
    )
    render_log = models.TextField(blank=True, default="")
    tex_checksum = models.CharField(max_length=64, blank=True, default="")

    # Soft delete / versioning helpers
    archived_files = models.JSONField(blank=True, null=True, default=dict)
    replaces = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="superseded_by_set",
    )
    superseded_by = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replaces_set",
    )
    
    class Meta:
        ordering = ['number']
        verbose_name_plural = "Series"
        constraints = [
            models.UniqueConstraint(
                fields=["semester_group", "number"],
                condition=Q(is_deleted=False),
                name="uniq_active_series_number",
            )
        ]

    def __str__(self):
        if self.title:
            return f"{self.semester_group} - {self.title}"
        return f"{self.semester_group} - Series {self.number}"

    def _archive_files(self) -> None:
        """
        Move files to trash and remember their locations for restore.
        """
        fs_path = (self.semester_group.fs_path or "").strip()
        if not fs_path:
            return
        root = Path(settings.LECTURE_MEDIA_ROOT) / fs_path
        if not root.exists():
            return

        subdir = f"series/{self.id}-{timezone.now():%Y%m%d%H%M%S}-{uuid.uuid4().hex[:6]}"
        archived: list[dict[str, str]] = []
        for field in ["tex_file", "pdf_file", "solution_file"]:
            rel = (getattr(self, field) or "").strip()
            if not rel:
                continue
            src = (root / rel).resolve()
            moved = _move_to_trash(src, subdir)
            if moved:
                archived.append(
                    {
                        "field": field,
                        "from": str(src),
                        "to": str(moved),
                    }
                )
        if archived:
            self.archived_files = archived
            self.save(update_fields=["archived_files"])

    def _restore_files(self) -> None:
        archived = self.archived_files or []
        if not archived:
            return
        restored = []
        for entry in archived:
            try:
                src = Path(entry.get("to"))
                dst = Path(entry.get("from"))
            except TypeError:
                continue
            if not src.exists():
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            target = dst
            if target.exists():
                target = dst.with_name(f"{dst.stem}.restored-{uuid.uuid4().hex[:4]}{dst.suffix}")
            try:
                shutil.move(str(src), str(target))
                entry["restored_to"] = str(target)
                restored.append(entry)
            except OSError:
                continue
        if restored:
            # Keep history but clear archived_files so we don't re-run restore.
            self.archived_files = []
            self.save(update_fields=["archived_files"])

    def soft_delete(self, user: User | None = None, reason: str = ""):
        if self.is_deleted:
            return
        for ex in Exercise.all_objects.filter(series=self, is_deleted=False):
            ex.soft_delete(user=user, reason=reason or "Series deleted")
        self._archive_files()
        super().soft_delete(user=user, reason=reason or "Series deleted")

    def restore(self):
        self._restore_files()
        super().restore()
        for ex in Exercise.all_objects.filter(series=self, is_deleted=True):
            ex.restore()

    def purge(self):
        archived = self.archived_files or []
        for entry in archived:
            path = entry.get("to")
            if not path:
                continue
            try:
                p = Path(path)
            except TypeError:
                continue
            if p.is_file():
                try:
                    p.unlink()
                except OSError:
                    pass
            if p.parent.exists():
                try:
                    p.parent.rmdir()
                except OSError:
                    pass
        return self.hard_delete()

class Exercise(SoftDeleteModel):
    """
    A specific exercise problem.
    """
    series = models.ForeignKey(Series, on_delete=models.CASCADE, related_name='exercises')
    number = models.IntegerField(help_text="Exercise number within series")
    title = models.CharField(max_length=1024, blank=True)
    
    # Text content (legacy import; not the primary search source)
    # Using standard TextField because modern Postgres handles UTF-8 properly
    text_content = models.TextField(blank=True)

    # Searchable text derived from rendered HTML/TeX
    search_text = models.TextField(blank=True, default="")
    
    # For future semantic search (requires pgvector extension)
    # embedding = VectorField(dimensions=1536, null=True, blank=True) 
    
    class Meta:
        ordering = ['number']
        indexes = [
            GinIndex(
                fields=["search_text"],
                name="exercise_search_text_trgm",
                opclasses=["gin_trgm_ops"],
            ),
        ]

    def __str__(self):
        return f"{self.series} - Ex {self.number}: {self.title}"

class UserComment(models.Model):
    """
    User comments on exercises.
    Refactored to be cleaner than the old implementation.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name='comments')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='deleted_comments')
    deleted_message = models.TextField(blank=True, default="")
    
    # Mentions can be parsed from text, but we can store structured data if needed
    
    def __str__(self):
        return f"Comment by {self.user} on {self.exercise}"


class UploadJob(models.Model):
    class Status(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        VALIDATED = "validated", "Validated"
        IMPORTED = "imported", "Imported"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    lecture = models.ForeignKey(Lecture, on_delete=models.CASCADE)
    year = models.IntegerField()
    semester = models.CharField(max_length=2, choices=SemesterGroup.SEMESTER_CHOICES)
    professors = models.TextField(blank=True, default="")
    assistants = models.TextField(blank=True, default="")
    fs_path = models.CharField(max_length=1024, blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADED)
    source_filename = models.CharField(max_length=255, blank=True, default="")
    upload_dir = models.CharField(max_length=1024, blank=True, default="")
    report_json = models.JSONField(blank=True, null=True)
    error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"UploadJob #{self.id} ({self.lecture.name} {self.semester}{self.year})"


class RenderJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    class Scope(models.TextChoices):
        ALL = "all", "All series"
        SERIES = "series", "Specific series"

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)

    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.ALL)
    series_ids = models.JSONField(blank=True, null=True)
    force = models.BooleanField(default=False)

    total_count = models.IntegerField(default=0)
    processed_count = models.IntegerField(default=0)
    rendered_count = models.IntegerField(default=0)
    skipped_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    current_series_id = models.IntegerField(null=True, blank=True)

    pid = models.IntegerField(null=True, blank=True)
    return_code = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True, default="")
    output_log = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"RenderJob #{self.id} ({self.status})"
