"""LiveClass IDE HTTP API and shared backend core.

This package also hosts the shared ``core`` (config, DB, models, security,
authz, logging) imported by the collaboration gateway. Dependency direction:
``liveclass_collab`` -> ``liveclass_api`` (core) -> ``liveclass_protocol``.
"""

__version__ = "0.0.0"
