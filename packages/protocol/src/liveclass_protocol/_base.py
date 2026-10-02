"""Hand-written base for the generated protocol models (NOT generated).

Every generated message model inherits this, so unknown fields are rejected —
the Pydantic realization of the schema's ``unevaluatedProperties: false``. This
file is stable and intentionally excluded from the codegen drift gate.
"""

from pydantic import BaseModel, ConfigDict


class StrictBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
