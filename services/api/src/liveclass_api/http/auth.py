"""Authentication routes."""

from fastapi import APIRouter, HTTPException, status

from liveclass_api.core import authz
from liveclass_api.core.security import create_access_token
from liveclass_api.http.deps import SessionDep
from liveclass_api.http.schemas import LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: SessionDep) -> TokenResponse:
    user = await authz.authenticate(session, body.username, body.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, user_id=user.id, role=user.role)

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session: SessionDep) -> TokenResponse:
    from liveclass_api.core.models import User
    from liveclass_api.core.security import hash_password
    from sqlalchemy import select
    
    existing = (await session.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
        
    user = User(username=body.username, password_hash=hash_password(body.password), role=body.role)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, user_id=user.id, role=user.role)
