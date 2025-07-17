import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSelector } from 'react-redux';
import { validateToken } from '@/utils/auth';

// 布局
import BasicLayout from '@/layouts/BasicLayout.jsx';
import BlankLayout from '@/layouts/BlankLayout.jsx'; // 引入空白布局

// 页面
import HomePage from '@/pages/Home/index.jsx'; // 这是新的上传数据页
import Login from '@/pages/User/Login.jsx';
import Register from '@/pages/User/Register.jsx';
import Profile from '@/pages/Profile/index.jsx';
// import Settings from '@/pages/Settings/index.jsx';
import Help from '@/pages/Help/index.jsx'; // 引入帮助文档页面
import NotFound from '@/pages/NotFound/index.jsx';
import DataCenter from '@/pages/DataCenter/index.jsx'; // 数据中心页
import ProjectCenter from '@/pages/ProjectCenter/index.jsx'; // 项目中心页
import ProjectProgressPage from '@/pages/ProjectProgress/index.jsx'; // 项目进度页
import DatasetDetailPage from '@/pages/DatasetDetail/index.jsx'; // 数据集详情页
import DatasetVisualizationPage from '@/pages/DatasetVisualization/index.jsx'; // 数据集可视化页
// import DataManagement from '@/pages/DataManagement/index.jsx'; // 数据管理页
// import ProjectManagement from '@/pages/ProjectManagement/index.jsx'; // 项目管理页
import Evaluation from '@/pages/Evaluation/index.jsx'; // 模型评估测试页
import Training from '@/pages/Training/index.jsx'; // 发起训练页

// 认证路由保护组件
const AuthRoute = ({ children }) => {
  const isAuth = useAuth();
  
  // 额外的安全检查：确保localStorage中的token也是有效的
  const additionalCheck = () => {
    const token = localStorage.getItem('token');
    const userInfo = localStorage.getItem('userInfo');
    
    if (!token || !userInfo) {
      return false;
    }
    
    const validation = validateToken(token);
    return validation.isValid;
  };
  
  if (!isAuth || !additionalCheck()) {
    // 清除可能存在的无效认证信息
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('tokenInfo');
    return <Navigate to="/user/login" replace />;
  }
  
  return children;
};

// 管理员路由保护组件
const AdminRoute = ({ children }) => {
  const isAuth = useAuth();
  const { userInfo } = useSelector(state => state.user);
  if (!isAuth) {
    return <Navigate to="/user/login" replace />;
  }
  if (!userInfo?.isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return children;
};

// 已登录用户重定向组件
const RedirectIfAuthenticated = ({ children }) => {
  const isAuth = useAuth();
  if (isAuth) {
    return <Navigate to="/home" replace />;
  }
  return children;
};

const routes = [
  // 默认重定向到登录页
  {
    path: '/',
    element: <Navigate to="/user/login" replace />,
  },

  // 核心工作区路由 (有Header和Sider) - 需要认证
  {
    element: (
      <AuthRoute>
        <BasicLayout />
      </AuthRoute>
    ),
    children: [
      { path: '/home', element: <HomePage /> },
      { path: '/training', element: <Training /> },
      { path: '/project-center', element: <ProjectCenter /> },
      { path: '/data-center', element: <DataCenter /> },
      { path: '/dataset/:datasetId', element: <DatasetDetailPage /> },
      { path: '/dataset-visualization/:datasetId', element: <DatasetVisualizationPage /> },
      { path: '/evaluation', element: <Evaluation /> },
      { path: '/project-center/:trainingId/progress', element: <ProjectProgressPage /> },
      { path: '/profile', element: <Profile /> },
      // { path: '/settings', element: <Settings /> },
      // { 
      //   path: '/data-management', 
      //   element: <AdminRoute><DataManagement /></AdminRoute> 
      // },
      // { 
      //   path: '/project-management', 
      //   element: <AdminRoute><ProjectManagement /></AdminRoute> 
      // },
    ],
  },

  // 帮助文档路由 (无任何布局，独立页面)
  {
    path: '/help',
    element: <Help />,
  },
  
  // 认证页面路由 (无任何布局) - 已登录用户重定向
  {
    element: <BlankLayout />,
    children: [
      { 
        path: '/user/login', 
        element: (
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        ) 
      },
      { 
        path: '/user/register', 
        element: (
          <RedirectIfAuthenticated>
            <Register />
          </RedirectIfAuthenticated>
        ) 
      },
    ],
  },

  // 404页面
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
