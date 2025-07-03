// API配置文件
// 支持前后端跨域运行的配置

const API_CONFIG = {
  // 开发环境API地址
  development: {
    baseURL: 'http://localhost:8000', // 开发环境后端地址
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
    login: '/api/auth/token', // 更新为后端要求的登录接口
    signup: '/api/auth/signup', // 添加注册接口
    refresh: '/api/auth/refresh',
  },
  
  // 用户相关
  user: {
    getById: (id) => `/user/${id}`,
    getCurrent: '/api/users/me', // 获取当前用户信息（包含管理员状态）
  },
  
  // 数据集相关
  datasets: {
    getMyDatasets: '/api/datasets/me', // 获取当前用户的数据集列表
    getById: (id) => `/api/datasets/${id}`,
    create: '/api/datasets',
    upload: '/api/datasets/upload', // 上传数据集文件
    update: (id) => `/api/datasets/${id}`,
    delete: (id) => `/api/datasets/${id}`,
  },
  
  // 模型相关
  models: {
    getAllModelTypes: '/api/model_types', // 获取所有模型类型
  },
  
  // 训练任务相关
  trainTasks: {
    create: '/api/train_tasks/', // 创建训练任务
    getMyTasks: '/api/train_tasks/me', // 获取当前用户的训练任务列表
    getById: (taskId) => `/api/train_tasks/${taskId}`, // 获取训练任务详情
    downloadModel: (taskId) => `/api/train_tasks/${taskId}/download_model`, // 下载训练模型
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

// 网络状态检测
export const checkNetworkStatus = async () => {
  // 如果环境变量设置为跳过网络检查，直接返回true
  if (import.meta.env.VITE_SKIP_NETWORK_CHECK === 'true') {
    console.log('跳过网络连接检查');
    return true;
  }
  
  try {
    const config = getApiConfig();
    const response = await fetch(`${config.baseURL}/`, {
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