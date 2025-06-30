import api from './api';
import { mockLoginAPI, mockGetCurrentUserAPI, mockLogoutAPI } from './mockApi';
import { API_ENDPOINTS, checkNetworkStatus, shouldUseMockAPI } from '@/config/api';

// 检查网络连接
const checkNetworkBeforeRequest = async () => {
  if (!shouldUseMockAPI()) {
    const isConnected = await checkNetworkStatus();
    if (!isConnected) {
      throw new Error('无法连接到后端服务器，请检查网络连接');
    }
  }
};

// 登录API
export const loginAPI = async (username, password) => {
  if (shouldUseMockAPI()) {
    // 使用模拟API
    return await mockLoginAPI(username, password);
  } else {
    // 使用真实API
    try {
      await checkNetworkBeforeRequest();
      
      const response = await api.post(API_ENDPOINTS.auth.login, {
        username,
        password,
      });
      
      // 验证响应格式
      if (!response.data.token || !response.data.user) {
        throw new Error('服务器返回的数据格式不正确');
      }
      
      return response.data;
    } catch (error) {
      console.error('登录请求失败:', error);
      throw error;
    }
  }
};

// 登出API
export const logoutAPI = async () => {
  if (shouldUseMockAPI()) {
    // 使用模拟API
    return await mockLogoutAPI();
  } else {
    // 使用真实API
    try {
      await checkNetworkBeforeRequest();
      await api.post(API_ENDPOINTS.auth.logout);
    } catch (error) {
      console.error('登出请求失败:', error);
      // 即使API调用失败，也要清除本地存储
      throw error;
    }
  }
};

// 获取当前用户信息API
export const getCurrentUserAPI = async () => {
  if (shouldUseMockAPI()) {
    // 使用模拟API
    const token = getStoredToken();
    if (!token) {
      throw new Error('未找到token');
    }
    return await mockGetCurrentUserAPI(token);
  } else {
    // 使用真实API
    try {
      await checkNetworkBeforeRequest();
      
      const token = getStoredToken();
      if (!token) {
        throw new Error('未找到token');
      }
      
      // 从JWT token中解析用户ID
      const userId = getUserIdFromToken(token);
      if (!userId) {
        throw new Error('无法从token中获取用户ID');
      }
      
      const response = await api.get(API_ENDPOINTS.user.getById(userId));
      
      // 验证响应格式
      if (!response.data.id || !response.data.username) {
        throw new Error('服务器返回的用户信息格式不正确');
      }
      
      return response.data;
    } catch (error) {
      console.error('获取用户信息失败:', error);
      throw error;
    }
  }
};

// 从JWT token中解析用户ID
const getUserIdFromToken = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId || payload.sub || payload.id; // 支持不同的JWT标准字段名
  } catch (error) {
    console.error('解析JWT token失败:', error);
    return null;
  }
};

// 存储用户信息到localStorage
export const storeUserInfo = (token, userInfo) => {
  try {
    localStorage.setItem('token', token);
    localStorage.setItem('userInfo', JSON.stringify(userInfo));
  } catch (error) {
    console.error('存储用户信息失败:', error);
    throw new Error('无法保存登录信息，请检查浏览器设置');
  }
};

// 清除用户信息
export const clearUserInfo = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
  } catch (error) {
    console.error('清除用户信息失败:', error);
  }
};

// 获取存储的token
export const getStoredToken = () => {
  try {
    return localStorage.getItem('token');
  } catch (error) {
    console.error('获取存储的token失败:', error);
    return null;
  }
};

// 获取存储的用户信息
export const getStoredUserInfo = () => {
  try {
    const userInfo = localStorage.getItem('userInfo');
    return userInfo ? JSON.parse(userInfo) : null;
  } catch (error) {
    console.error('获取存储的用户信息失败:', error);
    return null;
  }
};

// 检查用户是否已登录
export const isAuthenticated = () => {
  const token = getStoredToken();
  const userInfo = getStoredUserInfo();
  return !!(token && userInfo);
};

// 检查token是否过期（简单检查，实际应该在后端验证）
export const isTokenExpired = (token) => {
  if (!token) return true;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    return payload.exp < currentTime;
  } catch (error) {
    console.error('检查token过期失败:', error);
    return true;
  }
}; 