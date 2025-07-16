// Mock config module before importing
vi.mock('@/config/api', () => ({
  getApiConfig: vi.fn().mockReturnValue({
    baseURL: 'http://localhost:8000'
  }),
  API_ENDPOINTS: {}
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import evaluationStatusWebSocket from '@/utils/evalWebSocket';
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

describe('EvaluationStatusWebSocket', () => {
  beforeEach(() => {
    setupLocalStorageMock();
    clearAllMocks();
    evaluationStatusWebSocket.ws = null;
    evaluationStatusWebSocket.evalTaskId = null;
    evaluationStatusWebSocket.reconnectAttempts = 0;
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
      const evalTaskId = 'eval123';
      evaluationStatusWebSocket.connect(evalTaskId);
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:8000/api/websocket/eval_status/eval123');
      expect(evaluationStatusWebSocket.evalTaskId).toBe(evalTaskId);
    });

    it('应该使用HTTPS URL创建WSS连接', async () => {
      // 重新mock getApiConfig
      const configApi = await import('@/config/api');
      configApi.getApiConfig.mockReturnValue({ baseURL: 'https://localhost:8000' });
      evaluationStatusWebSocket.ws = null;
      evaluationStatusWebSocket.connect('eval123');
      expect(global.WebSocket).toHaveBeenCalledWith('wss://localhost:8000/api/websocket/eval_status/eval123');
    });

    it('如果WebSocket已连接，应该不重复连接', () => {
      mockWebSocket.readyState = 1; // OPEN
      evaluationStatusWebSocket.ws = mockWebSocket;
      evaluationStatusWebSocket.connect('eval123');
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it('应该设置WebSocket事件处理器', () => {
      evaluationStatusWebSocket.connect('eval123');
      expect(mockWebSocket.onopen).toBeDefined();
      expect(mockWebSocket.onmessage).toBeDefined();
      expect(mockWebSocket.onerror).toBeDefined();
      expect(mockWebSocket.onclose).toBeDefined();
    });
  });

  describe('WebSocket事件处理', () => {
    beforeEach(() => {
      evaluationStatusWebSocket.connect('eval123');
    });

    it('应该处理连接成功事件', () => {
      const onOpenCallback = vi.fn();
      evaluationStatusWebSocket.onOpen(onOpenCallback);
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      expect(onOpenCallback).toHaveBeenCalledWith({ type: 'open' });
      expect(evaluationStatusWebSocket.reconnectAttempts).toBe(0);
    });

    it('应该处理消息事件', () => {
      const onMessageCallback = vi.fn();
      evaluationStatusWebSocket.onMessage(onMessageCallback);
      if (mockWebSocket.onmessage) mockWebSocket.onmessage({ data: 'test message' });
      expect(onMessageCallback).toHaveBeenCalledWith('test message');
    });

    it('应该处理错误事件', () => {
      const onErrorCallback = vi.fn();
      evaluationStatusWebSocket.onError(onErrorCallback);
      if (mockWebSocket.onerror) mockWebSocket.onerror(new Error('WebSocket error'));
      expect(onErrorCallback).toHaveBeenCalledWith(new Error('WebSocket error'));
    });

    it('应该处理连接关闭事件', () => {
      const onCloseCallback = vi.fn();
      evaluationStatusWebSocket.onClose(onCloseCallback);
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1000, reason: 'Normal closure' });
      expect(onCloseCallback).toHaveBeenCalledWith({ code: 1000, reason: 'Normal closure' });
    });

    it('应该处理异常关闭并尝试重连', () => {
      vi.useFakeTimers();
      const onCloseCallback = vi.fn();
      evaluationStatusWebSocket.onClose(onCloseCallback);
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1006, reason: 'Abnormal closure' });
      vi.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('应该限制重连次数', () => {
      vi.useFakeTimers();
      evaluationStatusWebSocket.maxReconnectAttempts = 2;
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
      evaluationStatusWebSocket.ws = mockWebSocket;
      evaluationStatusWebSocket.send('test message');
      expect(mockWebSocket.send).toHaveBeenCalledWith('test message');
    });

    it('当WebSocket未连接时应该警告', () => {
      mockWebSocket.readyState = 3; // CLOSED
      evaluationStatusWebSocket.ws = mockWebSocket;
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      evaluationStatusWebSocket.send('test message');
      expect(consoleSpy).toHaveBeenCalledWith('评估状态WebSocket未连接，无法发送消息');
      expect(mockWebSocket.send).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('disconnect', () => {
    it('应该正常关闭WebSocket连接', () => {
      evaluationStatusWebSocket.ws = mockWebSocket;
      evaluationStatusWebSocket.disconnect();
      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, '正常关闭');
      expect(evaluationStatusWebSocket.ws).toBeNull();
      expect(evaluationStatusWebSocket.evalTaskId).toBeNull();
    });

    it('应该清除所有回调函数', () => {
      evaluationStatusWebSocket.onMessage(() => {});
      evaluationStatusWebSocket.onError(() => {});
      evaluationStatusWebSocket.onClose(() => {});
      evaluationStatusWebSocket.onOpen(() => {});
      evaluationStatusWebSocket.disconnect();
      expect(evaluationStatusWebSocket.onMessageCallback).toBeNull();
      expect(evaluationStatusWebSocket.onErrorCallback).toBeNull();
      expect(evaluationStatusWebSocket.onCloseCallback).toBeNull();
      expect(evaluationStatusWebSocket.onOpenCallback).toBeNull();
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
      evaluationStatusWebSocket.connect('eval123');
      mockWebSocket.readyState = 1; // OPEN
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).toHaveBeenCalledWith('ping');
    });
    it('应该停止心跳检测', () => {
      evaluationStatusWebSocket.connect('eval123');
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      evaluationStatusWebSocket.disconnect();
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
    it('当WebSocket关闭时应该停止心跳', () => {
      evaluationStatusWebSocket.connect('eval123');
      if (mockWebSocket.onopen) mockWebSocket.onopen({ type: 'open' });
      if (mockWebSocket.onclose) mockWebSocket.onclose({ code: 1000, reason: 'Normal closure' });
      vi.advanceTimersByTime(30000);
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('应该尝试重连', () => {
      vi.useFakeTimers();
      evaluationStatusWebSocket.evalTaskId = 'eval123';
      evaluationStatusWebSocket.reconnect();
      expect(evaluationStatusWebSocket.reconnectAttempts).toBe(1);
      vi.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(1); // 只有一次重连调用
      vi.useRealTimers();
    });
    it('没有evalTaskId时不应该重连', () => {
      vi.useFakeTimers();
      evaluationStatusWebSocket.evalTaskId = null;
      evaluationStatusWebSocket.reconnect();
      vi.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(0);
      vi.useRealTimers();
    });
    it('重连间隔应该递增', () => {
      vi.useFakeTimers();
      evaluationStatusWebSocket.evalTaskId = 'eval123';
      evaluationStatusWebSocket.reconnect();
      vi.advanceTimersByTime(3000);
      evaluationStatusWebSocket.reconnect();
      vi.advanceTimersByTime(6000);
      expect(global.WebSocket).toHaveBeenCalledTimes(2); // 两次重连调用
      vi.useRealTimers();
    });
  });

  describe('状态检查', () => {
    it('应该正确返回连接状态', () => {
      evaluationStatusWebSocket.ws = null;
      expect(evaluationStatusWebSocket.getStatus()).toBe('disconnected');
      evaluationStatusWebSocket.connect('eval123');
      mockWebSocket.readyState = 0; // CONNECTING
      expect(evaluationStatusWebSocket.getStatus()).toBe('connecting');
      mockWebSocket.readyState = 1; // OPEN
      expect(evaluationStatusWebSocket.getStatus()).toBe('connected');
      mockWebSocket.readyState = 2; // CLOSING
      expect(evaluationStatusWebSocket.getStatus()).toBe('closing');
      mockWebSocket.readyState = 3; // CLOSED
      expect(evaluationStatusWebSocket.getStatus()).toBe('closed');
    });
    it('应该正确检查是否已连接', () => {
      evaluationStatusWebSocket.ws = null;
      expect(evaluationStatusWebSocket.isConnected()).toBeFalsy();
      evaluationStatusWebSocket.connect('eval123');
      mockWebSocket.readyState = 1; // OPEN
      expect(evaluationStatusWebSocket.isConnected()).toBe(true);
      mockWebSocket.readyState = 3; // CLOSED
      expect(evaluationStatusWebSocket.isConnected()).toBe(false);
    });
  });

  describe('回调函数设置', () => {
    it('应该正确设置回调函数', () => {
      const messageCallback = vi.fn();
      const errorCallback = vi.fn();
      const closeCallback = vi.fn();
      const openCallback = vi.fn();
      evaluationStatusWebSocket.onMessage(messageCallback);
      evaluationStatusWebSocket.onError(errorCallback);
      evaluationStatusWebSocket.onClose(closeCallback);
      evaluationStatusWebSocket.onOpen(openCallback);
      expect(evaluationStatusWebSocket.onMessageCallback).toBe(messageCallback);
      expect(evaluationStatusWebSocket.onErrorCallback).toBe(errorCallback);
      expect(evaluationStatusWebSocket.onCloseCallback).toBe(closeCallback);
      expect(evaluationStatusWebSocket.onOpenCallback).toBe(openCallback);
    });
    it('应该清除所有回调函数', () => {
      evaluationStatusWebSocket.onMessage(() => {});
      evaluationStatusWebSocket.onError(() => {});
      evaluationStatusWebSocket.onClose(() => {});
      evaluationStatusWebSocket.onOpen(() => {});
      evaluationStatusWebSocket.clearCallbacks();
      expect(evaluationStatusWebSocket.onMessageCallback).toBeNull();
      expect(evaluationStatusWebSocket.onErrorCallback).toBeNull();
      expect(evaluationStatusWebSocket.onCloseCallback).toBeNull();
      expect(evaluationStatusWebSocket.onOpenCallback).toBeNull();
    });
  });

  describe('错误处理', () => {
    it('应该处理WebSocket创建失败', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn();
      global.WebSocket.mockImplementationOnce(() => { throw new Error('WebSocket creation failed'); });
      evaluationStatusWebSocket.onError(errorCallback);
      evaluationStatusWebSocket.connect('eval123');
      expect(consoleSpy).toHaveBeenCalledWith('创建评估状态WebSocket连接失败:', expect.any(Error));
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
      consoleSpy.mockRestore();
    });
    it('应该处理消息解析错误', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      evaluationStatusWebSocket.connect('eval123');
      // 让onMessageCallback抛出异常
      evaluationStatusWebSocket.onMessage(() => { throw new Error('parse error'); });
      if (mockWebSocket.onmessage) mockWebSocket.onmessage({ data: 'invalid json' });
      expect(consoleSpy).toHaveBeenCalledWith('❌ [evalWebSocket] 处理评估状态消息时出错:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
}); 