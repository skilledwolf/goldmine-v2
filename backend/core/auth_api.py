from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.contrib.auth.models import User
from ninja import Router, Schema
from ninja.security import django_auth
from django.http import HttpRequest, HttpResponse
from django.middleware.csrf import get_token
from typing import Optional

router = Router(auth=None)

class LoginSchema(Schema):
    username: str
    password: str

class UserSchema(Schema):
    id: int
    username: str
    email: str = ""
    is_staff: bool = False

@router.post("/login", auth=None, response={200: UserSchema, 401: dict})
def login(request: HttpRequest, data: LoginSchema):
    user = authenticate(request, username=data.username, password=data.password)
    if user is not None:
        django_login(request, user)
        return 200, user
    return 401, {"message": "Invalid credentials"}

@router.post("/logout", auth=django_auth)
def logout(request: HttpRequest):
    django_logout(request)
    return {"message": "Logged out"}

@router.get("/me", auth=django_auth, response={200: UserSchema, 401: dict})
def me(request: HttpRequest):
    if request.user.is_authenticated:
        return 200, request.user
    return 401, {"message": "Not authenticated"}


@router.get("/csrf", auth=None)
def csrf_token(request: HttpRequest):
    # Force generation of CSRF token cookie
    token = get_token(request)
    response = HttpResponse(status=204)
    response["X-CSRFToken"] = token
    return response
