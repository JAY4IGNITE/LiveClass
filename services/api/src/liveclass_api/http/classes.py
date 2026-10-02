"""Class management routes."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from liveclass_api.core.models import Class, UserRole
from liveclass_api.http.deps import CurrentUser, SessionDep
from liveclass_api.http.schemas import ClassCreate, ClassResponse

router = APIRouter(prefix="/classes", tags=["classes"])


@router.post("", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    body: ClassCreate, user: CurrentUser, session: SessionDep
) -> ClassResponse:
    if user.role is not UserRole.instructor:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only instructors can create classes")
    cls = Class(instructor_id=user.id, name=body.name)
    session.add(cls)
    await session.commit()
    await session.refresh(cls)
    return ClassResponse.model_validate(cls)


@router.get("", response_model=list[ClassResponse])
async def list_classes(user: CurrentUser, session: SessionDep) -> list[ClassResponse]:
    rows = (
        await session.execute(
            select(Class).where(Class.instructor_id == user.id).order_by(Class.created_at)
        )
    ).scalars().all()
    return [ClassResponse.model_validate(c) for c in rows]
