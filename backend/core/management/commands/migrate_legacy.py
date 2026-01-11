from django.core.management.base import BaseCommand
from django.db import connections, transaction
from core.models import Lecture, SemesterGroup, Series, Exercise, UserComment, User
from core.legacy_models import (
    UebbaseLecture, UebbaseSemesterexercisegroup, UebbaseSerie, UebbaseExercise,
    UebviewUsercomment, AuthUser
)

class Command(BaseCommand):
    help = 'Migrate data from legacy database'

    def handle(self, *args, **options):
        self.stdout.write("Starting migration...")
        
        legacy_db = 'legacy'

        with transaction.atomic():
            user_map = self.migrate_users(legacy_db)
            lecture_map = self.migrate_lectures(legacy_db)
            self.migrate_comments(legacy_db, user_map, lecture_map)

        self.stdout.write(self.style.SUCCESS('Migration complete!'))

    def migrate_users(self, db):
        self.stdout.write("Migrating users...")
        old_users = AuthUser.objects.using(db).all()
        user_map = {} # old_id -> User object
        created_count = 0
        
        for old in old_users:
            # Check by username first
            u = User.objects.filter(username=old.username).first()
            if not u:
                u = User.objects.create(
                    username=old.username,
                    email=old.email,
                    first_name=old.first_name,
                    last_name=old.last_name,
                    password=old.password, 
                    is_staff=bool(old.is_staff),
                    is_superuser=bool(old.is_superuser),
                    is_active=bool(old.is_active),
                    date_joined=old.date_joined,
                    last_login=old.last_login
                )
                created_count += 1
            
            user_map[old.id] = u
            
        self.stdout.write(f"Processed users. Created {created_count} new.")
        return user_map

    def migrate_lectures(self, db):
        self.stdout.write("Migrating content...")
        lecture_map = {} # (lecture_id, 'lecture') etc? Ideally just map exercises.
        # But comments can link to Exercise, Series, SemExGroup.
        # We need to map old IDs to new objects.
        # Let's map old_exercise_id -> new_exercise
        
        exercise_map = {} 

        # 1. Lectures
        lectures = UebbaseLecture.objects.using(db).all()
        for l_old in lectures:
            l_new, _ = Lecture.objects.get_or_create(
                name=l_old.name,
                defaults={'long_name': l_old.longname}
            )
            
            sem_groups = UebbaseSemesterexercisegroup.objects.using(db).filter(lecture_id=l_old.id)
            for sg_old in sem_groups:
                sg_new, _ = SemesterGroup.objects.get_or_create(
                    lecture=l_new,
                    year=sg_old.year,
                    semester=sg_old.semester,
                    defaults={
                        'professors': sg_old.prof,
                        'assistants': sg_old.assistants,
                        'fs_path': sg_old.fspath
                    }
                )

                series_list = UebbaseSerie.objects.using(db).filter(semexgroup_id=sg_old.id)
                for s_old in series_list:
                    s_new, _ = Series.objects.get_or_create(
                        semester_group=sg_new,
                        number=s_old.serienum,
                        defaults={
                            'title': s_old.specialserie,
                            'tex_file': s_old.texfname,
                            'pdf_file': s_old.pdffname,
                            'solution_file': s_old.pdfsolutionsfname
                        }
                    )
                    
                    exercises = UebbaseExercise.objects.using(db).filter(serie_id=s_old.id)
                    for ex_old in exercises:
                        ex_new, _ = Exercise.objects.get_or_create(
                            series=s_new,
                            number=ex_old.exnum,
                            defaults={
                                'title': ex_old.title,
                                'text_content': ex_old.exercisetext
                            }
                        )
                        exercise_map[ex_old.id] = ex_new
        
        return exercise_map

    def migrate_comments(self, db, user_map, exercise_map):
        self.stdout.write("Migrating comments...")
        # Comments in legacy seem to link via 'uebview_usercomment_exerciserefs' etc.
        # The main table 'uebview_usercomment' has 'for_exercise_id' column too (integer field).
        # Let's check model again.
        # UebviewUsercomment: for_exercise_id, for_semexgroup_id.
        
        comments = UebviewUsercomment.objects.using(db).all()
        count = 0
        for c_old in comments:
            user = user_map.get(c_old.user_id)
            if not user:
                continue # User not found
            
            # Identify target
            ex_new = None
            if c_old.for_exercise_id:
               ex_new = exercise_map.get(c_old.for_exercise_id)
            
            if ex_new:
                UserComment.objects.create(
                    user=user,
                    exercise=ex_new,
                    text=c_old.text,
                    created_at=c_old.datetime
                )
                count += 1
                
        self.stdout.write(f"Migrated {count} comments.")
                        
