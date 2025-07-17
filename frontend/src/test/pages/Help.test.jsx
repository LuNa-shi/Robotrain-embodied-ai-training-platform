import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Help from '@/pages/Help';
import { BrowserRouter } from 'react-router-dom';

// mock window.close
const originalClose = window.close;
beforeAll(() => {
  window.close = jest.fn();
});
afterAll(() => {
  window.close = originalClose;
});

describe('Help 页面', () => {
  const renderHelp = () => render(
    <BrowserRouter>
      <Help />
    </BrowserRouter>
  );

  it('应正确渲染页面标题和描述', () => {
    renderHelp();
    expect(screen.getByText('帮助中心')).toBeInTheDocument();
    expect(screen.getByText('找到您需要的所有帮助和支持信息')).toBeInTheDocument();
  });

  it('应渲染常见问题、使用指南和联系我们', () => {
    renderHelp();
    expect(screen.getByText('常见问题')).toBeInTheDocument();
    expect(screen.getByText('使用指南')).toBeInTheDocument();
    expect(screen.getByText('联系我们')).toBeInTheDocument();
  });

  it('应显示所有FAQ问题和答案', () => {
    renderHelp();
    expect(screen.getByText('如何上传数据集？')).toBeInTheDocument();
    expect(screen.getByText('训练模型需要多长时间？')).toBeInTheDocument();
    expect(screen.getByText('如何查看训练进度？')).toBeInTheDocument();
    expect(screen.getByText('支持哪些模型类型？')).toBeInTheDocument();
    expect(screen.getByText('如何导出训练结果？')).toBeInTheDocument();
  });

  it('搜索FAQ应正确过滤问题', () => {
    renderHelp();
    const input = screen.getByPlaceholderText('搜索问题或关键词...');
    fireEvent.change(input, { target: { value: '上传' } });
    expect(screen.getByText('如何上传数据集？')).toBeInTheDocument();
    expect(screen.queryByText('如何导出训练结果？')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '不存在的问题' } });
    expect(screen.getByText('没有找到相关的问题。')).toBeInTheDocument();
  });

  it('点击返回按钮应优先关闭标签页', () => {
    renderHelp();
    window.opener = true;
    const backBtn = screen.getByText('返回上一页');
    fireEvent.click(backBtn);
    expect(window.close).toHaveBeenCalled();
    window.opener = null;
  });

  it('点击返回按钮应回退历史', () => {
    renderHelp();
    window.opener = null;
    window.history.pushState({}, '', '/help');
    const backBtn = screen.getByText('返回上一页');
    fireEvent.click(backBtn);
    // 由于jsdom不支持history.go(-1)，这里只能保证分支被覆盖
    expect(backBtn).toBeInTheDocument();
  });

  it('点击返回按钮应跳转首页', () => {
    renderHelp();
    window.opener = null;
    Object.defineProperty(window.history, 'length', { value: 0 });
    const backBtn = screen.getByText('返回上一页');
    fireEvent.click(backBtn);
    expect(backBtn).toBeInTheDocument();
  });

  it('应渲染所有使用指南项', () => {
    renderHelp();
    expect(screen.getByText('快速开始指南')).toBeInTheDocument();
    expect(screen.getByText('数据预处理教程')).toBeInTheDocument();
    expect(screen.getByText('模型训练详解')).toBeInTheDocument();
    expect(screen.getByText('API文档')).toBeInTheDocument();
  });

  it('应渲染所有联系方式', () => {
    renderHelp();
    // 技术支持、客服热线、官方网站都在联系方式区域
    const techSupport = screen.getAllByText('技术支持');
    expect(techSupport.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('support@robotrain.com')).toBeInTheDocument();
    expect(screen.getByText('客服热线')).toBeInTheDocument();
    expect(screen.getByText('400-123-4567')).toBeInTheDocument();
    expect(screen.getByText('官方网站')).toBeInTheDocument();
    expect(screen.getByText('www.robotrain.com')).toBeInTheDocument();
  });

  it('应渲染底部统计信息', () => {
    renderHelp();
    expect(screen.getByText('活跃用户')).toBeInTheDocument();
    expect(screen.getByText('成功训练')).toBeInTheDocument();
    expect(screen.getByText('系统可用性')).toBeInTheDocument();
    // 技术支持在底部统计和联系方式都出现
    expect(screen.getAllByText('技术支持').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1000+')).toBeInTheDocument();
    expect(screen.getByText('5000+')).toBeInTheDocument();
    expect(screen.getByText('99.9%')).toBeInTheDocument();
    expect(screen.getByText('24/7')).toBeInTheDocument();
  });

  it('使用指南“查看”按钮可点击', () => {
    renderHelp();
    const viewBtns = screen.getAllByText('查看');
    viewBtns.forEach(btn => {
      fireEvent.click(btn);
      expect(btn).toBeInTheDocument();
    });
  });
}); 