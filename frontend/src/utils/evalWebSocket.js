// WebSocket工具类 - 专门用于评估项目状态监控
import { getApiConfig } from '@/config/api';

class EvaluationStatusWebSocket {
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
    this.evalTaskId = null;
  }

  // 连接WebSocket
  connect(evalTaskId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('评估状态WebSocket已连接');
      return;
    }

    this.evalTaskId = evalTaskId;

    try {
      const config = getApiConfig();
      // 将HTTP URL转换为WebSocket URL
      const wsUrl = config.baseURL.replace('http://', 'ws://').replace('https://', 'wss://');
      const fullUrl = `${wsUrl}/api/websocket/eval_status/${evalTaskId}`;
      
      console.log('🔌 [evalWebSocket] 正在连接评估状态WebSocket:', fullUrl);
      console.log('🔌 [evalWebSocket] 评估任务ID:', evalTaskId);
      
      this.ws = new WebSocket(fullUrl);
      
      this.ws.onopen = (event) => {
        console.log('✅ [evalWebSocket] 评估状态WebSocket连接成功');
        console.log('✅ [evalWebSocket] 连接事件:', event);
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        if (this.onOpenCallback) {
          console.log('✅ [evalWebSocket] 调用连接成功回调函数');
          this.onOpenCallback(event);
        } else {
          console.log('✅ [evalWebSocket] 未设置连接成功回调函数');
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = event.data;
          console.log('📨 [evalWebSocket] 收到WebSocket消息:', data);
          console.log('📨 [evalWebSocket] 消息类型:', typeof data);
          console.log('📨 [evalWebSocket] 消息长度:', data.length);
          
          if (this.onMessageCallback) {
            console.log('📨 [evalWebSocket] 调用消息回调函数');
            this.onMessageCallback(data);
          } else {
            console.log('📨 [evalWebSocket] 未设置消息回调函数');
          }
        } catch (error) {
          console.error('❌ [evalWebSocket] 处理评估状态消息时出错:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ [evalWebSocket] 评估状态WebSocket连接错误:', error);
        console.error('❌ [evalWebSocket] 错误类型:', typeof error);
        console.error('❌ [evalWebSocket] 错误详情:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        
        if (this.onErrorCallback) {
          console.log('❌ [evalWebSocket] 调用错误回调函数');
          this.onErrorCallback(error);
        } else {
          console.log('❌ [evalWebSocket] 未设置错误回调函数');
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 [evalWebSocket] 评估状态WebSocket连接关闭');
        console.log('🔌 [evalWebSocket] 关闭代码:', event.code);
        console.log('🔌 [evalWebSocket] 关闭原因:', event.reason);
        console.log('🔌 [evalWebSocket] 关闭事件:', event);
        
        this.stopHeartbeat();
        
        if (this.onCloseCallback) {
          console.log('🔌 [evalWebSocket] 调用连接关闭回调函数');
          this.onCloseCallback(event);
        } else {
          console.log('🔌 [evalWebSocket] 未设置连接关闭回调函数');
        }

        // 如果不是正常关闭，尝试重连
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log('🔌 [evalWebSocket] 准备重连，当前重连次数:', this.reconnectAttempts);
          this.reconnect();
        } else {
          console.log('🔌 [evalWebSocket] 正常关闭或达到最大重连次数，不进行重连');
        }
      };

    } catch (error) {
      console.error('创建评估状态WebSocket连接失败:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    }
  }

  // 重连
  reconnect() {
    if (!this.evalTaskId) return;
    
    this.reconnectAttempts++;
    console.log(`评估状态WebSocket重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      this.connect(this.evalTaskId);
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  // 发送消息
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      console.warn('评估状态WebSocket未连接，无法发送消息');
    }
  }

  // 关闭连接
  disconnect() {
    console.log('🔌 [evalWebSocket] 开始断开WebSocket连接');
    console.log('🔌 [evalWebSocket] 当前连接状态:', this.getStatus());
    
    if (this.ws) {
      console.log('🔌 [evalWebSocket] 停止心跳检测');
      this.stopHeartbeat();
      
      console.log('🔌 [evalWebSocket] 关闭WebSocket连接');
      this.ws.close(1000, '正常关闭');
      
      console.log('🔌 [evalWebSocket] 清空WebSocket实例');
      this.ws = null;
      this.evalTaskId = null;
    } else {
      console.log('🔌 [evalWebSocket] WebSocket实例不存在，无需关闭');
    }
    
    // 清除所有回调函数
    console.log('🔌 [evalWebSocket] 清除所有回调函数');
    this.clearCallbacks();
    
    console.log('🔌 [evalWebSocket] WebSocket连接断开完成');
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
const evaluationStatusWebSocket = new EvaluationStatusWebSocket();

export default evaluationStatusWebSocket;
export { EvaluationStatusWebSocket }; 