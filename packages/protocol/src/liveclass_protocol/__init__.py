"""LiveClass IDE wire protocol.

The JSON Schemas under ``packages/protocol/schemas`` are the single source of
truth. Pydantic models in ``models.py`` are **generated** from those schemas in
Step 2 (do not hand-edit generated files).
"""

__version__ = "0.0.0"

from liveclass_protocol import models
from liveclass_protocol.messages import (
    PROTOCOL_VERSION,
    AnyMessage,
    parse_message,
    serialize,
)

__all__ = [
    "PROTOCOL_VERSION",
    "AnyMessage",
    "models",
    "parse_message",
    "serialize",
]
