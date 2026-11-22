"""WebSocket hub: every open board page subscribes to its board and gets change events."""
from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class BoardHub:
    def __init__(self) -> None:
        # All access happens on the event loop thread, so no lock is needed.
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, board_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[board_id].add(ws)

    def disconnect(self, board_id: int, ws: WebSocket) -> None:
        room = self.rooms.get(board_id)
        if room is not None:
            room.discard(ws)
            if not room:
                self.rooms.pop(board_id, None)

    async def broadcast(self, board_id: int, payload: dict) -> None:
        sockets = list(self.rooms.get(board_id, ()))
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:  # client went away
                dead.append(ws)
        for ws in dead:
            self.disconnect(board_id, ws)


hub = BoardHub()
