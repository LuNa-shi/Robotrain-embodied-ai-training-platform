// API配置文件
// 支持前后端跨域运行的配置

const API_CONFIG = {
  // 开发环境API地址
  development: {
    baseURL: 'http://localhost:8080', // 后端开发环境地址
    timeout: 15000, // 增加超时时间，适应网络延迟
    withCredentials: false, // 开发环境通常不需要跨域cookie
  },
  
  // 生产环境API地址
  production: {
    baseURL: 'https://your-backend-domain.com', // 后端生产环境地址
    timeout: 15000,
    withCredentials: true, // 生产环境可能需要跨域cookie
  },
  
  // 测试环境API地址
  test: {
    baseURL: 'http://test-backend-server.com', // 测试环境后端地址
    timeout: 15000,
    withCredentials: false,
  },
  
  // 本地开发环境（前后端分离）
  localDev: {
    baseURL: 'http://192.168.1.100:8080', // 示例：后端运行在其他机器上
    timeout: 15000,
    withCredentials: false,
  },
};

// API端点配置
export const API_ENDPOINTS = {
  // 认证相关
  auth: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    refresh: '/api/auth/refresh', // 可选的token刷新接口
  },
  
  // 用户相关
  user: {
    getById: (id) => `/user/${id}`,
    getCurrent: '/api/auth/me', // 可选的获取当前用户接口
  },
  
  // 其他API端点可以在这里添加
  // data: {
  //   list: '/api/data',
  //   create: '/api/data',
  //   update: (id) => `/api/data/${id}`,
  //   delete: (id) => `/api/data/${id}`,
  // },
};

// 获取当前环境的API配置
export const getApiConfig = () => {
  const env = import.meta.env.MODE || 'development';
  
  // 可以通过环境变量覆盖配置
  const envBaseURL = import.meta.env.VITE_API_BASE_URL;
  const envTimeout = import.meta.env.VITE_API_TIMEOUT;
  const envWithCredentials = import.meta.env.VITE_API_WITH_CREDENTIALS;
  
  const config = API_CONFIG[env] || API_CONFIG.development;
  
  return {
    ...config,
    baseURL: envBaseURL || config.baseURL,
    timeout: envTimeout ? parseInt(envTimeout) : config.timeout,
    withCredentials: envWithCredentials ? envWithCredentials === 'true' : config.withCredentials,
  };
};

// 检查是否使用模拟API
export const shouldUseMockAPI = () => {
  const useMockAPI = import.meta.env.VITE_USE_MOCK_API;
  const isDevelopment = import.meta.env.MODE === 'development';
  
  // 开发环境默认使用模拟API，除非明确设置为false
  if (isDevelopment) {
    return useMockAPI !== 'false';
  }
  
  // 生产环境不使用模拟API
  return false;
};

// 网络状态检测
export const checkNetworkStatus = async () => {
  try {
    const config = getApiConfig();
    const response = await fetch(`${config.baseURL}/api/health`, {
      method: 'GET',
      mode: 'cors',
      timeout: 5000,
    });
    return response.ok;
  } catch (error) {
    console.warn('网络连接检查失败:', error);
    return false;
  }
};

export default API_CONFIG; 