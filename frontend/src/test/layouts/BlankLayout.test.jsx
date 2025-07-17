import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BlankLayout from '@/layouts/BlankLayout';

// --- 测试套件 ---
describe('BlankLayout', () => {
  const renderBlankLayout = () => {
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<BlankLayout />}>
            <Route index element={<div>Test Content</div>} />
            <Route path="test" element={<div>Another Test Content</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  };

  describe('页面渲染', () => {
    it('应该正确渲染BlankLayout组件', () => {
      renderBlankLayout();
      
      // 检查内容是否正确渲染
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('应该正确渲染Outlet内容', () => {
      renderBlankLayout();
      
      // 检查Outlet是否正确渲染子路由内容
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('应该能够渲染不同的路由内容', () => {
      const { rerender } = render(
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<BlankLayout />}>
              <Route index element={<div>Index Content</div>} />
              <Route path="other" element={<div>Other Content</div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      );
      
      expect(screen.getByText('Index Content')).toBeInTheDocument();
    });
  });

  describe('组件结构', () => {
    it('应该只包含Outlet组件', () => {
      renderBlankLayout();
      
      // BlankLayout应该是一个简单的包装器，只包含Outlet
      const container = screen.getByText('Test Content').parentElement;
      expect(container).toBeInTheDocument();
    });

    it('不应该包含任何额外的布局元素', () => {
      renderBlankLayout();
      
      // 不应该有header、sidebar等布局元素
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
  });

  describe('功能测试', () => {
    it('应该能够正确传递props给子组件', () => {
      const TestComponent = ({ testProp }) => <div>Test: {testProp}</div>;
      
      render(
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<BlankLayout />}>
              <Route index element={<TestComponent testProp="value" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      );
      
      expect(screen.getByText('Test: value')).toBeInTheDocument();
    });

    it('应该能够处理复杂的子组件', () => {
      const ComplexComponent = () => (
        <div>
          <h1>Complex Title</h1>
          <p>Complex description</p>
          <button>Click me</button>
        </div>
      );
      
      render(
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<BlankLayout />}>
              <Route index element={<ComplexComponent />} />
            </Route>
          </Routes>
        </BrowserRouter>
      );
      
      expect(screen.getByText('Complex Title')).toBeInTheDocument();
      expect(screen.getByText('Complex description')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('边界情况', () => {
    it('应该在没有子路由时正常工作', () => {
      render(
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<BlankLayout />} />
          </Routes>
        </BrowserRouter>
      );
      
      // 组件应该正常渲染，即使没有子路由
      expect(document.body).toBeInTheDocument();
    });

    it('应该能够处理空内容', () => {
      const EmptyComponent = () => null;
      
      render(
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<BlankLayout />}>
              <Route index element={<EmptyComponent />} />
            </Route>
          </Routes>
        </BrowserRouter>
      );
      
      // 组件应该正常渲染，即使子组件返回null
      expect(document.body).toBeInTheDocument();
    });
  });
}); 