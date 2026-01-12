from django.core.management.base import BaseCommand, CommandError

from core.models import Series, Exercise
from core.search_utils import extract_exercise_search_texts


class Command(BaseCommand):
    help = "Rebuild Exercise.search_text from cached series HTML."

    def add_arguments(self, parser):
        parser.add_argument("--series-id", type=int, help="Rebuild a single series by id")
        parser.add_argument(
            "--clear-missing",
            action="store_true",
            help="Clear search_text when no HTML sections are found",
        )

    def handle(self, *args, **options):
        qs = Series.objects.prefetch_related("exercises")
        if options["series_id"]:
            qs = qs.filter(id=options["series_id"])
        count = qs.count()
        if count == 0:
            raise CommandError("No series matched the query.")

        updated = 0
        for series in qs:
            exercises = list(series.exercises.order_by("number"))
            if not exercises:
                continue
            texts = extract_exercise_search_texts(series.html_content or "", expected_count=len(exercises))
            if not texts:
                if options["clear_missing"]:
                    Exercise.objects.filter(series=series).update(search_text="")
                continue

            if len(texts) != len(exercises):
                self.stdout.write(
                    f"Series {series.id}: HTML produced {len(texts)} sections for {len(exercises)} exercises"
                )

            for idx, ex in enumerate(exercises):
                text = texts[idx] if idx < len(texts) else ""
                Exercise.objects.filter(id=ex.id).update(search_text=text)
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated search_text on {updated} exercises."))
