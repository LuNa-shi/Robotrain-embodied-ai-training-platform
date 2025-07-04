from typing import Dict, List
from fastapi import WebSocket
from app.models.train_log import TrainLog
from app.service.train_log import TrainLogService
from app.core.deps import get_db
from datetime import datetime

active_ws_connections: Dict[int, List[WebSocket]] = {}

async def add_websocket_connection(task_id: int, websocket: WebSocket):
    """
    添加 WebSocket 连接到指定的任务 ID。
    
    :param task_id: 任务 ID
    :param websocket: WebSocket 连接对象
    """
    global active_ws_connections
    # 如果任务 ID 不在字典中，则初始化一个空列表
    if task_id not in active_ws_connections:
        active_ws_connections[task_id] = []
    active_ws_connections[task_id].append(websocket)
    # 先把数据库中所有已有的log给发到websocket上
    train_log_service = TrainLogService(get_db())
    logs = await train_log_service.get_train_logs_by_task_id(task_id)
    for log in logs:
        log_message = f"{log.log_time.isoformat()} - {log.log_message}"
        try:
            await websocket.send_text(log_message)
        except Exception as e:
            print(f"Error sending initial log message to WebSocket: {e}")
    

async def remove_websocket_connection(task_id: int, websocket: WebSocket):
    """
    从指定的任务 ID 中移除 WebSocket 连接。
    
    :param task_id: 任务 ID
    :param websocket: WebSocket 连接对象
    """
    global active_ws_connections
    if task_id in active_ws_connections:
        active_ws_connections[task_id].remove(websocket)
        # 如果列表为空，则删除该任务 ID 的条目
        if not active_ws_connections[task_id]:
            del active_ws_connections[task_id]

async def send_log_to_websockets(task_id: int, log_message: str):
    """
    向指定任务 ID 的所有 WebSocket 连接发送日志消息。
    
    :param task_id: 任务 ID
    :param log_message: 日志消息内容
    """
    global active_ws_connections
    if task_id in active_ws_connections:
        for websocket in active_ws_connections[task_id]:
            try:
                await websocket.send_text(log_message)
                print(f"Sent message to WebSocket for task {task_id}: {log_message}")
            except Exception as e:
                print(f"Error sending message to WebSocket: {e}")