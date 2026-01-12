from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_exercise_search_text"),
    ]

    operations = [
        migrations.CreateModel(
            name="UploadJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.IntegerField()),
                ("semester", models.CharField(choices=[("HS", "Fall Semester"), ("FS", "Spring Semester")], max_length=2)),
                ("professors", models.TextField(blank=True, default="")),
                ("assistants", models.TextField(blank=True, default="")),
                ("fs_path", models.CharField(blank=True, default="", max_length=1024)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("uploaded", "Uploaded"),
                            ("validated", "Validated"),
                            ("imported", "Imported"),
                            ("failed", "Failed"),
                        ],
                        default="uploaded",
                        max_length=20,
                    ),
                ),
                ("source_filename", models.CharField(blank=True, default="", max_length=255)),
                ("upload_dir", models.CharField(blank=True, default="", max_length=1024)),
                ("report_json", models.JSONField(blank=True, null=True)),
                ("error_message", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "lecture",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.lecture"),
                ),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="auth.user"),
                ),
            ],
        ),
    ]
