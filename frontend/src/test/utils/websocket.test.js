// Mock config module before importing
vi.mock('@/config/api', () => ({
  getApiConfig: vi.fn().mockReturnValue({
    baseURL: 'http://localhost:8000'
  }),
  API_ENDPOINTS: {}
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import trainingLogWebSocket from '@/utils/websocket';
import { setupLocalStorageMock, clearAllMocks } from './testUtils';

let mockWebSocket;

global.WebSocket = vi.fn().mockImplementation(() => {
  mockWebSocket = {
    readyState: 0, // CONNECTING
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn()
  };
  return mockWebSocket;
});

global.WebSocket.CONNECTING = 0;
global.WebSocket.OPEN = 1;
global.WebSocket.CLOSING = 2;
global.WebSocket.CLOSED = 3;

describe('TrainingLogWebSocket', () => {
  beforeEach(() => {
    setupLocalStorageMock();
    clearAllMocks();
    trainingLogWebSocket.ws = null;
    trainingLogWebSocket.taskId = null;
    trainingLogWebSocket.reconnectAttempts = 0;
    // Reset global WebSocket mock
    global.WebSocket.mockClear();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('connect', () => {
    it('应该成功创建WebSocket连接', () => {
      const taskId = 'task123';
      trainingLogWebSocket.connect(taskId);
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:8000/api/websocket/log_data/task123');
      expect(trainingLogWebSocket.taskId).toBe(taskId);
    });

    it('应该使用HTTPS URL创建WSS连接', async () => {
      // 重新mock getApiConfig
      const configApi = await import('@/config/api');
      configApi.getApiConfig.mockReturnValue({ baseURL: 'https://localhost:8000' });
      trainingLogWebSocket.ws = null;
      trainingLogWebSocket.connect('task123');
      expect(global.WebSocket).toHaveBeenCalledWith('wss://localhost:8000/api/websocket/log_data/task123');
    });

    it('如果WebSocket已连接，应该不重复连接', () => {
      mockWebSocket.readyState = 1; // OPEN
      trainingLogWebSocket.ws = mockWebSocket;
      trainingLogWebSocket.connect('task123');
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it('应该设置WebSocket事件处理器', () => {
      trainingLogWebSocket.connect('task123');
      expect(mockWebSocket.onopen).toBeDefined();
      expect(mockWebSocket.onmessage).toBeDefined();
      expect(mockWebSocket.onerror).toBeDefined();
      expect(mockWebSocket.onclose).toBeDefined();
    });
  });

  describe('WebSocket事件处理', () => {
    beforeEach(() => {
      trainingLogWebSocket.connect('task123');
    });

    it('应该处理连接成功事件', () => {
      const onOpenCallback = vi.fn();
      trainingLogWebSocket.onOpen(onOpenCallback);
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      expect(onOpenCallback).toHaveBeenCalledWith({ type: 'open' });
      expect(trainingLogWebSocket.reconnectAttempts).toBe(0);
    });

    it('应该处理消息事件', () => {
      const onMessageCallback = vi.fn();
      trainingLogWebSocket.onMessage(onMessageCallback);
      if (mockWebSocket.onmessage) mockWebSocket.onmessage({ data: 'test message' });
      expect(onMessageCallback).toHaveBeenCalledWith('test message');
    });

    it('应该处理错误事件', () => {
      const onErrorCallback = vi.fn();
      trainingLogWebSocket.onError(onErrorCallback);
      if (mockWebSocket.onerror) mockWebSocket.onerror(new Error('WebSocket error'));
      expect(onErrorCallback).toHaveBeenCalledWith(new Error('WebSocket error'));
    });

    it('应该处理连接关闭事件', () => {
      const onCloseCallback = vi.fn();
      trainingLogWebSocket.onClose(onCloseCallback);
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1000, reason: 'Normal closure' });
      expect(onCloseCallback).toHaveBeenCalledWith({ code: 1000, reason: 'Normal closure' });
    });

    it('应该处理异常关闭并尝试重连', () => {
      vi.useFakeTimers();
      const onCloseCallback = vi.fn();
      trainingLogWebSocket.onClose(onCloseCallback);
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1006, reason: 'Abnormal closure' });
      vi.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('应该限制重连次数', () => {
      vi.useFakeTimers();
      trainingLogWebSocket.maxReconnectAttempts = 2;
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1006, reason: 'Abnormal closure' });
      vi.advanceTimersByTime(3000);
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1006, reason: 'Abnormal closure' });
      vi.advanceTimersByTime(6000);
      // 第三次重连不会发生
      expect(global.WebSocket).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });
  });

  describe('send', () => {
    it('应该成功发送消息', () => {
      mockWebSocket.readyState = 1; // OPEN
      trainingLogWebSocket.ws = mockWebSocket;
      trainingLogWebSocket.send('test message');
      expect(mockWebSocket.send).toHaveBeenCalledWith('test message');
    });

    it('当WebSocket未连接时应该警告', () => {
      mockWebSocket.readyState = 3; // CLOSED
      trainingLogWebSocket.ws = mockWebSocket;
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      trainingLogWebSocket.send('test message');
      expect(consoleSpy).toHaveBeenCalledWith('训练日志WebSocket未连接，无法发送消息');
      expect(mockWebSocket.send).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('disconnect', () => {
    it('应该正常关闭WebSocket连接', () => {
      trainingLogWebSocket.ws = mockWebSocket;
      trainingLogWebSocket.disconnect();
      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, '正常关闭');
      expect(trainingLogWebSocket.ws).toBeNull();
      expect(trainingLogWebSocket.taskId).toBeNull();
    });

    it('应该清除所有回调函数', () => {
      trainingLogWebSocket.onMessage(() => {});
      trainingLogWebSocket.onError(() => {});
      trainingLogWebSocket.onClose(() => {});
      trainingLogWebSocket.onOpen(() => {});
      trainingLogWebSocket.disconnect();
      expect(trainingLogWebSocket.onMessageCallback).toBeNull();
      expect(trainingLogWebSocket.onErrorCallback).toBeNull();
      expect(trainingLogWebSocket.onCloseCallback).toBeNull();
      expect(trainingLogWebSocket.onOpenCallback).toBeNull();
    });
  });

  describe('心跳检测', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('应该启动心跳检测', () => {
      trainingLogWebSocket.connect('task123');
      mockWebSocket.readyState = 1; // OPEN
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).toHaveBeenCalledWith('ping');
    });
    it('应该停止心跳检测', () => {
      trainingLogWebSocket.connect('task123');
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      trainingLogWebSocket.disconnect();
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
    it('当WebSocket关闭时应该停止心跳', () => {
      trainingLogWebSocket.connect('task123');
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1000, reason: 'Normal closure' });
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('应该尝试重连', () => {
      vi.useFakeTimers();
      trainingLogWebSocket.taskId = 'task123';
      trainingLogWebSocket.reconnect();
      expect(trainingLogWebSocket.reconnectAttempts).toBe(1);
      vi.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(1); // 只有一次重连调用
      vi.useRealTimers();
    });
    it('没有taskId时不应该重连', () => {
      vi.useFakeTimers();
      trainingLogWebSocket.taskId = null;
      trainingLogWebSocket.reconnect();
      vi.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(0);
      vi.useRealTimers();
    });
    it('重连间隔应该递增', () => {
      vi.useFakeTimers();
      trainingLogWebSocket.taskId = 'task123';
      trainingLogWebSocket.reconnect();
      vi.advanceTimersByTime(3000);
      trainingLogWebSocket.reconnect();
      vi.advanceTimersByTime(6000);
      expect(global.WebSocket).toHaveBeenCalledTimes(2); // 两次重连调用
      vi.useRealTimers();
    });
  });

  describe('状态检查', () => {
    it('应该正确返回连接状态', () => {
      trainingLogWebSocket.ws = null;
      expect(trainingLogWebSocket.getStatus()).toBe('disconnected');
      trainingLogWebSocket.connect('task123');
      mockWebSocket.readyState = 0; // CONNECTING
      expect(trainingLogWebSocket.getStatus()).toBe('connecting');
      mockWebSocket.readyState = 1; // OPEN
      expect(trainingLogWebSocket.getStatus()).toBe('connected');
      mockWebSocket.readyState = 2; // CLOSING
      expect(trainingLogWebSocket.getStatus()).toBe('closing');
      mockWebSocket.readyState = 3; // CLOSED
      expect(trainingLogWebSocket.getStatus()).toBe('closed');
    });
    it('应该正确检查是否已连接', () => {
      trainingLogWebSocket.ws = null;
      expect(trainingLogWebSocket.isConnected()).toBeFalsy();
      trainingLogWebSocket.connect('task123');
      mockWebSocket.readyState = 1; // OPEN
      expect(trainingLogWebSocket.isConnected()).toBe(true);
      mockWebSocket.readyState = 3; // CLOSED
      expect(trainingLogWebSocket.isConnected()).toBe(false);
    });
  });

  describe('回调函数设置', () => {
    it('应该正确设置回调函数', () => {
      const messageCallback = vi.fn();
      const errorCallback = vi.fn();
      const closeCallback = vi.fn();
      const openCallback = vi.fn();
      trainingLogWebSocket.onMessage(messageCallback);
      trainingLogWebSocket.onError(errorCallback);
      trainingLogWebSocket.onClose(closeCallback);
      trainingLogWebSocket.onOpen(openCallback);
      expect(trainingLogWebSocket.onMessageCallback).toBe(messageCallback);
      expect(trainingLogWebSocket.onErrorCallback).toBe(errorCallback);
      expect(trainingLogWebSocket.onCloseCallback).toBe(closeCallback);
      expect(trainingLogWebSocket.onOpenCallback).toBe(openCallback);
    });
    it('应该清除所有回调函数', () => {
      trainingLogWebSocket.onMessage(() => {});
      trainingLogWebSocket.onError(() => {});
      trainingLogWebSocket.onClose(() => {});
      trainingLogWebSocket.onOpen(() => {});
      trainingLogWebSocket.clearCallbacks();
      expect(trainingLogWebSocket.onMessageCallback).toBeNull();
      expect(trainingLogWebSocket.onErrorCallback).toBeNull();
      expect(trainingLogWebSocket.onCloseCallback).toBeNull();
      expect(trainingLogWebSocket.onOpenCallback).toBeNull();
    });
  });

  describe('错误处理', () => {
    it('应该处理WebSocket创建失败', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn();
      global.WebSocket.mockImplementationOnce(() => { throw new Error('WebSocket creation failed'); });
      trainingLogWebSocket.onError(errorCallback);
      trainingLogWebSocket.connect('task123');
      expect(consoleSpy).toHaveBeenCalledWith('创建训练日志WebSocket连接失败:', expect.any(Error));
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
      consoleSpy.mockRestore();
    });
    it('应该处理消息解析错误', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      trainingLogWebSocket.connect('task123');
      // 让onMessageCallback抛出异常
      trainingLogWebSocket.onMessage(() => { throw new Error('parse error'); });
      if (mockWebSocket.onmessage) mockWebSocket.onmessage({ data: 'invalid json' });
      expect(consoleSpy).toHaveBeenCalledWith('处理训练日志消息时出错:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
}); 