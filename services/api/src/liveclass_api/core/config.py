"""Application configuration (12-factor: environment variables / ``.env``)."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+asyncpg://liveclass:liveclass@127.0.0.1:5433/liveclass"
    redis_url: str = "redis://127.0.0.1:6380/0"

    jwt_secret: str = "dev-only-change-me-please-set-a-real-32B+-secret"
    jwt_issuer: str = "liveclass"
    jwt_audience: str = "liveclass-clients"
    jwt_expires_seconds: int = 604800

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    protocol_version: str = "1.0"

    # Collaboration tunables. Invariant D6: snapshot_interval < op_buffer_window
    # keeps the latest snapshot inside the Redis op buffer, so recovery is always
    # possible (replay, or snapshot + tail).
    op_buffer_window: int = 512
    snapshot_interval: int = 128
    ws_max_msg_bytes: int = 262144
    ws_msgs_per_sec: int = 50
    ws_heartbeat_interval_ms: int = 15000

    @model_validator(mode="after")
    def _check_recovery_invariant(self) -> "Settings":
        if self.snapshot_interval >= self.op_buffer_window:
            raise ValueError(
                "snapshot_interval must be < op_buffer_window (recovery invariant D6)"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
