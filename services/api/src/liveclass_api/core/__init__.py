"""Shared backend core: config, logging, DB, security, authz.

Imported by both the HTTP API and the collaboration gateway. Dependency
direction: ``liveclass_collab`` -> ``liveclass_api.core`` -> ``liveclass_protocol``.
"""
