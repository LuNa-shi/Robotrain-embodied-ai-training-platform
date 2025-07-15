import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import HomePage from '@/pages/Home';
import { mockUploadResponse, createMockFile, createMockNonZipFile } from '../mocks/homeMocks';

// --- Mocks ---
vi.mock('@/utils/api', () => ({
    datasetsAPI: {
      upload: vi.fn(),
    },
}));
  
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
    const actual = await importActual();
    return { ...actual, useNavigate: () => mockNavigate };
});
  
vi.mock('@ant-design/icons', () => ({
    UploadOutlined: () => <span>UploadIcon</span>,
    DatabaseOutlined: () => <span>DatabaseIcon</span>,
    ProjectOutlined: () => <span>ProjectIcon</span>,
    InboxOutlined: () => <span>InboxIcon</span>,
}));
  
const mockMessage = {
    success: vi.fn(),
    error: vi.fn(),
};
  
vi.mock('antd', async (importOriginal) => {
    const actual = await importOriginal();
    const MockApp = ({ children }) => children;
    MockApp.useApp = () => ({
      message: mockMessage,
      notification: vi.fn(),
      modal: vi.fn(),
    });
    return {
      ...actual,
      App: MockApp,
    };
});

// --- 测试套件 ---
describe('Home Page', () => {
  let user;
  let mockUploadAPI;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
    });

    Object.defineProperty(window, 'getComputedStyle', {
        value: () => ({
            getPropertyValue: (prop) => {
                return '';
            }
        })
    });

    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.error.mockClear();

    const api = await import('@/utils/api');
    mockUploadAPI = api.datasetsAPI.upload;
    mockUploadAPI.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderHome = async () => {
    const antd = await import('antd');
    return render(
      <BrowserRouter>
        <antd.App>
          <HomePage />
        </antd.App>
      </BrowserRouter>
    );
  };
  
  const fillUploadForm = async (name = '测试数据集', description = '这是一个测试数据集') => {
    const nameInput = await screen.findByPlaceholderText('请输入数据集名称');
    const descriptionInput = await screen.findByPlaceholderText('请输入数据集描述');
    await user.type(nameInput, name);
    await user.type(descriptionInput, description);
  };

  describe('页面渲染', () => {
    it('应该正确渲染主页面的所有静态元素', async () => {
      await renderHome();
      expect(screen.getByRole('heading', { name: 'RoboTrain' })).toBeInTheDocument();
      expect(screen.getByText('你的机器人训练助手')).toBeInTheDocument();
      // ...
    });

    it('应该正确渲染卡片描述', async () => {
      await renderHome();
      expect(screen.getByText(/上传您的训练数据文件，支持ZIP格式/)).toBeInTheDocument();
      // ...
    });
  });

  describe('导航功能', () => {
    it('点击数据中心按钮应该跳转到数据中心页面', async () => {
      await renderHome();
      await user.click(screen.getByRole('button', { name: /进入数据中心/ }));
      expect(mockNavigate).toHaveBeenCalledWith('/data-center');
    });
    // ...
  });

  describe('表单验证', () => {
    beforeEach(async () => {
        await renderHome();
        await user.click(screen.getByRole('button', { name: /上传数据/ }));
        await screen.findByRole('dialog', { name: '上传数据集' });
    });

    it('应该在未填写数据集名称时显示错误', async () => {
        const fileInput = screen.getByTestId('file-dragger-input');
        const file = createMockFile();
        await user.upload(fileInput, file);
        await user.type(screen.getByPlaceholderText('请输入数据集描述'), '一些描述');
        await user.click(screen.getByRole('button', { name: /确认上传/ }));
        expect(await screen.findByText('请输入数据集名称')).toBeInTheDocument();
    });

    it('应该在未填写数据集描述时显示错误', async () => {
        const fileInput = screen.getByTestId('file-dragger-input');
        const file = createMockFile();
        await user.upload(fileInput, file);
        await user.type(screen.getByPlaceholderText('请输入数据集名称'), '测试数据集');
        await user.click(screen.getByRole('button', { name: /确认上传/ }));
        expect(await screen.findByText('请输入数据集描述')).toBeInTheDocument();
    });

    it('应该在未选择文件时禁用“确认上传”按钮', async () => {
      // 首先确保按钮存在
      const submitButton = screen.getByRole('button', { name: /确认上传/ });
      // 断言按钮是禁用的
      expect(submitButton).toBeDisabled();

      // （可选）我们还可以测试上传文件后，按钮变为可用
      const fileInput = screen.getByTestId('file-dragger-input');
      await user.upload(fileInput, createMockFile());
      expect(submitButton).not.toBeDisabled();
  });

  // 2. 保留并确保“选择非ZIP文件”的测试能通过
  it('应该在选择非ZIP文件时显示错误', async () => {
      const fileInput = screen.getByTestId('file-dragger-input');
      await user.upload(fileInput, createMockNonZipFile());
      
      await waitFor(() => {
          expect(mockMessage.error).toHaveBeenCalledWith('只支持上传ZIP格式的文件！');
      });
    });
  });

  // ########## 这里是核心修改 ##########
  describe('文件上传功能', () => {
    beforeEach(async () => {
      await renderHome(); // <-- 修正：添加 await
      await user.click(screen.getByRole('button', { name: /上传数据/ }));
      await screen.findByRole('dialog', { name: '上传数据集' });
    });

    it('应该成功上传ZIP文件并跳转到数据集详情页面', async () => {
      mockUploadAPI.mockResolvedValue(mockUploadResponse);
      await fillUploadForm();
      const fileInput = screen.getByTestId('file-dragger-input');
      const file = createMockFile();
      await user.upload(fileInput, file);
      await user.click(screen.getByRole('button', { name: /确认上传/ }));
      await waitFor(() => {
        expect(mockMessage.success).toHaveBeenCalledWith('数据集上传成功！');
      });
      // ...
    });
  });

  describe('文件选择功能', () => {
    beforeEach(async () => {
      await renderHome();
      await user.click(screen.getByRole('button', { name: /上传数据/ }));
      await screen.findByRole('dialog', { name: '上传数据集' });
    });

    it('应该正确显示已选择的文件名', async () => {
      const fileInput = screen.getByTestId('file-dragger-input');
      const file = createMockFile('my-dataset.zip');
      await user.upload(fileInput, file);
      
      // 等待并查找文件名是否出现在UI上
      expect(await screen.findByText('已选择文件: my-dataset.zip')).toBeInTheDocument();
    });
  });

  describe('表单重置', () => {
    it('应该在模态框关闭时重置表单', async () => {
      await renderHome(); // <-- 修正：添加 await
      await user.click(screen.getByRole('button', { name: /上传数据/ }));
      await screen.findByRole('dialog', { name: '上传数据集' });
      await fillUploadForm();
      // ...
    });
  });
});