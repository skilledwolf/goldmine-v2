from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_uploadjob"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RenderJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("running", "Running"),
                            ("succeeded", "Succeeded"),
                            ("failed", "Failed"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="queued",
                        max_length=20,
                    ),
                ),
                (
                    "scope",
                    models.CharField(
                        choices=[("all", "All series"), ("series", "Specific series")],
                        default="all",
                        max_length=20,
                    ),
                ),
                ("series_ids", models.JSONField(blank=True, null=True)),
                ("force", models.BooleanField(default=False)),
                ("total_count", models.IntegerField(default=0)),
                ("processed_count", models.IntegerField(default=0)),
                ("rendered_count", models.IntegerField(default=0)),
                ("skipped_count", models.IntegerField(default=0)),
                ("failed_count", models.IntegerField(default=0)),
                ("current_series_id", models.IntegerField(blank=True, null=True)),
                ("pid", models.IntegerField(blank=True, null=True)),
                ("return_code", models.IntegerField(blank=True, null=True)),
                ("error_message", models.TextField(blank=True, default="")),
                ("output_log", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]

