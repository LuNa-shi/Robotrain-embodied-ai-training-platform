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
      config.headers.Authorization = `Bearer ${token}`;
    }
    
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
      // 可以在这里显示网络错误提示
      return Promise.reject(new Error('网络连接超时，请检查网络设置'));
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
    
    // 其他错误
    const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || '请求失败';
    return Promise.reject(new Error(errorMessage));
  }
);

export default api; 