import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSelector } from 'react-redux';

// 布局
import BasicLayout from '@/layouts/BasicLayout.jsx';
import BlankLayout from '@/layouts/BlankLayout.jsx'; // 引入空白布局

// 页面
import HomePage from '@/pages/Home/index.jsx'; // 这是新的上传数据页
import Login from '@/pages/User/Login.jsx';
import Register from '@/pages/User/Register.jsx';
import Profile from '@/pages/Profile/index.jsx';
import Settings from '@/pages/Settings/index.jsx';
import Help from '@/pages/Help/index.jsx'; // 引入帮助文档页面
import NotFound from '@/pages/NotFound/index.jsx';
import DataRecords from '@/pages/DataRecords/index.jsx'; // 数据记录页
import TrainingRecords from '@/pages/TrainingRecords/index.jsx'; // 训练记录页
import TrainingDetailPage from '@/pages/TrainingDetail/index.jsx';
import DataManagement from '@/pages/DataManagement/index.jsx'; // 数据管理页
import TrainingManagement from '@/pages/TrainingManagement/index.jsx'; // 训练管理页

// 认证路由保护组件
const AuthRoute = ({ children }) => {
  const isAuth = useAuth();
  if (!isAuth) {
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
      { path: '/training-records', element: <TrainingRecords /> },
      { path: '/data-records', element: <DataRecords /> },
      { path: '/training-records/:trainingId', element: <TrainingDetailPage /> },
      { path: '/profile', element: <Profile /> },
      { path: '/settings', element: <Settings /> },
      { 
        path: '/data-management', 
        element: <AdminRoute><DataManagement /></AdminRoute> 
      },
      { 
        path: '/training-management', 
        element: <AdminRoute><TrainingManagement /></AdminRoute> 
      },
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
