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

// 数据集相关API函数
export const datasetsAPI = {
  /**
   * 获取当前用户的数据集列表
   * @returns {Promise<Array>} 数据集列表
   */
  getMyDatasets: async () => {
    try {
      const response = await api.get(API_ENDPOINTS.datasets.getMyDatasets);
      return response.data;
    } catch (error) {
      console.error('获取数据集列表失败:', error);
      throw error;
    }
  },

  /**
   * 根据ID获取数据集详情
   * @param {number} id 数据集ID
   * @returns {Promise<Object>} 数据集详情
   */
  getById: async (id) => {
    try {
      const response = await api.get(API_ENDPOINTS.datasets.getById(id));
      return response.data;
    } catch (error) {
      console.error('获取数据集详情失败:', error);
      throw error;
    }
  },

  /**
   * 创建新数据集
   * @param {Object} datasetData 数据集数据
   * @returns {Promise<Object>} 创建的数据集
   */
  create: async (datasetData) => {
    try {
      const response = await api.post(API_ENDPOINTS.datasets.create, datasetData);
      return response.data;
    } catch (error) {
      console.error('创建数据集失败:', error);
      throw error;
    }
  },

  /**
   * 更新数据集
   * @param {number} id 数据集ID
   * @param {Object} datasetData 更新的数据集数据
   * @returns {Promise<Object>} 更新后的数据集
   */
  update: async (id, datasetData) => {
    try {
      const response = await api.put(API_ENDPOINTS.datasets.update(id), datasetData);
      return response.data;
    } catch (error) {
      console.error('更新数据集失败:', error);
      throw error;
    }
  },

  /**
   * 删除数据集
   * @param {number} id 数据集ID
   * @returns {Promise<void>}
   */
  delete: async (id) => {
    try {
      await api.delete(API_ENDPOINTS.datasets.delete(id));
    } catch (error) {
      console.error('删除数据集失败:', error);
      throw error;
    }
  },
};

export default api; 