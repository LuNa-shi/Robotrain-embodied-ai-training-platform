from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated
from app.core.websocket_utils import add_websocket_connection,remove_websocket_connection

from app.core.deps import get_db


# 创建路由实例
router = APIRouter()

@router.websocket("/log_data/{task_id}")
async def send_log(websocket: WebSocket, task_id: int, db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    """
    WebSocket 端点，用于发送训练任务日志数据。
    
    **参数:**
    - `websocket`: WebSocket 连接对象。
    
    **响应:**
    - `200 OK`: 成功建立 WebSocket 连接。
    """
    async with websocket:
        
        await websocket.accept()
        add_websocket_connection(task_id, websocket)
    
        try:
            while True:
                message = await websocket.receive_text()
                print(f"Received message from task {task_id}: {message}")
        except WebSocketDisconnect:
            print(f"WebSocket connection closed for task {task_id}.")
            remove_websocket_connection(task_id, websocket)