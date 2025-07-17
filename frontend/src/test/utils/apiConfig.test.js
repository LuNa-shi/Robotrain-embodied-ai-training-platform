import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as apiConfigModule from '@/config/api';

global.fetch = vi.fn();

describe('config/api.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置环境变量
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_API_TIMEOUT', '');
    vi.stubEnv('VITE_API_WITH_CREDENTIALS', '');
    vi.stubEnv('VITE_SKIP_NETWORK_CHECK', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('API_CONFIG 应包含所有环境', () => {
    expect(apiConfigModule.default).toHaveProperty('development');
    expect(apiConfigModule.default).toHaveProperty('production');
    expect(apiConfigModule.default).toHaveProperty('test');
    expect(apiConfigModule.default).toHaveProperty('localDev');
  });

  it('API_ENDPOINTS 应包含主要端点', () => {
    expect(apiConfigModule.API_ENDPOINTS.auth.login).toBe('/api/auth/token');
    expect(apiConfigModule.API_ENDPOINTS.datasets.getMyDatasets).toBe('/api/datasets/me');
    expect(apiConfigModule.API_ENDPOINTS.models.getAllModelTypes).toBe('/api/model_types');
    expect(apiConfigModule.API_ENDPOINTS.trainTasks.create).toBe('/api/train_tasks/');
    expect(apiConfigModule.API_ENDPOINTS.evalTasks.create).toBe('/api/eval_tasks/');
  });

  it('getApiConfig 默认返回开发环境', () => {
    vi.stubEnv('MODE', 'development');
    const config = apiConfigModule.getApiConfig();
    expect(config.baseURL).toBe('http://localhost:8000');
    expect(config.timeout).toBe(15000);
    expect(config.withCredentials).toBe(false);
  });

  it('getApiConfig 支持生产环境', () => {
    vi.stubEnv('MODE', 'production');
    const config = apiConfigModule.getApiConfig();
    expect(config.baseURL).toBe('https://your-backend-domain.com');
    expect(config.withCredentials).toBe(true);
  });

  it('getApiConfig 支持测试环境', () => {
    vi.stubEnv('MODE', 'test');
    const config = apiConfigModule.getApiConfig();
    expect(config.baseURL).toBe('http://test-backend-server.com');
    expect(config.withCredentials).toBe(false);
  });

  it('getApiConfig 支持本地开发环境', () => {
    vi.stubEnv('MODE', 'localDev');
    const config = apiConfigModule.getApiConfig();
    expect(config.baseURL).toBe('http://192.168.1.100:8080');
    expect(config.withCredentials).toBe(false);
  });

  it('getApiConfig 支持环境变量覆盖', () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom.com');
    vi.stubEnv('VITE_API_TIMEOUT', '12345');
    vi.stubEnv('VITE_API_WITH_CREDENTIALS', 'true');
    const config = apiConfigModule.getApiConfig();
    expect(config.baseURL).toBe('http://custom.com');
    expect(config.timeout).toBe(12345);
    expect(config.withCredentials).toBe(true);
  });

  it('getApiConfig 非法timeout时使用默认值', () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_API_TIMEOUT', 'notanumber');
    const config = apiConfigModule.getApiConfig();
    expect(config.timeout).toBe(15000);
  });

  it('getApiConfig 未知环境时回退到development', () => {
    vi.stubEnv('MODE', 'unknown');
    const config = apiConfigModule.getApiConfig();
    expect(config.baseURL).toBe('http://localhost:8000');
  });

  describe('checkNetworkStatus', () => {
    it('VITE_SKIP_NETWORK_CHECK为true时直接返回true', async () => {
      vi.stubEnv('VITE_SKIP_NETWORK_CHECK', 'true');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await apiConfigModule.checkNetworkStatus();
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledWith('跳过网络连接检查');
      spy.mockRestore();
    });

    it('网络正常时返回true', async () => {
      vi.stubEnv('VITE_SKIP_NETWORK_CHECK', 'false');
      fetch.mockResolvedValue({ ok: true });
      const result = await apiConfigModule.checkNetworkStatus();
      expect(result).toBe(true);
    });

    it('网络不通时返回false', async () => {
      vi.stubEnv('VITE_SKIP_NETWORK_CHECK', 'false');
      fetch.mockResolvedValue({ ok: false });
      const result = await apiConfigModule.checkNetworkStatus();
      expect(result).toBe(false);
    });

    it('fetch抛异常时返回false', async () => {
      vi.stubEnv('VITE_SKIP_NETWORK_CHECK', 'false');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetch.mockRejectedValue(new Error('fail'));
      const result = await apiConfigModule.checkNetworkStatus();
      expect(result).toBe(false);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
