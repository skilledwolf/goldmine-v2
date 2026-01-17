from typing import List
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from ninja import Router, Schema
from ninja.security import django_auth
from .models import SemesterGroup, CourseMembership

router = Router(auth=django_auth)
User = get_user_model()

class UserSchema(Schema):
    id: int
    username: str
    email: str = ""
    is_staff: bool

class MembershipSchema(Schema):
    id: int
    user: UserSchema
    role: str
    created_at: str

class MembershipCreateSchema(Schema):
    user_id: int
    role: str  # 'professor' or 'assistant'

@router.get("", response=List[UserSchema])
def list_users(request):
    """
    List all users. Staff only.
    """
    if not request.user.is_staff:
        # For security, standard users shouldn't see the full user list
        # unless necessary. For now, restrict to staff.
        return []
    return User.objects.all().order_by('username')

@router.get("/memberships/{semester_group_id}", response=List[MembershipSchema])
def list_course_memberships(request, semester_group_id: int):
    """
    List all memberships for a specific semester group.
    """
    # Ideally check if user is allowed to see this, but for now open to authenticated users
    # or strictly staff/members. Let's start with open for authenticated.
    group = get_object_or_404(SemesterGroup, id=semester_group_id)
    return group.memberships.select_related('user').all()

@router.post("/memberships/{semester_group_id}", response={200: MembershipSchema, 400: dict})
def add_course_membership(request, semester_group_id: int, data: MembershipCreateSchema):
    """
    Add a user to a semester group. Staff only.
    """
    if not request.user.is_staff:
        return 403, {"message": "Permission denied"}

    group = get_object_or_404(SemesterGroup, id=semester_group_id)
    user = get_object_or_404(User, id=data.user_id)

    if data.role not in ['professor', 'assistant']:
        return 400, {"message": "Invalid role"}

    try:
        membership = CourseMembership.objects.create(
            semester_group=group,
            user=user,
            role=data.role
        )
    except IntegrityError:
        return 400, {"message": "User is already a member of this group"}

    return 200, membership

@router.delete("/memberships/{semester_group_id}/{user_id}", response={204: None, 403: dict, 404: dict})
def remove_course_membership(request, semester_group_id: int, user_id: int):
    """
    Remove a user from a semester group. Staff only.
    """
    if not request.user.is_staff:
        return 403, {"message": "Permission denied"}

    membership = get_object_or_404(CourseMembership, semester_group_id=semester_group_id, user_id=user_id)
    membership.delete()
    return 204, None
