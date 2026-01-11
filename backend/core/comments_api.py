from typing import Optional
from ninja import Router, Schema
from ninja.errors import HttpError
from ninja.security import django_auth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Exercise, UserComment

router = Router(auth=django_auth)


class CommentSchema(Schema):
    id: int
    user_id: int
    exercise_id: int
    text: str
    created_at: str
    updated_at: str
    is_deleted: bool
    deleted_at: Optional[str] = None
    deleted_by: Optional[int] = None
    deleted_by_username: Optional[str] = None
    deleted_message: str = ""
    username: str = ""
    parent_id: Optional[int] = None
    parent_username: Optional[str] = None
    parent_excerpt: Optional[str] = None
    parent_created_at: Optional[str] = None


class CommentCreateSchema(Schema):
    exercise_id: int
    text: str
    parent_id: Optional[int] = None


class CommentUpdateSchema(Schema):
    text: str


class CommentDeleteParams(Schema):
    mode: str = "soft"  # soft|hard
    message: Optional[str] = None


class CommentRestoreSchema(Schema):
    restored: bool


@router.get("", response=list[CommentSchema])
@router.get("/", response=list[CommentSchema])
def list_comments(request, exercise_id: int):
    comments = UserComment.objects.select_related("user", "parent", "deleted_by").filter(exercise_id=exercise_id).order_by("-created_at")
    return [
        CommentSchema(
            id=c.id,
            user_id=c.user_id,
            exercise_id=c.exercise_id,
            text=c.text,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
            is_deleted=c.is_deleted,
            deleted_at=c.deleted_at.isoformat() if c.deleted_at else None,
            deleted_by=c.deleted_by_id,
            deleted_by_username=c.deleted_by.username if c.deleted_by else None,
            deleted_message=c.deleted_message,
            username=c.user.username,
            parent_id=c.parent_id,
            parent_username=c.parent.user.username if c.parent and c.parent.user else None,
            parent_excerpt=(c.parent.text[:140] + ("…" if len(c.parent.text) > 140 else "")) if c.parent else None,
            parent_created_at=c.parent.created_at.isoformat() if c.parent else None,
        )
        for c in comments
    ]


@router.post("", response=CommentSchema)
@router.post("/", response=CommentSchema)
def create_comment(request, payload: CommentCreateSchema):
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    exercise = get_object_or_404(Exercise, id=payload.exercise_id)
    parent = None
    if payload.parent_id:
        parent = get_object_or_404(UserComment.objects.select_related("exercise"), id=payload.parent_id)
        if parent.exercise_id != exercise.id:
            raise HttpError(400, "Parent must be on the same exercise")
    comment = UserComment.objects.create(user=request.user, exercise=exercise, text=payload.text, parent=parent)
    return CommentSchema(
        id=comment.id,
        user_id=comment.user_id,
        exercise_id=comment.exercise_id,
        text=comment.text,
        created_at=comment.created_at.isoformat(),
        updated_at=comment.updated_at.isoformat(),
        is_deleted=comment.is_deleted,
        deleted_at=None,
        deleted_by=None,
        deleted_by_username=None,
        deleted_message="",
        username=request.user.username,
        parent_id=parent.id if parent else None,
        parent_username=parent.user.username if parent else None,
        parent_excerpt=(parent.text[:140] + ("…" if parent and len(parent.text) > 140 else "")) if parent else None,
        parent_created_at=parent.created_at.isoformat() if parent else None,
    )


@router.patch("/{comment_id}", response=CommentSchema)
def update_comment(request, comment_id: int, payload: CommentUpdateSchema):
    comment = get_object_or_404(UserComment.objects.select_related("user", "parent"), id=comment_id)
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if comment.is_deleted:
        raise HttpError(400, "Cannot edit a deleted comment")
    if (comment.user_id != request.user.id) and (not request.user.is_staff):
        raise HttpError(403, "Forbidden")
    comment.text = payload.text
    comment.save()
    return CommentSchema(
        id=comment.id,
        user_id=comment.user_id,
        exercise_id=comment.exercise_id,
        text=comment.text,
        created_at=comment.created_at.isoformat(),
        updated_at=comment.updated_at.isoformat(),
        is_deleted=comment.is_deleted,
        deleted_at=None,
        deleted_by=None,
        deleted_message="",
        username=comment.user.username,
        parent_id=comment.parent_id,
        parent_username=comment.parent.user.username if comment.parent and comment.parent.user else None,
        parent_excerpt=(comment.parent.text[:140] + ("…" if comment.parent and len(comment.parent.text) > 140 else "")) if comment.parent else None,
        parent_created_at=comment.parent.created_at.isoformat() if comment.parent else None,
    )


@router.delete("/{comment_id}", response={204: None, 403: dict})
def delete_comment(request, comment_id: int, mode: str = "soft", message: Optional[str] = None):
    comment = get_object_or_404(UserComment.objects.select_related("user"), id=comment_id)
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")

    is_owner = comment.user_id == request.user.id
    is_admin = request.user.is_staff

    if not (is_owner or is_admin):
        return 403, {"message": "Forbidden"}

    if mode == "hard":
        if not is_admin:
            return 403, {"message": "Only admins can hard delete"}
        if comment.children.exists():
            raise HttpError(409, "Cannot hard-delete a comment that has replies")
        comment.delete()
        return 204, None

    # soft delete
    comment.is_deleted = True
    comment.deleted_at = timezone.now()
    comment.deleted_by = request.user
    comment.deleted_message = message or ""
    comment.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "deleted_message", "updated_at"])
    return 204, None


@router.post("/{comment_id}/restore", response=CommentSchema)
def restore_comment(request, comment_id: int):
    comment = get_object_or_404(UserComment.objects.select_related("user"), id=comment_id)
    if not request.user.is_authenticated or not request.user.is_staff:
        raise HttpError(403, "Admins only")
    if not comment.is_deleted:
        return CommentSchema(
            id=comment.id,
            user_id=comment.user_id,
            exercise_id=comment.exercise_id,
            text=comment.text,
            created_at=comment.created_at.isoformat(),
            updated_at=comment.updated_at.isoformat(),
            is_deleted=comment.is_deleted,
            deleted_at=None,
            deleted_by=None,
            deleted_by_username=None,
            deleted_message=comment.deleted_message,
            username=comment.user.username,
        )
    comment.is_deleted = False
    comment.deleted_at = None
    comment.deleted_by = None
    comment.deleted_message = ""
    comment.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "deleted_message", "updated_at"])
    return CommentSchema(
        id=comment.id,
        user_id=comment.user_id,
        exercise_id=comment.exercise_id,
        text=comment.text,
        created_at=comment.created_at.isoformat(),
        updated_at=comment.updated_at.isoformat(),
        is_deleted=comment.is_deleted,
        deleted_at=None,
        deleted_by=None,
        deleted_by_username=None,
        deleted_message="",
        username=comment.user.username,
        parent_id=comment.parent_id,
        parent_username=comment.parent.user.username if comment.parent and comment.parent.user else None,
        parent_excerpt=(comment.parent.text[:140] + ("…" if comment.parent and len(comment.parent.text) > 140 else "")) if comment.parent else None,
        parent_created_at=comment.parent.created_at.isoformat() if comment.parent else None,
    )
