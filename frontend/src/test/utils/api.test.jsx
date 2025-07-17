import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- **代码修正核心区域 1: Mock Setup** ---

// 1. Mock axios 模块。所有依赖的变量都在工厂函数内部创建。
vi.mock('axios', () => {
  // a. 将 capturedInterceptors 的创建移入工厂函数内部
  const capturedInterceptors = {};

  const defaultMockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      // b. use 方法现在可以安全地访问在同一作用域内定义的 capturedInterceptors
      request: { use: vi.fn(successCb => (capturedInterceptors.request = successCb)) },
      response: { use: vi.fn((successCb, errorCb) => (capturedInterceptors.response = errorCb)) },
    },
  };
  const uploadMockInstance = {
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };
  const downloadMockInstance = {
    get: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };

  const create = vi.fn((config) => {
    if (config?.timeout === 30000) return uploadMockInstance;
    if (config?.responseType === 'blob' || config?.responseType === 'arraybuffer') return downloadMockInstance;
    return defaultMockInstance;
  });

  // c. 将 capturedInterceptors 和 mockedInstances 一起附加到 create 函数上，供外部访问
  create.mockedInstances = {
    default: defaultMockInstance,
    upload: uploadMockInstance,
    download: downloadMockInstance,
  };
  create.capturedInterceptors = capturedInterceptors;

  return { default: { create }, create };
});


vi.mock('@/config/api', () => ({
  getApiConfig: vi.fn().mockReturnValue({
    baseURL: 'http://localhost:8000',
    timeout: 15000,
    withCredentials: false,
  }),
  API_ENDPOINTS: {
    datasets: { getMyDatasets: '/api/datasets/me', getById: (id) => `/api/datasets/${id}`, create: '/api/datasets', update: (id) => `/api/datasets/${id}`, delete: (id) => `/api/datasets/${id}`, getVideo: (datasetId, chunkId, episodeId, viewPoint) => `/api/datasets/visualize/${datasetId}/${chunkId}/${episodeId}/${viewPoint}/video`, getParquet: (datasetId, chunkId, episodeId) => `/api/datasets/visualize/${datasetId}/${chunkId}/${episodeId}/parquet`, upload: '/api/datasets/upload' }, models: { getAllModelTypes: '/api/model_types' }, trainTasks: { create: '/api/train_tasks/', getMyTasks: '/api/train_tasks/me', getCompletedTasks: '/api/train_tasks/me/completed', getById: (taskId) => `/api/train_tasks/${taskId}`, downloadModel: (taskId) => `/api/train_tasks/${taskId}/download_model` }, evalTasks: { create: '/api/eval_tasks/', getMyTasks: '/api/eval_tasks/me', getById: (taskId) => `/api/eval_tasks/${taskId}`, getVideo: (evalTaskId, videoName) => `/api/eval_tasks/${evalTaskId}/${videoName}`, downloadVideo: (evalTaskId, videoName) => `/api/eval_tasks/${evalTaskId}/${videoName}`, delete: (evalTaskId) => `/api/eval_tasks/${evalTaskId}` },
  },
}));

Object.defineProperty(global, 'localStorage', {
  value: (() => {
    let store = {};
    return {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    };
  })(),
  writable: true,
});
Object.defineProperty(global, 'window', {
  value: { location: { href: '', pathname: '' }, ...window },
  writable: true,
});

import axios from 'axios';
import { datasetsAPI, modelsAPI, trainTasksAPI, evalTasksAPI, deleteTrainTask } from '../../utils/api';

const createMockApiResponse = (data, headers = {}) => ({ data, status: 200, statusText: 'OK', headers, config: {} });
const createMockApiError = (status, data, customError = {}) => {
  // 1. 创建一个真正的 Error 实例，它天生就有 .message 属性
  const error = new Error(`Request failed with status code ${status}`);
  
  // 2. 直接在 Error 实例上附加属性
  error.response = { status, data };
  Object.assign(error, customError); // 使用 Object.assign 附加其他自定义属性 (如 'code')

  // 3. 返回这个完整的 Error 实例
  return error;
};

describe('API 模块', () => {
  let mockApiInstance, mockUploadApiInstance, mockDownloadApiInstance;
  // d. 为捕获到的拦截器回调函数准备一个作用域变量
  let interceptors;

  beforeEach(() => {
    mockApiInstance = axios.create.mockedInstances.default;
    mockUploadApiInstance = axios.create.mockedInstances.upload;
    mockDownloadApiInstance = axios.create.mockedInstances.download;
    // e. 在每次测试前，从 mock 函数上获取回调函数的引用
    interceptors = axios.create.capturedInterceptors;
    
    vi.clearAllMocks();
    
    global.localStorage.clear();
    global.localStorage.setItem('token', 'test-token');

    global.fetch = vi.fn();

    window.location.href = '';
    window.location.pathname = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- **代码修正核心区域 2: Interceptor Tests** ---
  describe('Axios 拦截器', () => {
    it('请求拦截器应该在token存在时自动添加 Authorization 头', () => {
      const config = { headers: {} };
      
      // f. 直接调用我们通过 beforeEach 获取到的拦截器函数
      const newConfig = interceptors.request(config);

      expect(newConfig.headers.Authorization).toBe('Bearer test-token');
    });
    
    it('请求拦截器在token不存在时应该不添加 Authorization 头', () => {
      global.localStorage.removeItem('token');
      const config = { headers: {} };

      const newConfig = interceptors.request(config);

      expect(newConfig.headers.Authorization).toBeUndefined();
    });

    it('响应拦截器应该通过清除本地存储并重定向来处理401未授权错误', async () => {
      window.location.pathname = '/dashboard';
      const error401 = createMockApiError(401, { detail: 'Token expired' });

      await expect(interceptors.response(error401)).rejects.toThrow('Token expired');
      
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('userInfo');
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('tokenInfo');
      expect(window.location.href).toBe('/user/login');
    });
    
    it('响应拦截器在登录页面遇到401错误时不应重复跳转', async () => {
      window.location.pathname = '/user/login';
      const error401 = createMockApiError(401, { detail: 'Token expired' });
      
      await expect(interceptors.response(error401)).rejects.toThrow('Token expired');
      
      expect(window.location.href).not.toBe('/user/login');
      expect(window.location.href).toBe('');
    });
    
    it('响应拦截器应该处理403禁止访问错误', async () => {
      const error403 = createMockApiError(403, { detail: 'Forbidden' });

      await expect(interceptors.response(error403)).rejects.toThrow('权限不足，无法访问该资源');
    });
    
    it('响应拦截器应该处理5xx服务器错误', async () => {
      const error500 = createMockApiError(500, { detail: 'Internal Server Error' });

      await expect(interceptors.response(error500)).rejects.toThrow('服务器内部错误，请稍后重试');
    });

    it('响应拦截器应该处理网络超时错误', async () => {
        const timeoutError = createMockApiError(500, {}, { code: 'ECONNABORTED' });

        await expect(interceptors.response(timeoutError)).rejects.toThrow('网络连接超时，请检查网络设置');
    });
  });

  describe('数据集相关API (datasetsAPI)', () => {
    it('getMyDatasets 应该能正确获取我的数据集列表', async () => {
      const mockData = [{ id: 1, name: '我的第一个数据集' }];
      mockApiInstance.get.mockResolvedValue(createMockApiResponse(mockData));
      const result = await datasetsAPI.getMyDatasets();
      expect(result).toEqual(mockData);
      expect(mockApiInstance.get).toHaveBeenCalledWith('/api/datasets/me', expect.any(Object));
    });

    it('getById 应该能根据ID正确获取数据集详情', async () => {
        const mockData = { id: 1, name: '数据集详情' };
        mockApiInstance.get.mockResolvedValue(createMockApiResponse(mockData));
        const result = await datasetsAPI.getById(1);
        expect(result).toEqual(mockData);
        expect(mockApiInstance.get).toHaveBeenCalledWith('/api/datasets/1');
    });

    it('create 应该能正确提交数据以创建新数据集', async () => {
        const newData = { name: '新数据集' };
        mockApiInstance.post.mockResolvedValue(createMockApiResponse({ id: 2, ...newData }));
        const result = await datasetsAPI.create(newData);
        expect(result).toEqual({ id: 2, ...newData });
        expect(mockApiInstance.post).toHaveBeenCalledWith('/api/datasets', newData);
    });
    
    it('update 应该能正确提交数据以更新数据集', async () => {
        const updateData = { name: '更新后的数据集名称' };
        mockApiInstance.put.mockResolvedValue(createMockApiResponse({ id: 1, ...updateData }));
        const result = await datasetsAPI.update(1, updateData);
        expect(result).toEqual({ id: 1, ...updateData });
        expect(mockApiInstance.put).toHaveBeenCalledWith('/api/datasets/1', updateData);
    });

    it('delete 应该能正确调用删除接口', async () => {
        mockApiInstance.delete.mockResolvedValue(createMockApiResponse({}));
        await datasetsAPI.delete(1);
        expect(mockApiInstance.delete).toHaveBeenCalledWith('/api/datasets/1');
    });

    it('getVideo 应该能获取视频文件的Blob对象', async () => {
      const mockBlob = new Blob(['video data'], { type: 'video/mp4' });
      // 修正: `getVideo` 使用的是全局共享的 api 实例，对应 mockApiInstance
      mockApiInstance.get.mockResolvedValue(createMockApiResponse(mockBlob));
      const result = await datasetsAPI.getVideo(1, 2, 3, 'front');
      expect(result).toEqual(mockBlob);
      // 修正: 断言 mockApiInstance.get 被调用
      expect(mockApiInstance.get).toHaveBeenCalledWith(
          '/api/datasets/visualize/1/2/3/front/video',
          { responseType: 'blob' }
      );
  });

  it('getParquet 应该能获取Parquet文件的ArrayBuffer', async () => {
      const mockBuffer = new ArrayBuffer(8);
      // 修正: `getParquet` 使用的是全局共享的 api 实例，对应 mockApiInstance
      mockApiInstance.get.mockResolvedValue(createMockApiResponse(mockBuffer));
      const result = await datasetsAPI.getParquet(1, 2, 3);
      expect(result).toEqual(mockBuffer);
      // 修正: 断言 mockApiInstance.get 被调用
      expect(mockApiInstance.get).toHaveBeenCalledWith(
          '/api/datasets/visualize/1/2/3/parquet',
          { responseType: 'arraybuffer' }
      );
  });

    it('upload 应该能以表单数据形式上传文件', async () => {
        const file = new File(['test data'], 'dataset.zip', { type: 'application/zip' });
        const mockResponse = { id: 1, name: '上传的数据集' };
        mockUploadApiInstance.post.mockResolvedValue(createMockApiResponse(mockResponse));
        
        const result = await datasetsAPI.upload('上传的数据集', '这是一个描述', file);

        expect(result).toEqual(mockResponse);
        expect(mockUploadApiInstance.post).toHaveBeenCalledWith('/api/datasets/upload', expect.any(FormData));
    });
  });

  describe('模型相关API (modelsAPI)', () => {
     it('getAllModelTypes 应该能正确获取所有模型类型', async () => {
        const mockData = [{ id: 1, name: '模型类型A' }];
        const signal = new AbortController().signal;
        mockApiInstance.get.mockResolvedValue(createMockApiResponse(mockData));
        const result = await modelsAPI.getAllModelTypes(signal);
        expect(result).toEqual(mockData);
        expect(mockApiInstance.get).toHaveBeenCalledWith('/api/model_types', expect.any(Object));
     });

     it('getAllModelTypes 应该能传递请求取消错误', async () => {
        const error = new Error('Canceled');
        error.name = 'CanceledError';
        mockApiInstance.get.mockRejectedValue(error);
        await expect(modelsAPI.getAllModelTypes()).rejects.toThrow('Canceled');
     });
  });

  describe('训练任务相关API (trainTasksAPI)', () => {
      it('create 应该能正确创建训练任务', async () => {
        const taskData = { name: '第一个训练任务' };
        mockApiInstance.post.mockResolvedValue(createMockApiResponse({ id: 1, ...taskData }));
        const result = await trainTasksAPI.create(taskData);
        expect(result).toEqual({ id: 1, ...taskData });
        expect(mockApiInstance.post).toHaveBeenCalledWith('/api/train_tasks/', taskData);
      });

      it('getMyTasks 应该能正确获取我的训练任务列表', async () => {
        const mockData = [{ id: 1, name: '我的任务' }];
        mockApiInstance.get.mockResolvedValue(createMockApiResponse(mockData));
        const result = await trainTasksAPI.getMyTasks();
        expect(result).toEqual(mockData);
        expect(mockApiInstance.get).toHaveBeenCalledWith('/api/train_tasks/me', expect.any(Object));
      });

      it('downloadModel 应该能从响应头中解析文件名并返回Blob', async () => {
        const mockBlob = new Blob(['model data'], { type: 'application/zip' });
        const headers = { 'content-disposition': 'attachment; filename="awesome_model.zip"' };
        mockDownloadApiInstance.get.mockResolvedValue(createMockApiResponse(mockBlob, headers));

        const result = await trainTasksAPI.downloadModel(123);
        
        expect(result.blob).toEqual(mockBlob);
        expect(result.filename).toBe('awesome_model.zip');
        expect(mockDownloadApiInstance.get).toHaveBeenCalledWith('/api/train_tasks/123/download_model');
      });

      it('downloadModel 在响应头缺失时应该返回默认文件名和Blob', async () => {
        const mockBlob = new Blob(['model data'], { type: 'application/zip' });
        mockDownloadApiInstance.get.mockResolvedValue(createMockApiResponse(mockBlob, {}));

        const result = await trainTasksAPI.downloadModel(123);
        
        expect(result.blob).toEqual(mockBlob);
        expect(result.filename).toBe('model_123.zip');
        expect(mockDownloadApiInstance.get).toHaveBeenCalledWith('/api/train_tasks/123/download_model');
      });
  });
  
  describe('评估任务相关API (evalTasksAPI)', () => {
    it('create 应该能正确创建评估任务', async () => {
        const evalData = { name: '第一个评估任务', modelId: 1 };
        mockApiInstance.post.mockResolvedValue(createMockApiResponse({ id: 1, ...evalData }));
        const result = await evalTasksAPI.create(evalData);
        expect(result).toEqual({ id: 1, ...evalData });
        expect(mockApiInstance.post).toHaveBeenCalledWith('/api/eval_tasks/', evalData);
    });

    it('delete 应该能正确调用删除评估任务的接口', async () => {
        mockApiInstance.delete.mockResolvedValue(createMockApiResponse({}));
        await evalTasksAPI.delete(1);
        expect(mockApiInstance.delete).toHaveBeenCalledWith('/api/eval_tasks/1');
    });

    it('downloadVideo 应该能返回视频的Blob和文件名', async () => {
        const mockBlob = new Blob(['eval video'], { type: 'video/mp4' });
        const headers = { 'content-disposition': 'attachment; filename="eval_result.mp4"' };
        mockDownloadApiInstance.get.mockResolvedValue(createMockApiResponse(mockBlob, headers));

        const result = await evalTasksAPI.downloadVideo(1, 'video.mp4');
        
        expect(result.blob).toEqual(mockBlob);
        expect(result.filename).toBe('eval_result.mp4');
        expect(mockDownloadApiInstance.get).toHaveBeenCalledWith('/api/eval_tasks/1/video.mp4');
    });
  });

  describe('删除训练任务函数 (deleteTrainTask - fetch)', () => {
      it('当返回状态码为204时应该成功删除', async () => {
          global.fetch.mockResolvedValue({ status: 204, text: () => Promise.resolve('') });
          const result = await deleteTrainTask(1);
          expect(result).toBe(true);
          expect(fetch).toHaveBeenCalledWith('/api/train_tasks/1', {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer test-token' }
          });
      });

      it('当返回状态码为401时应该抛出"未登录"错误', async () => {
          global.fetch.mockResolvedValue({ status: 401, text: () => Promise.resolve('') });
          await expect(deleteTrainTask(1)).rejects.toThrow('未登录');
      });

      it('当返回状态码为403时应该抛出"无权删除该任务"错误', async () => {
          global.fetch.mockResolvedValue({ status: 403, text: () => Promise.resolve('') });
          await expect(deleteTrainTask(1)).rejects.toThrow('无权删除该任务');
      });
      
      it('当返回状态码为404时应该抛出"任务不存在"错误', async () => {
          global.fetch.mockResolvedValue({ status: 404, text: () => Promise.resolve('') });
          await expect(deleteTrainTask(1)).rejects.toThrow('任务不存在');
      });

      it('当返回其他错误状态码时应该抛出"删除失败"错误', async () => {
          global.fetch.mockResolvedValue({ status: 500, text: () => Promise.resolve('') });
          await expect(deleteTrainTask(1)).rejects.toThrow('删除失败');
      });
      
      it('当发生网络错误时应该抛出相应错误', async () => {
          global.fetch.mockRejectedValue(new Error('Network Failure'));
          await expect(deleteTrainTask(1)).rejects.toThrow('Network Failure');
      });
  });
});