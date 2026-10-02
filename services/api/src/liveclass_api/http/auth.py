"""Authentication routes."""

from fastapi import APIRouter, HTTPException, status

from liveclass_api.core import authz
from liveclass_api.core.security import create_access_token
from liveclass_api.http.deps import SessionDep
from liveclass_api.http.schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: SessionDep) -> TokenResponse:
    user = await authz.authenticate(session, body.username, body.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, user_id=user.id, role=user.role)
