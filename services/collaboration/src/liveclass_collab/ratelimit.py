"""Per-connection token-bucket rate limiter (in-memory).

Bounds message rate on a single connection. Cross-connection per-user / per-IP
caps (review item M2) are a follow-up; this closes the single-socket flood path.
"""

import time


class TokenBucket:
    def __init__(self, rate_per_sec: float, capacity: float, now: float | None = None) -> None:
        self.rate = rate_per_sec
        self.capacity = capacity
        self.tokens = capacity
        self.updated = now if now is not None else time.monotonic()

    def allow(self, now: float | None = None) -> bool:
        current = now if now is not None else time.monotonic()
        elapsed = max(0.0, current - self.updated)
        self.updated = current
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False
