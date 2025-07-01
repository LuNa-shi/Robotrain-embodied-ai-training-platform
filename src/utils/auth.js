import api from './api';
import { API_ENDPOINTS, checkNetworkStatus } from '@/config/api';

// 检查网络连接
const checkNetworkBeforeRequest = async () => {
  const isConnected = await checkNetworkStatus();
  if (!isConnected) {
    throw new Error('无法连接到后端服务器，请检查网络连接');
  }
};

// 登录API
export const loginAPI = async (username, password) => {
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
};

// 登出API
export const logoutAPI = async () => {
  try {
    await checkNetworkBeforeRequest();
    await api.post(API_ENDPOINTS.auth.logout);
  } catch (error) {
    console.error('登出请求失败:', error);
    // 即使API调用失败，也要清除本地存储
    throw error;
  }
};

// 获取当前用户信息API
export const getCurrentUserAPI = async () => {
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

// 注册API
export const signupAPI = async (username, password, isAdmin = false) => {
  try {
    await checkNetworkBeforeRequest();
    
    const response = await api.post(API_ENDPOINTS.auth.signup, {
      username,
      password,
      is_admin: isAdmin,
    });
    
    // 验证响应格式 - 根据后端返回的用户信息格式
    if (!response.data.id || !response.data.username) {
      throw new Error('服务器返回的数据格式不正确');
    }
    
    return response.data;
  } catch (error) {
    console.error('注册请求失败:', error);
    
    // 只处理注册特有的错误情况
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      // 根据后端返回的错误格式处理
      if (
        errorData?.detail?.includes('用户名已存在') ||
        errorData?.detail?.includes('用户已存在') ||
        errorData?.detail?.includes('具有此用户名的用户已存在')
      ) {
        throw new Error('用户名已存在，请选择其他用户名');
      } else {
        throw new Error(errorData?.detail || '注册失败，请检查输入信息');
      }
    } else if (error.response?.status === 409) {
      throw new Error('用户名已存在，请选择其他用户名');
    } else if (error.response?.status === 422) {
      throw new Error('输入数据格式不正确，请检查用户名和密码');
    }
    
    // 其他错误直接抛出，由 api.js 响应拦截器处理
    throw error;
  }
}; 