import axios from 'axios';
import { getApiConfig, API_ENDPOINTS } from '@/config/api';

// 获取API配置
const apiConfig = getApiConfig();

// 调试信息
console.log('API配置信息:', {
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
  withCredentials: apiConfig.withCredentials,
  env: import.meta.env.MODE,
  envBaseURL: import.meta.env.VITE_API_BASE_URL
});

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
    
    // 注意：CORS头应该由后端服务器设置，前端设置无效
    // 这里只设置必要的请求头
    
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
    if (error.message.includes('CORS') || error.message.includes('cross-origin') || error.message.includes('Network Error')) {
      console.error('跨域请求失败，请检查后端CORS配置');
      return Promise.reject(new Error('网络连接失败，请检查后端服务是否正常运行'));
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
   * @param {AbortSignal} signal 可选的AbortSignal用于取消请求
   * @returns {Promise<Array>} 数据集列表
   */
  getMyDatasets: async (signal) => {
    try {
      const response = await api.get(API_ENDPOINTS.datasets.getMyDatasets, {
        signal: signal
      });
      return response.data;
    } catch (error) {
      // 如果是取消请求，直接抛出
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        throw error;
      }
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

  /**
   * 上传数据集文件
   * @param {string} name 数据集名称
   * @param {string} description 数据集描述
   * @param {File} file 上传的数据集文件（zip格式）
   * @returns {Promise<Object>} 上传成功的数据集信息
   */
  upload: async (name, description, file) => {
    try {
      // 创建FormData对象
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      formData.append('file', file);

      // 创建专门用于文件上传的axios实例，不设置Content-Type让浏览器自动设置
      const uploadApi = axios.create({
        baseURL: apiConfig.baseURL,
        timeout: 30000, // 文件上传需要更长的超时时间
        withCredentials: apiConfig.withCredentials,
      });

      // 添加请求拦截器
      uploadApi.interceptors.request.use(
        (config) => {
          const token = localStorage.getItem('token');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          // 不设置Content-Type，让浏览器自动设置multipart/form-data
          return config;
        },
        (error) => {
          console.error('上传请求拦截器错误:', error);
          return Promise.reject(error);
        }
      );

      // 添加响应拦截器
      uploadApi.interceptors.response.use(
        (response) => {
          return response;
        },
        (error) => {
          console.error('上传响应错误:', error);
          
          // 处理特定的上传错误
          if (error.response?.status === 400) {
            return Promise.reject(new Error('请求参数错误，请检查文件格式和参数'));
          }
          
          if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userInfo');
            localStorage.removeItem('tokenInfo');
            
            if (window.location.pathname !== '/user/login') {
              window.location.href = '/user/login';
            }
            return Promise.reject(new Error('用户未登录，请重新登录'));
          }
          
          // 其他错误处理
          const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || '上传失败';
          return Promise.reject(new Error(errorMessage));
        }
      );

      const response = await uploadApi.post(API_ENDPOINTS.datasets.upload, formData);
      return response.data;
    } catch (error) {
      console.error('上传数据集失败:', error);
      throw error;
    }
  },
};

export default api; 