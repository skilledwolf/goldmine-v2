# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class AuthGroup(models.Model):
    name = models.CharField(unique=True, max_length=80)

    class Meta:
        managed = False
        db_table = 'auth_group'


class AuthGroupPermissions(models.Model):
    group_id = models.IntegerField()
    permission_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'auth_group_permissions'
        unique_together = (('group_id', 'permission_id'),)


class AuthMessage(models.Model):
    user_id = models.IntegerField()
    message = models.TextField()

    class Meta:
        managed = False
        db_table = 'auth_message'


class AuthPermission(models.Model):
    name = models.CharField(max_length=50)
    content_type_id = models.IntegerField()
    codename = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'auth_permission'
        unique_together = (('content_type_id', 'codename'),)


class AuthUser(models.Model):
    username = models.CharField(unique=True, max_length=30)
    first_name = models.CharField(max_length=30)
    last_name = models.CharField(max_length=30)
    email = models.CharField(max_length=75)
    password = models.CharField(max_length=128)
    is_staff = models.IntegerField()
    is_active = models.IntegerField()
    is_superuser = models.IntegerField()
    last_login = models.DateTimeField()
    date_joined = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'auth_user'


class AuthUserGroups(models.Model):
    user_id = models.IntegerField()
    group_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'auth_user_groups'
        unique_together = (('user_id', 'group_id'),)


class AuthUserUserPermissions(models.Model):
    user_id = models.IntegerField()
    permission_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'auth_user_user_permissions'
        unique_together = (('user_id', 'permission_id'),)


class DjangoAdminLog(models.Model):
    action_time = models.DateTimeField()
    user_id = models.IntegerField()
    content_type_id = models.IntegerField(blank=True, null=True)
    object_id = models.TextField(blank=True, null=True)
    object_repr = models.CharField(max_length=200)
    action_flag = models.PositiveSmallIntegerField()
    change_message = models.TextField()

    class Meta:
        managed = False
        db_table = 'django_admin_log'


class DjangoContentType(models.Model):
    name = models.CharField(max_length=100)
    app_label = models.CharField(max_length=100)
    model = models.CharField(max_length=100)

    class Meta:
        managed = False
        db_table = 'django_content_type'
        unique_together = (('app_label', 'model'),)


class DjangoMigrations(models.Model):
    app = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    applied = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_migrations'


class DjangoSession(models.Model):
    session_key = models.CharField(primary_key=True, max_length=40)
    session_data = models.TextField()
    expire_date = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'django_session'


class DjangoSite(models.Model):
    domain = models.CharField(max_length=100)
    name = models.CharField(max_length=50)

    class Meta:
        managed = False
        db_table = 'django_site'


class UebbaseExercise(models.Model):
    serie_id = models.IntegerField()
    exnum = models.IntegerField()
    title = models.CharField(max_length=2047)
    keywords = models.CharField(max_length=2047)
    exercisetext = models.TextField()
    tex_linestart = models.IntegerField()
    tex_lineend = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'uebbase_exercise'


class UebbaseLecture(models.Model):
    name = models.CharField(max_length=255)
    longname = models.TextField()

    class Meta:
        managed = False
        db_table = 'uebbase_lecture'


class UebbaseSemesterexercisegroup(models.Model):
    prof = models.TextField()
    lecture_id = models.IntegerField()
    assistants = models.TextField()
    year = models.IntegerField()
    semester = models.CharField(max_length=2)
    fspath = models.CharField(max_length=1023)

    class Meta:
        managed = False
        db_table = 'uebbase_semesterexercisegroup'


class UebbaseSerie(models.Model):
    semexgroup_id = models.IntegerField()
    serienum = models.IntegerField()
    specialserie = models.CharField(max_length=127)
    texfname = models.CharField(max_length=1023)
    pdffname = models.CharField(max_length=1023)
    pdfsolutionsfname = models.CharField(max_length=1023)

    class Meta:
        managed = False
        db_table = 'uebbase_serie'


class UebuploadUploadtempdirectory(models.Model):
    uploaddir = models.CharField(max_length=1023)
    username = models.CharField(max_length=255)
    upload_timestamp = models.DateTimeField()
    status = models.CharField(max_length=32)

    class Meta:
        managed = False
        db_table = 'uebupload_uploadtempdirectory'


class UebviewUsercomment(models.Model):
    user_id = models.IntegerField()
    text = models.TextField()
    datetime = models.DateTimeField()
    for_exercise_id = models.IntegerField(blank=True, null=True)
    for_semexgroup_id = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'uebview_usercomment'


class UebviewUsercommentExerciserefs(models.Model):
    usercomment_id = models.IntegerField()
    exercise_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'uebview_usercomment_exerciserefs'
        unique_together = (('usercomment_id', 'exercise_id'),)


class UebviewUsercommentSemexgrouprefs(models.Model):
    usercomment_id = models.IntegerField()
    semesterexercisegroup_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'uebview_usercomment_semexgrouprefs'
        unique_together = (('usercomment_id', 'semesterexercisegroup_id'),)


class UebviewUsercommentSerierefs(models.Model):
    usercomment_id = models.IntegerField()
    serie_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'uebview_usercomment_serierefs'
        unique_together = (('usercomment_id', 'serie_id'),)


class UebviewUsercommentUserrefs(models.Model):
    usercomment_id = models.IntegerField()
    user_id = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'uebview_usercomment_userrefs'
        unique_together = (('usercomment_id', 'user_id'),)
