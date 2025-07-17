from typing import List, Optional
import unittest
from fastapi.testclient import TestClient
from fastapi import Response, status, WebSocket, WebSocketDisconnect
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, ANY # 导入 ANY
from datetime import datetime, timezone, timedelta
import json

# 关键修正：将 FastAPI 应用程序实例导入为 main_fastapi_app
from app.main import app as main_fastapi_app
from app.core.deps import get_db

# IMPORTANT: 导入 websocket 路由模块，因为我们要打补丁到它内部的引用
from app.api.endpoints import websocket as websocket_api_endpoints 

# --- Pytest Fixtures ---

@pytest.fixture(scope="session")
def fastapi_app_instance():
    """提供 FastAPI 应用程序实例。"""
    yield main_fastapi_app

@pytest.fixture(scope="session", autouse=True)
def override_get_db_dependency(fastapi_app_instance): # 依赖于 fastapi_app_instance
    """覆盖 FastAPI 的 get_db 依赖项，返回一个模拟的 AsyncSession。"""
    mock_session = unittest.mock.MagicMock(spec=Optional[object])
    async def _override_get_db():
        yield mock_session
    # 关键修正：使用传入的 fastapi_app_instance
    fastapi_app_instance.dependency_overrides[get_db] = _override_get_db
    yield mock_session

@pytest.fixture(scope="module")
def client(fastapi_app_instance): # 依赖于 fastapi_app_instance
    """
    Pytest fixture for the FastAPI TestClient.
    此客户端用于在测试期间向 FastAPI 应用程序发出请求。
    """
    # 关键修正：使用传入的 fastapi_app_instance 初始化 TestClient
    return TestClient(fastapi_app_instance)

@pytest.fixture(scope="module", autouse=True) # 作用域改为 module，并自动应用
def mock_websocket_utils():
    """
    自动应用此 fixture，模拟 app.core.websocket_utils 中的函数。
    使用 unittest.mock.patch 进行模块级模拟，确保在 FastAPI 应用加载前生效。
    """
    # 关键修正：打补丁到函数被导入的模块 (app.api.endpoints.websocket)
    patch_add = patch('app.api.endpoints.websocket.add_websocket_connection', new_callable=AsyncMock)
    patch_remove = patch('app.api.endpoints.websocket.remove_websocket_connection', new_callable=AsyncMock)
    patch_add_eval = patch('app.api.endpoints.websocket.add_eval_websocket_connection', new_callable=AsyncMock)
    patch_remove_eval = patch('app.api.endpoints.websocket.remove_eval_websocket_connection', new_callable=AsyncMock)

    # 启动补丁
    mock_add_connection = patch_add.start()
    mock_remove_connection = patch_remove.start()
    mock_add_eval_connection = patch_add_eval.start()
    mock_remove_eval_connection = patch_remove_eval.start()

    yield {
        "add_websocket_connection": mock_add_connection,
        "remove_websocket_connection": mock_remove_connection,
        "add_eval_websocket_connection": mock_add_eval_connection,
        "remove_eval_websocket_connection": mock_remove_eval_connection,
    }

    # 停止补丁
    patch_add.stop()
    patch_remove.stop()
    patch_add_eval.stop()
    patch_remove_eval.stop()


# --- Test Cases for /log_data/{task_id} ---

@pytest.mark.asyncio
async def test_send_log_websocket_connection(client: TestClient, mock_websocket_utils: dict):
    """测试 WebSocket 连接 /log_data/{task_id} 是否成功建立。"""
    task_id = 123
    with client.websocket_connect(f"/api/websocket/log_data/{task_id}") as websocket:
        # 连接成功，断言 add_websocket_connection 被调用
        mock_websocket_utils["add_websocket_connection"].assert_called_with(task_id, ANY) # 更改为 ANY
        mock_websocket_utils["remove_websocket_connection"].assert_not_called() # 此时不应被调用

    # 连接断开后，断言 remove_websocket_connection 被调用
    mock_websocket_utils["remove_websocket_connection"].assert_called_with(task_id, ANY) # 更改为 ANY

@pytest.mark.asyncio
async def test_send_log_websocket_receive_message(client: TestClient, mock_websocket_utils: dict):
    """测试 WebSocket /log_data/{task_id} 是否能接收消息。"""
    task_id = 456
    test_message = "Hello, log data!"
    with client.websocket_connect(f"/api/websocket/log_data/{task_id}") as websocket:
        # 发送消息
        websocket.send_text(test_message)
        # 由于服务器端只是打印消息，我们无法直接在测试中捕获打印输出。
        # 但我们可以验证连接是否保持活跃。
        pass # 仅测试发送，不测试接收回显

    mock_websocket_utils["add_websocket_connection"].assert_called_with(task_id, ANY) # 更改为 ANY
    mock_websocket_utils["remove_websocket_connection"].assert_called_with(task_id, ANY) # 更改为 ANY

@pytest.mark.asyncio
async def test_send_log_websocket_disconnect(client: TestClient, mock_websocket_utils: dict):
    """测试 WebSocket /log_data/{task_id} 断开连接时的处理。"""
    task_id = 789
    with client.websocket_connect(f"/api/websocket/log_data/{task_id}") as websocket:
        # 模拟断开连接 (离开 with 块会自动断开)
        pass

    mock_websocket_utils["add_websocket_connection"].assert_called_with(task_id, ANY) # 更改为 ANY
    mock_websocket_utils["remove_websocket_connection"].assert_called_with(task_id, ANY) # 更改为 ANY


# --- Test Cases for /eval_status/{eval_task_id} ---

@pytest.mark.asyncio
async def test_send_eval_status_websocket_connection(client: TestClient, mock_websocket_utils: dict):
    """测试 WebSocket 连接 /eval_status/{eval_task_id} 是否成功建立。"""
    eval_task_id = 101
    with client.websocket_connect(f"/api/websocket/eval_status/{eval_task_id}") as websocket:
        # 连接成功，断言 add_eval_websocket_connection 被调用
        mock_websocket_utils["add_eval_websocket_connection"].assert_called_with(eval_task_id, ANY) # 更改为 ANY
        mock_websocket_utils["remove_eval_websocket_connection"].assert_not_called() # 此时不应被调用

    # 连接断开后，断言 remove_eval_websocket_connection 被调用
    mock_websocket_utils["remove_eval_websocket_connection"].assert_called_with(eval_task_id, ANY) # 更改为 ANY

@pytest.mark.asyncio
async def test_send_eval_status_websocket_receive_message(client: TestClient, mock_websocket_utils: dict):
    """测试 WebSocket /eval_status/{eval_task_id} 是否能接收消息。"""
    eval_task_id = 202
    test_message = "Eval status update!"
    with client.websocket_connect(f"/api/websocket/eval_status/{eval_task_id}") as websocket:
        # 发送消息
        websocket.send_text(test_message)
        pass # 仅测试发送

    mock_websocket_utils["add_eval_websocket_connection"].assert_called_with(eval_task_id, ANY) # 更改为 ANY
    mock_websocket_utils["remove_eval_websocket_connection"].assert_called_with(eval_task_id, ANY) # 更改为 ANY

@pytest.mark.asyncio
async def test_send_eval_status_websocket_disconnect(client: TestClient, mock_websocket_utils: dict):
    """测试 WebSocket /eval_status/{eval_task_id} 断开连接时的处理。"""
    eval_task_id = 303
    with client.websocket_connect(f"/api/websocket/eval_status/{eval_task_id}") as websocket:
        # 模拟断开连接 (离开 with 块会自动断开)
        pass

    mock_websocket_utils["add_eval_websocket_connection"].assert_called_with(eval_task_id, ANY) # 更改为 ANY
    mock_websocket_utils["remove_eval_websocket_connection"].assert_called_with(eval_task_id, ANY) # 更改为 ANY