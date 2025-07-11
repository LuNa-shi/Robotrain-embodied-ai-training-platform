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
   * 获取数据集视频文件
   * @param {number} datasetId 数据集ID
   * @param {number} chunkId 块ID
   * @param {number} episodeId 片段ID
   * @param {string} viewPoint 视角点
   * @returns {Promise<Blob>} 视频文件blob
   */
  getVideo: async (datasetId, chunkId, episodeId, viewPoint) => {
    try {
      const response = await api.get(API_ENDPOINTS.datasets.getVideo(datasetId, chunkId, episodeId, viewPoint), {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('获取视频文件失败:', error);
      throw error;
    }
  },

  /**
   * 获取数据集Parquet文件
   * @param {number} datasetId 数据集ID
   * @param {number} chunkId 块ID
   * @param {number} episodeId 片段ID
   * @returns {Promise<ArrayBuffer>} Parquet文件数据
   */
  getParquet: async (datasetId, chunkId, episodeId) => {
    try {
      const response = await api.get(API_ENDPOINTS.datasets.getParquet(datasetId, chunkId, episodeId), {
        responseType: 'arraybuffer',
      });
      return response.data;
    } catch (error) {
      console.error('获取Parquet文件失败:', error);
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

// 模型相关API函数
export const modelsAPI = {
  /**
   * 获取所有模型类型
   * @param {AbortSignal} signal 可选的AbortSignal用于取消请求
   * @returns {Promise<Array>} 模型类型列表
   */
  getAllModelTypes: async (signal) => {
    try {
      const response = await api.get(API_ENDPOINTS.models.getAllModelTypes, {
        signal: signal
      });
      return response.data;
    } catch (error) {
      // 如果是取消请求，直接抛出
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        throw error;
      }
      console.error('获取模型类型列表失败:', error);
      throw error;
    }
  },
};

// 训练任务相关API函数
export const trainTasksAPI = {
  /**
   * 创建训练任务
   * @param {Object} trainTaskData 训练任务数据
   * @returns {Promise<Object>} 创建的训练任务
   */
  create: async (trainTaskData) => {
    try {
      const response = await api.post(API_ENDPOINTS.trainTasks.create, trainTaskData);
      return response.data;
    } catch (error) {
      console.error('创建训练任务失败:', error);
      throw error;
    }
  },

  /**
   * 获取当前用户的训练任务列表
   * @param {AbortSignal} signal 可选的AbortSignal用于取消请求
   * @returns {Promise<Array>} 训练任务列表
   */
  getMyTasks: async (signal) => {
    try {
      const response = await api.get(API_ENDPOINTS.trainTasks.getMyTasks, {
        signal: signal
      });
      return response.data;
    } catch (error) {
      // 如果是取消请求，直接抛出
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        throw error;
      }
      console.error('获取训练任务列表失败:', error);
      throw error;
    }
  },

  /**
   * 根据ID获取训练任务详情
   * @param {number} taskId 训练任务ID
   * @returns {Promise<Object>} 训练任务详情
   */
  getById: async (taskId) => {
    try {
      const response = await api.get(API_ENDPOINTS.trainTasks.getById(taskId));
      return response.data;
    } catch (error) {
      console.error('获取训练任务详情失败:', error);
      throw error;
    }
  },

  /**
   * 下载训练任务生成的模型文件
   * @param {number} taskId 训练任务ID
   * @returns {Promise<void>} 下载成功
   */
  downloadModel: async (taskId) => {
    try {
      // 创建专门用于文件下载的axios实例
      const downloadApi = axios.create({
        baseURL: apiConfig.baseURL,
        timeout: 60000, // 文件下载需要更长的超时时间
        withCredentials: apiConfig.withCredentials,
        responseType: 'blob', // 设置响应类型为blob以处理文件下载
      });

      // 添加请求拦截器
      downloadApi.interceptors.request.use(
        (config) => {
          const token = localStorage.getItem('token');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          return config;
        },
        (error) => {
          console.error('下载请求拦截器错误:', error);
          return Promise.reject(error);
        }
      );

      // 添加响应拦截器（这部分可以保持原样，用于统一错误处理）
      downloadApi.interceptors.response.use(
        (response) => {
          return response;
        },
        (error) => {
          console.error('下载响应错误:', error);
          
          if (error.response?.status === 401) {
            // ... (错误处理逻辑保持不变)
            return Promise.reject(new Error('用户未登录，请重新登录'));
          }
          if (error.response?.status === 403) {
            return Promise.reject(new Error('权限不足，无法下载该模型文件'));
          }
          if (error.response?.status === 404) {
            return Promise.reject(new Error('训练任务不存在或模型文件未生成'));
          }
          
          const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || '下载失败';
          return Promise.reject(new Error(errorMessage));
        }
      );

      const response = await downloadApi.get(API_ENDPOINTS.trainTasks.downloadModel(taskId));
      
      // 从响应头中获取文件名
      const contentDisposition = response.headers['content-disposition'];
      let filename = `model_${taskId}.zip`; // 默认文件名
      
      if (contentDisposition) {
        // 使用更健壮的正则来匹配文件名，以防有其他参数
        const filenameMatch = contentDisposition.match(/filename\*?=['"]?([^'";]+)['"]?/);
        if (filenameMatch && filenameMatch[1]) {
          // 解码UTF-8格式的文件名
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }
      
      // 【核心修改】
      // 移除在此处创建和点击链接的逻辑，改为返回包含blob和文件名的对象
      return {
        blob: response.data,
        filename: filename,
      };

    } catch (error) {
      console.error('下载模型文件失败:', error);
      // 将底层的错误继续向上抛出，让UI层处理
      throw error;
    }
  },
};

export async function deleteTrainTask(taskId) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/train_tasks/${taskId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    },
  });
  // 调试输出
  console.log('deleteTrainTask status:', res.status);
  let text = '';
  try {
    text = await res.text();
    console.log('deleteTrainTask response text:', text);
  } catch (e) {
    console.log('deleteTrainTask response text parse error:', e);
  }
  if (res.status === 204 || res.status === 200) return true;
  if (res.status === 401) throw new Error('未登录');
  if (res.status === 403) throw new Error('无权删除该任务');
  if (res.status === 404) throw new Error('任务不存在');
  throw new Error('删除失败');
}

export default api; 