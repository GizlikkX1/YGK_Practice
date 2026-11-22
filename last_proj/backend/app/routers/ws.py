from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import services as S
from ..database import SessionLocal
from ..models import User
from ..realtime import hub

router = APIRouter()


@router.websocket("/ws/boards/{board_id}")
async def board_updates(ws: WebSocket, board_id: int, user_id: int):
    """Live updates of a board. The client re-fetches the board when an event arrives."""
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        board = S.get_board(db, board_id) if user else None
        allowed = bool(user and S.membership(db, board, user))
    except Exception:
        allowed = False
    finally:
        db.close()
    if not allowed:
        await ws.close(code=4403)
        return
    await hub.connect(board_id, ws)
    try:
        while True:
            message = await ws.receive_text()
            if message == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(board_id, ws)
