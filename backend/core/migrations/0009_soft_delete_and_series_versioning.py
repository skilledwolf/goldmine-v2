from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0008_coursemembership"),
    ]

    operations = [
        # Soft-delete fields
        migrations.AddField(
            model_name="lecture",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="lecture",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="lecture_deleted",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="lecture",
            name="deleted_reason",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="lecture",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="semestergroup",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="semestergroup",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="semestergroup_deleted",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="semestergroup",
            name="deleted_reason",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="semestergroup",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="series",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="series",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="series_deleted",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="series",
            name="deleted_reason",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="series",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="exercise",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="exercise",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="exercise_deleted",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="exercise",
            name="deleted_reason",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="exercise",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        # Series versioning helpers
        migrations.AddField(
            model_name="series",
            name="archived_files",
            field=models.JSONField(blank=True, default=dict, null=True),
        ),
        migrations.AddField(
            model_name="series",
            name="replaces",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="superseded_by_set",
                to="core.series",
            ),
        ),
        migrations.AddField(
            model_name="series",
            name="superseded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="replaces_set",
                to="core.series",
            ),
        ),
        # Adjust lecture.name uniqueness
        migrations.AlterField(
            model_name="lecture",
            name="name",
            field=models.CharField(help_text="Short name (e.g. QM1)", max_length=255),
        ),
        # Remove old unique_together
        migrations.AlterUniqueTogether(
            name="semestergroup",
            unique_together=set(),
        ),
        # New conditional unique constraints
        migrations.AddConstraint(
            model_name="lecture",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("name",),
                name="uniq_active_lecture_name",
            ),
        ),
        migrations.AddConstraint(
            model_name="semestergroup",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("lecture", "year", "semester"),
                name="uniq_active_semester_group",
            ),
        ),
        migrations.AddConstraint(
            model_name="series",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_deleted", False)),
                fields=("semester_group", "number"),
                name="uniq_active_series_number",
            ),
        ),
    ]
