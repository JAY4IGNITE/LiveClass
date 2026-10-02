"""LiveClass IDE WebSocket collaboration gateway + authoritative sequencer.

The gateway is an opaque sequencer/relay: it validates, authorizes, versions,
buffers, and fans out edits, but never interprets edit offsets (that lives only
in the IDE-independent ``sync-engine`` on clients).
"""

__version__ = "0.0.0"
