"""Password hashing (bcrypt) and JWT issue/verify (PyJWT, HS256).

The JWT carries identity (``sub``) and a convenience ``role`` claim, but every
authorization decision re-resolves role/membership from the database — the token
claim is never trusted for authz.
"""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from liveclass_api.core.config import Settings, get_settings

_MAX_BCRYPT_BYTES = 72


class TokenError(Exception):
    """Raised when a JWT fails signature/claim verification."""


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:_MAX_BCRYPT_BYTES], bcrypt.gensalt()).decode(
        "utf-8"
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:_MAX_BCRYPT_BYTES], password_hash.encode("utf-8")
        )
    except ValueError:
        return False


def create_access_token(*, subject: str, role: str, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    now = datetime.now(tz=UTC)
    payload = {
        "sub": subject,
        "role": role,
        "iss": s.jwt_issuer,
        "aud": s.jwt_audience,
        "iat": now,
        "exp": now + timedelta(seconds=s.jwt_expires_seconds),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_access_token(token: str, settings: Settings | None = None) -> dict:
    s = settings or get_settings()
    try:
        return jwt.decode(
            token,
            s.jwt_secret,
            algorithms=["HS256"],
            issuer=s.jwt_issuer,
            audience=s.jwt_audience,
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
