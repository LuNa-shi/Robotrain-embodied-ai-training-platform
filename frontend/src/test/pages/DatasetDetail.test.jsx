import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DatasetDetailPage from '@/pages/DatasetDetail';
import { 
  mockDatasetDetailResponse, 
  mockEmptyDatasetResponse, 
  mockDeleteResponse,
  mockErrorResponse,
  mockAuthErrorResponse,
  mockNotFoundErrorResponse
} from '../mocks/datasetDetailMocks.js';

// --- Mocks ---
vi.mock('@/utils/api', () => ({
  datasetsAPI: {
    getById: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { 
    ...actual, 
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams()
  };
});

vi.mock('@ant-design/icons', () => ({
  ArrowLeftOutlined: () => <span>ArrowLeftIcon</span>,
  PlayCircleOutlined: () => <span>PlayIcon</span>,
  DownloadOutlined: () => <span>DownloadIcon</span>,
  EditOutlined: () => <span>EditIcon</span>,
  DeleteOutlined: () => <span>DeleteIcon</span>,
  InfoCircleOutlined: () => <span>InfoIcon</span>,
  CalendarOutlined: () => <span>CalendarIcon</span>,
  UserOutlined: () => <span>UserIcon</span>,
  FileOutlined: () => <span>FileIcon</span>,
}));

// antd mock 方案
const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

const mockModal = {
  confirm: vi.fn(),
};

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal();
  const MockApp = ({ children }) => children;
  MockApp.useApp = () => ({
    message: mockMessage,
    notification: vi.fn(),
    modal: mockModal,
  });
  return {
    ...actual,
    App: MockApp,
  };
});

// --- 测试套件 ---
describe('DatasetDetail Page', () => {
  let user;
  let mockGetByIdAPI;
  let mockDeleteAPI;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query) => ({ matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn() }),
    });
    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // 清理mock对象
    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.info.mockClear();
    mockMessage.error.mockClear();
    mockModal.confirm.mockClear();

    // 设置默认的useParams返回值
    mockUseParams.mockReturnValue({ datasetId: '1' });

    // 设置localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'mock-token'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });

    const api = await import('@/utils/api');
    mockGetByIdAPI = api.datasetsAPI.getById;
    mockDeleteAPI = api.datasetsAPI.delete;
    mockGetByIdAPI.mockClear();
    mockDeleteAPI.mockClear();
    
    // 清理DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderDatasetDetail = async () => {
    const antd = await import('antd');
    return render(
      <BrowserRouter>
        <antd.App>
          <DatasetDetailPage />
        </antd.App>
      </BrowserRouter>
    );
  };

  describe('页面渲染', () => {
    it('应该正确渲染数据集详情页面的标题', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      expect(await screen.findByRole('heading', { name: '数据集信息' })).toBeInTheDocument();
    });

    it('应该在加载时显示加载状态', async () => {
      mockGetByIdAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockDatasetDetailResponse), 100)));
      await renderDatasetDetail();
      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('应该正确显示数据集基本信息', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
        expect(screen.getByText('这是一个用于测试的数据集，包含了丰富的机器人训练数据')).toBeInTheDocument();
        expect(screen.getByText('uuid-mock-001')).toBeInTheDocument();
      });
    });

    it('应该正确显示上传时间', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        // 检查时间格式化的显示
        const dateText = screen.getByText(/2024\/1\/15/);
        expect(dateText).toBeInTheDocument();
      });
    });

    it('应该显示返回按钮', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /ArrowLeftIcon 返回/ })).toBeInTheDocument();
      });
    });

    it('应该显示操作按钮（下载和删除）', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /下载/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /删除/ })).toBeInTheDocument();
      });
    });
  });

  describe('导航功能', () => {
    it('点击返回按钮应该跳转到数据中心', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /ArrowLeftIcon 返回/ })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /ArrowLeftIcon 返回/ }));
      expect(mockNavigate).toHaveBeenCalledWith('/data-center');
    });
  });

  describe('数据集操作', () => {
    beforeEach(async () => {
      // 清理之前的mock
      mockGetByIdAPI.mockClear();
      mockDeleteAPI.mockClear();
      mockMessage.success.mockClear();
      mockMessage.info.mockClear();
      mockMessage.error.mockClear();
      mockModal.confirm.mockClear();
      
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
    });

    it('点击下载按钮应该显示提示信息', async () => {
      await user.click(screen.getByRole('button', { name: /下载/ }));
      expect(mockMessage.info).toHaveBeenCalledWith('下载功能待实现');
    });

    it('点击删除按钮应该显示确认对话框', async () => {
      await user.click(screen.getByRole('button', { name: /删除/ }));
      expect(mockModal.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ 
          title: '确认删除',
          content: '删除后数据无法恢复，确定要删除该数据集吗？'
        })
      );
    });

    it('确认删除应该调用删除API并跳转到数据中心', async () => {
      mockDeleteAPI.mockResolvedValue(mockDeleteResponse);
      mockModal.confirm.mockImplementation(config => {
        if (config.onOk) config.onOk();
      });
      
      await user.click(screen.getByRole('button', { name: /删除/ }));
      
      expect(mockDeleteAPI).toHaveBeenCalledWith('1');
      await waitFor(() => {
        expect(mockMessage.success).toHaveBeenCalledWith('数据集删除成功');
      });
      expect(mockNavigate).toHaveBeenCalledWith('/data-center');
    });

    it('删除按钮在删除过程中应该显示加载状态', async () => {
        // 1. 定义一个变量，用于从 mock 中“捕获” onOk 回调函数
        let onOkCallback;
      
        mockModal.confirm.mockImplementation(config => {
          onOkCallback = config.onOk;
        });
      
        // 3. 保持让 API 变慢的 mock，这对于测试加载状态至关重要
        mockDeleteAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockDeleteResponse), 100)));
      
        // 4. 第一次点击，模拟用户点击“删除”按钮，这会“打开”确认框
        await user.click(screen.getByRole('button', { name: /删除/ }));
      
        // 5. 断言确认框确实被调用了
        expect(mockModal.confirm).toHaveBeenCalled();
      
        // 6. 【核心修改】显式地调用 onOkCallback，模拟用户点击了确认框中的“确认”按钮
        //    因为 onOk 是异步的，所以我们 await 它
        const onOkPromise = onOkCallback();
      
        // 7. 现在，我们可以100%确定 setDeleting(true) 已经被调用，
        //    并且 onOk 函数正暂停在 await datasetsAPI.delete(...) 这一行。
        //    在这个状态下，按钮必然是加载状态。
        //    Ant Design的Button组件在loading状态下会添加ant-btn-loading类名
        await waitFor(() => {
          const button = screen.getByRole('button', { name: /删除/ });
          expect(button).toHaveClass('ant-btn-loading');
        });
      
        // 8. （可选但推荐）为了确保测试的完整性，我们可以推进伪造的时间，
        //    让 API 调用完成，并验证加载状态是否消失。
        vi.advanceTimersByTime(150); // 快进150毫秒，确保setTimeout完成
        await onOkPromise;

        await waitFor(() => {
          const button = screen.getByRole('button', { name: /删除/ });
          expect(button).not.toHaveClass('ant-btn-loading');
        });
    });
  });

  describe('错误处理', () => {
    it('应该在API调用失败时显示错误信息', async () => {
      const errorMessage = '网络错误';
      mockGetByIdAPI.mockRejectedValue(new Error(errorMessage));
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByText(`加载失败: ${errorMessage}`)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /重 试/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /返 回/ })).toBeInTheDocument();
      });
    });

    it('点击重试按钮应该重新获取数据', async () => {
      mockGetByIdAPI.mockRejectedValueOnce(new Error('网络错误'));
      mockGetByIdAPI.mockResolvedValueOnce(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /重 试/ })).toBeInTheDocument();
      });
              await user.click(screen.getByRole('button', { name: /重 试/ }));
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
    });

    it('应该在数据集不存在时显示相应错误信息', async () => {
      // 重新设置mock，确保状态干净
      mockGetByIdAPI.mockClear();
      mockMessage.error.mockClear();
      
      // 模拟API返回null的情况
      mockGetByIdAPI.mockResolvedValue(null);
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByText('数据集不存在')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /返 回/ })).toBeInTheDocument();
      });
    });

    it('应该在认证失败时清除token并跳转到登录页', async () => {
      // 重新设置mock，确保状态干净
      mockGetByIdAPI.mockClear();
      mockMessage.error.mockClear();
      mockNavigate.mockClear();
      
      const authError = new Error('401 Unauthorized');
      authError.message = '401 Unauthorized';
      mockGetByIdAPI.mockRejectedValue(authError);
      
      await renderDatasetDetail();
      
      await waitFor(() => {
        expect(screen.getByText(/加载失败: 认证失败，请重新登录/)).toBeInTheDocument();
      });
      
      // 等待message.error被调用
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('认证失败，请重新登录');
      });
      
      // 等待跳转到登录页
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/user/login');
      }, { timeout: 3000 });
    });

    it('应该在删除失败时显示相应错误信息', async () => {
      // 重新设置mock，确保状态干净
      mockGetByIdAPI.mockClear();
      mockDeleteAPI.mockClear();
      mockMessage.error.mockClear();
      mockModal.confirm.mockClear();
      
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      mockDeleteAPI.mockRejectedValue(new Error('404 Not Found'));
      
      // 模拟Modal.confirm的行为
      mockModal.confirm.mockImplementation(config => {
        // 立即执行onOk回调
        if (config.onOk) {
          config.onOk();
        }
      });
      
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
      
      await user.click(screen.getByRole('button', { name: /删除/ }));
      
      // 等待删除操作完成
      await waitFor(() => {
        expect(mockDeleteAPI).toHaveBeenCalledWith('1');
      });
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('数据集不存在或已被删除');
      });
    });

    it('应该在删除时认证失败时跳转到登录页', async () => {
      // 重新设置mock，确保状态干净
      mockGetByIdAPI.mockClear();
      mockDeleteAPI.mockClear();
      mockMessage.error.mockClear();
      mockModal.confirm.mockClear();
      mockNavigate.mockClear();
      
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      const authError = new Error('401 Unauthorized');
      authError.message = '401 Unauthorized';
      mockDeleteAPI.mockRejectedValue(authError);
      
      // 模拟Modal.confirm的行为
      mockModal.confirm.mockImplementation(config => {
        // 立即执行onOk回调
        if (config.onOk) {
          config.onOk();
        }
      });
      
      await renderDatasetDetail();
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
      
      await user.click(screen.getByRole('button', { name: /删除/ }));
      
      // 等待删除操作完成
      await waitFor(() => {
        expect(mockDeleteAPI).toHaveBeenCalledWith('1');
      });
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('未登录或登录已过期，请重新登录');
      });
      
      // 等待跳转到登录页
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/user/login');
      }, { timeout: 2000 });
    });
  });

  describe('URL参数处理', () => {
    it('应该根据URL参数获取对应的数据集', async () => {
      mockUseParams.mockReturnValue({ datasetId: '123' });
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      
      await renderDatasetDetail();
      
      expect(mockGetByIdAPI).toHaveBeenCalledWith('123');
    });

    it('应该在没有datasetId参数时不调用API', async () => {
      mockUseParams.mockReturnValue({ datasetId: undefined });
      
      await renderDatasetDetail();
      
      expect(mockGetByIdAPI).not.toHaveBeenCalled();
    });
  });

  describe('调试功能', () => {
    it('应该正确显示数据集UUID标签', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        const uuidTag = screen.getByText('uuid-mock-001');
        expect(uuidTag).toBeInTheDocument();
        expect(uuidTag.closest('.ant-tag')).toHaveClass('ant-tag-blue');
      });
    });

    it('应该正确格式化显示上传时间', async () => {
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      await waitFor(() => {
        // 检查时间格式化的显示（中文格式）
        const timeText = screen.getByText(/2024\/1\/15/);
        expect(timeText).toBeInTheDocument();
      });
    });
  });

  describe('响应式设计', () => {
    it('应该在移动设备上正确显示', async () => {
      // 模拟移动设备屏幕
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      
      mockGetByIdAPI.mockResolvedValue(mockDatasetDetailResponse);
      await renderDatasetDetail();
      
      await waitFor(() => {
        expect(screen.getByText('测试数据集1')).toBeInTheDocument();
      });
      
      // 触发resize事件
      window.dispatchEvent(new Event('resize'));
      
      // 验证页面仍然正常显示
      expect(screen.getByText('测试数据集1')).toBeInTheDocument();
    });
  });
}); 