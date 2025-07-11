// WebSocket工具类 - 专门用于训练日志接收
import { getApiConfig } from '@/config/api';

class TrainingLogWebSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3秒
    this.heartbeatInterval = null;
    this.onMessageCallback = null;
    this.onErrorCallback = null;
    this.onCloseCallback = null;
    this.onOpenCallback = null;
    this.taskId = null;
  }

  // 连接WebSocket
  connect(taskId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket已连接');
      return;
    }

    this.taskId = taskId;

    try {
      const config = getApiConfig();
      // 将HTTP URL转换为WebSocket URL
      const wsUrl = config.baseURL.replace('http://', 'ws://').replace('https://', 'wss://');
      const fullUrl = `${wsUrl}/api/websocket/log_data/${taskId}`;
      
      console.log('正在连接训练日志WebSocket:', fullUrl);
      
      this.ws = new WebSocket(fullUrl);
      
      this.ws.onopen = (event) => {
        console.log('训练日志WebSocket连接成功');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        if (this.onOpenCallback) {
          this.onOpenCallback(event);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = event.data;
          console.log('收到训练日志:', data);
          
          if (this.onMessageCallback) {
            this.onMessageCallback(data);
          }
        } catch (error) {
          console.error('处理训练日志消息时出错:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('训练日志WebSocket连接错误:', error);
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('训练日志WebSocket连接关闭:', event.code, event.reason);
        this.stopHeartbeat();
        
        if (this.onCloseCallback) {
          this.onCloseCallback(event);
        }

        // 如果不是正常关闭，尝试重连
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnect();
        }
      };

    } catch (error) {
      console.error('创建训练日志WebSocket连接失败:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    }
  }

  // 重连
  reconnect() {
    if (!this.taskId) return;
    
    this.reconnectAttempts++;
    console.log(`训练日志WebSocket重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      this.connect(this.taskId);
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  // 发送消息
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      console.warn('训练日志WebSocket未连接，无法发送消息');
    }
  }

  // 关闭连接
  disconnect() {
    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close(1000, '正常关闭');
      this.ws = null;
      this.taskId = null;
    }
    // 清除所有回调函数
    this.clearCallbacks();
  }

  // 心跳检测
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping');
      }
    }, 30000); // 30秒发送一次心跳
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 设置回调函数
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  onClose(callback) {
    this.onCloseCallback = callback;
  }

  onOpen(callback) {
    this.onOpenCallback = callback;
  }

  // 清除所有回调函数
  clearCallbacks() {
    this.onMessageCallback = null;
    this.onErrorCallback = null;
    this.onCloseCallback = null;
    this.onOpenCallback = null;
  }

  // 获取连接状态
  getStatus() {
    if (!this.ws) {
      return 'disconnected';
    }
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }

  // 检查是否已连接
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// 创建单例实例
const trainingLogWebSocket = new TrainingLogWebSocket();

export default trainingLogWebSocket; 