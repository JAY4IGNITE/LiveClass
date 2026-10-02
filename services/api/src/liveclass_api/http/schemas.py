"""HTTP request/response DTOs (distinct from the WebSocket wire protocol)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from liveclass_api.core.models import SessionState, UserRole


class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    role: UserRole


class ClassCreate(BaseModel):
    name: str


class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instructor_id: uuid.UUID
    name: str
    created_at: datetime


class SessionCreate(BaseModel):
    class_id: uuid.UUID | None = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instructor_id: uuid.UUID
    class_id: uuid.UUID | None = None
    state: SessionState
    created_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None
