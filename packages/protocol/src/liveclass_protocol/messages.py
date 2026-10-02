"""Hand-written protocol surface (NOT generated).

Builds the discriminated-union parser over the generated per-message models and
exposes the protocol version constant. Kept separate from the generated
``models.py`` so it is excluded from the codegen drift gate.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import Field, TypeAdapter

from . import models as m

#: Wire protocol version. Must match ``ProtocolVersion`` const in the schema.
PROTOCOL_VERSION = "1.0"

#: Discriminated union of every message, keyed on the ``type`` field. Validation
#: is O(1) in the number of message types and yields precise errors.
AnyMessage = Annotated[
    (
        m.Connect
        | m.ConnectAck
        | m.Join
        | m.Welcome
        | m.DocChange
        | m.Ack
        | m.DocUpdate
        | m.ResyncRequest
        | m.Snapshot
        | m.PresenceUpdate
        | m.Ping
        | m.Pong
        | m.SessionClosed
        | m.Error
        | m.Checkpoint
    ),
    Field(discriminator="type"),
]

_adapter: TypeAdapter = TypeAdapter(AnyMessage)


def parse_message(data: bytes | str | dict) -> m.Envelope:
    """Validate and parse an inbound message.

    Accepts a raw JSON ``bytes``/``str`` or an already-decoded ``dict``. Raises
    ``pydantic.ValidationError`` on malformed input — callers map that to the
    ``INVALID_MESSAGE`` protocol error.
    """
    if isinstance(data, (bytes, bytearray, str)):
        return _adapter.validate_json(data)
    return _adapter.validate_python(data)


def serialize(message: m.Envelope) -> str:
    """Serialize an outbound message model to a compact JSON string.

    ``exclude_none`` keeps optional-but-absent fields (e.g. ``sessionId``) off
    the wire so output matches the schema's optionality.
    """
    return message.model_dump_json(exclude_none=True)
