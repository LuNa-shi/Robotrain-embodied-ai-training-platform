import api from './api';
import { API_ENDPOINTS, checkNetworkStatus } from '@/config/api';

// 检查网络连接（可选，失败时不阻止请求）
const checkNetworkBeforeRequest = async () => {
  try {
    const isConnected = await checkNetworkStatus();
    if (!isConnected) {
      console.warn('网络连接检查失败，但继续尝试登录请求');
      // 不抛出错误，让请求继续尝试
    }
  } catch (error) {
    console.warn('网络检查出错，但继续尝试登录请求:', error);
    // 不抛出错误，让请求继续尝试
  }
};

// 登录API
export const loginAPI = async (username, password) => {
  try {
    await checkNetworkBeforeRequest();
    
    // 根据后端API要求，使用表单数据格式
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await api.post(API_ENDPOINTS.auth.login, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    // 验证响应格式 - 根据后端返回的JWT token格式
    if (!response.data.access_token || !response.data.token_type) {
      throw new Error('服务器返回的数据格式不正确');
    }
    
    // 返回JWT token信息
    return {
      access_token: response.data.access_token,
      token_type: response.data.token_type,
    };
  } catch (error) {
    console.error('登录请求失败:', error);
    
    // 处理后端返回的错误格式
    if (error.response?.status === 401) {
      throw new Error('用户名或密码错误');
    } else if (error.response?.status === 422) {
      // 处理验证错误
      const errorData = error.response.data;
      if (errorData?.detail && Array.isArray(errorData.detail)) {
        const firstError = errorData.detail[0];
        if (firstError?.msg) {
          // 将英文错误信息转换为中文
          const errorMsg = firstError.msg;
          if (errorMsg.includes('Incorrect username or password')) {
            throw new Error('用户名或密码错误');
          } else if (errorMsg.includes('field required')) {
            throw new Error('请填写所有必填字段');
          } else {
            throw new Error(errorMsg);
          }
        }
      }
      throw new Error('输入数据格式不正确');
    } else if (error.response?.status === 400) {
      throw new Error('请求参数错误');
    }
    
    // 处理其他错误信息
    if (error.message) {
      // 将常见的英文错误信息转换为中文
      if (error.message.includes('Incorrect username or password')) {
        throw new Error('用户名或密码错误');
      } else if (error.message.includes('field required')) {
        throw new Error('请填写所有必填字段');
      } else if (error.message.includes('Network Error')) {
        throw new Error('网络连接失败，请检查网络设置');
      } else if (error.message.includes('timeout')) {
        throw new Error('请求超时，请稍后重试');
      }
    }
    
    throw error;
  }
};

// 前端登出处理（不调用后端API）
export const logoutAPI = async () => {
  try {
    console.log('执行前端登出，清除本地数据');
    // 直接返回成功，因为前端登出不需要后端交互
    return { message: '登出成功' };
  } catch (error) {
    console.error('前端登出处理失败:', error);
    // 即使出错也返回成功，确保本地清理能执行
    return { message: '登出成功' };
  }
};

// 获取当前用户信息API
export const getCurrentUserAPI = async () => {
  try {
    // 网络检查失败时不阻止请求
    await checkNetworkBeforeRequest();
    
    const token = getStoredToken();
    console.log('getCurrentUserAPI - 获取到的token:', token ? token.substring(0, 20) + '...' : 'null');
    
    if (!token) {
      throw new Error('未找到token');
    }
    
    console.log('getCurrentUserAPI - 准备调用API:', API_ENDPOINTS.user.getCurrent);
    
    // 使用新的 /api/users/me 端点获取当前用户信息
    const response = await api.get(API_ENDPOINTS.user.getCurrent);
    
    console.log('getCurrentUserAPI - API响应:', response.data);
    
    // 验证响应格式
    if (!response.data.id || !response.data.username) {
      throw new Error('服务器返回的用户信息格式不正确');
    }
    
    return response.data;
  } catch (error) {
    console.error('获取用户信息失败:', error);
    console.error('错误详情:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
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
export const storeUserInfo = (accessToken, tokenType = 'bearer', userInfo = null) => {
  try {
    // 存储完整的token信息
    const tokenInfo = {
      access_token: accessToken,
      token_type: tokenType,
      full_token: `${tokenType} ${accessToken}`
    };
    
    localStorage.setItem('token', accessToken);
    localStorage.setItem('tokenInfo', JSON.stringify(tokenInfo));
    
    // 如果提供了用户信息，直接存储
    if (userInfo) {
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
    } else {
    // 从JWT token中解析用户信息（如果可能）
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const parsedUserInfo = {
        id: payload.user_id || payload.sub || payload.id,
        username: payload.username || payload.name,
        role: payload.role || 'user',
        isAdmin: payload.is_admin || payload.admin || false,
        exp: payload.exp,
        iat: payload.iat
      };
        localStorage.setItem('userInfo', JSON.stringify(parsedUserInfo));
    } catch (parseError) {
      console.warn('无法从JWT token解析用户信息:', parseError);
      // 如果无法解析，至少存储token
      }
    }
  } catch (error) {
    console.error('存储用户信息失败:', error);
    throw new Error('无法保存登录信息，请检查浏览器设置');
  }
};

// 清除用户信息
export const clearUserInfo = () => {
  try {
    // 清除所有相关的本地存储
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('tokenInfo');
    localStorage.removeItem('refreshToken');
    
    // 清除会话存储（如果有的话）
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userInfo');
    sessionStorage.removeItem('tokenInfo');
    sessionStorage.removeItem('refreshToken');
    
    // 清除其他可能的缓存
    if (window.caches) {
      // 清除缓存（可选）
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }
    
    console.log('用户信息清除完成');
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

// 统一的token验证函数
export const validateToken = (token) => {
  if (!token) {
    return { isValid: false, reason: 'token_missing' };
  }
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    
    if (payload.exp < currentTime) {
      return { isValid: false, reason: 'token_expired' };
    }
    
    return { isValid: true, payload };
  } catch (error) {
    console.error('Token解析失败:', error);
    return { isValid: false, reason: 'token_invalid' };
  }
};

// 检查用户是否已登录（改进版本）
export const isAuthenticated = () => {
  const token = getStoredToken();
  const userInfo = getStoredUserInfo();
  
  if (!token || !userInfo) {
    return false;
  }
  
  const validation = validateToken(token);
  if (!validation.isValid) {
    // 清除无效的认证信息
    clearUserInfo();
    return false;
  }
  
  return true;
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
export const signupAPI = async (username, password, isAdmin) => {
  try {
    // 网络检查失败时不阻止请求
    await checkNetworkBeforeRequest();
    
    // 确保isAdmin是布尔值
    const isAdminValue = Boolean(isAdmin);
    
    console.log('signupAPI - 注册参数:', { 
      username, 
      password, 
      isAdmin, 
      isAdminValue,
      is_admin: isAdminValue 
    });
    
    const response = await api.post(API_ENDPOINTS.auth.signup, {
      username,
      password,
      is_admin: isAdminValue,
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