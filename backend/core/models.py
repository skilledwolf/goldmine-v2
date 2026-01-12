from django.db import models
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _

User = get_user_model()

class Lecture(models.Model):
    """
    A recurring lecture (e.g. Quantum Mechanics 1).
    """
    name = models.CharField(max_length=255, unique=True, help_text="Short name (e.g. QM1)")
    long_name = models.CharField(max_length=1024, help_text="Full display name")
    
    def __str__(self):
        return f"{self.long_name} ({self.name})"

class SemesterGroup(models.Model):
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
        unique_together = ['lecture', 'year', 'semester']

    def __str__(self):
        return f"{self.lecture.name} {self.semester}{self.year}"

class Series(models.Model):
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
    
    class Meta:
        ordering = ['number']
        verbose_name_plural = "Series"

    def __str__(self):
        if self.title:
            return f"{self.semester_group} - {self.title}"
        return f"{self.semester_group} - Series {self.number}"

class Exercise(models.Model):
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
