from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated
from app.core.websocket_utils import add_websocket_connection,remove_websocket_connection,add_eval_websocket_connection, remove_eval_websocket_connection

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
    await websocket.accept()
    await add_websocket_connection(task_id, websocket)

    try:
        while True:
            message = await websocket.receive_text()
            print(f"Received message from task {task_id}: {message}")
    except WebSocketDisconnect:
            print(f"WebSocket connection closed for task {task_id}.")
    finally:
            await remove_websocket_connection(task_id, websocket)

@router.websocket("/eval_status/{eval_task_id}")
async def send_eval_status(websocket: WebSocket, eval_task_id: int, db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    """
    WebSocket 端点，用于发送评估任务状态数据。
    
    **参数:**
    - `websocket`: WebSocket 连接对象。
    
    **响应:**
    - `200 OK`: 成功建立 WebSocket 连接。
    """
    await websocket.accept()
    await add_eval_websocket_connection(eval_task_id, websocket)

    try:
        while True:
            message = await websocket.receive_text()
            print(f"Received message from eval task {eval_task_id}: {message}")
    except WebSocketDisconnect:
            print(f"WebSocket connection closed for eval task {eval_task_id}.")
    finally:
            await remove_eval_websocket_connection(eval_task_id, websocket)