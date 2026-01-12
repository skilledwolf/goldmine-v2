from django.contrib import admin
from .models import Lecture, SemesterGroup, Series, Exercise, UserComment

class SemesterGroupInline(admin.TabularInline):
    model = SemesterGroup
    extra = 0

@admin.register(Lecture)
class LectureAdmin(admin.ModelAdmin):
    list_display = ('name', 'long_name')
    search_fields = ('name', 'long_name')
    inlines = [SemesterGroupInline]

@admin.register(SemesterGroup)
class SemesterGroupAdmin(admin.ModelAdmin):
    list_display = ('lecture', 'year', 'semester', 'file_path_preview')
    list_filter = ('year', 'semester', 'lecture')
    search_fields = ('lecture__name', 'lecture__long_name')
    
    def file_path_preview(self, obj):
        return obj.fs_path or "-"
    file_path_preview.short_description = "FS Path"

class ExerciseInline(admin.TabularInline):
    model = Exercise
    extra = 1
    fields = ('number', 'title')

@admin.register(Series)
class SeriesAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'semester_group', 'number', 'tex_file')
    list_filter = ('semester_group__lecture', 'semester_group__year', 'render_status')
    inlines = [ExerciseInline]
    search_fields = ('title', 'semester_group__lecture__name')

@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'series', 'number')
    search_fields = ('title', 'search_text')
    list_filter = ('series__semester_group__lecture',)

@admin.register(UserComment)
class UserCommentAdmin(admin.ModelAdmin):
    list_display = ('user', 'exercise', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('text', 'user__username')
