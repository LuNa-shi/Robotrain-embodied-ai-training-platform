import axios from 'axios';
import { getApiConfig } from '@/config/api';

// 获取API配置
const apiConfig = getApiConfig();

// 创建axios实例
const api = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
  // 跨域配置
  withCredentials: apiConfig.withCredentials,
});

// 请求拦截器 - 自动添加JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      // 使用Bearer token格式
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // 添加跨域请求头
    config.headers['Access-Control-Allow-Origin'] = '*';
    config.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    config.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    
    return config;
  },
  (error) => {
    console.error('请求拦截器错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理token过期等错误
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API响应错误:', error);
    
    // 网络错误处理
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('请求超时，请检查网络连接');
      return Promise.reject(new Error('网络连接超时，请检查网络设置'));
    }
    
    // CORS错误处理
    if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
      console.error('跨域请求失败，请检查后端CORS配置');
      return Promise.reject(new Error('跨域请求失败，请联系管理员'));
    }
    
    // 服务器错误处理
    if (error.response?.status >= 500) {
      console.error('服务器内部错误');
      return Promise.reject(new Error('服务器内部错误，请稍后重试'));
    }
    
    // 认证错误处理
    if (error.response?.status === 401) {
      console.log('Token过期或无效，清除本地存储');
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      localStorage.removeItem('tokenInfo');
      
      // 避免在登录页面重复跳转
      if (window.location.pathname !== '/user/login') {
        window.location.href = '/user/login';
      }
    }
    
    // 权限错误处理
    if (error.response?.status === 403) {
      console.error('权限不足');
      return Promise.reject(new Error('权限不足，无法访问该资源'));
    }
    
    // 处理后端返回的错误格式
    if (error.response?.data?.detail) {
      if (Array.isArray(error.response.data.detail)) {
        const firstError = error.response.data.detail[0];
        if (firstError?.msg) {
          return Promise.reject(new Error(firstError.msg));
        }
      } else if (typeof error.response.data.detail === 'string') {
        return Promise.reject(new Error(error.response.data.detail));
      }
    }
    
    // 其他错误
    const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || '请求失败';
    return Promise.reject(new Error(errorMessage));
  }
);

export default api; 