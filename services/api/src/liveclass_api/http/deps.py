"""FastAPI dependencies: DB session + authenticated current user.

Identity comes from the verified JWT ``sub``; the user (and authoritative role)
is loaded from the database. The token's ``role`` claim is never used for authz.
"""

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from liveclass_api.core import authz
from liveclass_api.core.db import get_session
from liveclass_api.core.models import User
from liveclass_api.core.security import TokenError, decode_access_token

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = decode_access_token(token)
        user_id = uuid.UUID(str(claims["sub"]))
    except (TokenError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from None
    user = await authz.get_user(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
