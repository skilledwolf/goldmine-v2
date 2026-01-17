from .models import SemesterGroup, CourseMembership

def has_course_access(user, semester_group: SemesterGroup) -> bool:
    """
    Check if the user has edit access to the given semester group.
    Staff always has access.
    Otherwise, must be a 'professor' or 'assistant' in the group.
    """
    if not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    
    return CourseMembership.objects.filter(
        user=user,
        semester_group=semester_group,
        role__in=['professor', 'assistant']
    ).exists()

def is_global_professor(user) -> bool:
    """
    Check if user is staff or has a professor role in ANY course.
    """
    if not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    
    return CourseMembership.objects.filter(
        user=user,
        role='professor'
    ).exists()
