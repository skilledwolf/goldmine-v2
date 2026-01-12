from django.db import migrations, models
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import CreateExtension


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0004_series_html_cache'),
    ]

    operations = [
        CreateExtension('pg_trgm'),
        migrations.AddField(
            model_name='exercise',
            name='search_text',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddIndex(
            model_name='exercise',
            index=GinIndex(
                fields=['search_text'],
                name='exercise_search_text_trgm',
                opclasses=['gin_trgm_ops'],
            ),
        ),
    ]
