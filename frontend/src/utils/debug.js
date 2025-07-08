// 调试工具函数
import { getStoredToken, getStoredUserInfo } from './auth';

// 检查localStorage中的用户信息
export const debugUserInfo = () => {
  console.log('=== 调试用户信息 ===');
  
  const token = getStoredToken();
  const userInfo = getStoredUserInfo();
  
  console.log('Token:', token ? token.substring(0, 20) + '...' : 'null');
  console.log('UserInfo:', userInfo);
  
  // 检查localStorage中的所有相关项
  console.log('localStorage内容:');
  console.log('- token:', localStorage.getItem('token') ? '存在' : '不存在');
  console.log('- userInfo:', localStorage.getItem('userInfo') ? '存在' : '不存在');
  console.log('- tokenInfo:', localStorage.getItem('tokenInfo') ? '存在' : '不存在');
  
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('JWT Token Payload:', payload);
    } catch (error) {
      console.log('JWT Token解析失败:', error);
    }
  }
  
  console.log('=== 调试结束 ===');
};

// 检查Redux store状态
export const debugReduxState = (store) => {
  console.log('=== 调试Redux状态 ===');
  const state = store.getState();
  console.log('User State:', state.user);
  console.log('=== 调试结束 ===');
};

// 模拟API调用测试
export const testAPICall = async () => {
  console.log('=== 测试API调用 ===');
  
  const token = getStoredToken();
  if (!token) {
    console.error('没有找到token，无法测试API调用');
    return;
  }
  
  try {
    // 测试直接调用API
    const response = await fetch('/api/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    console.log('API响应状态:', response.status);
    console.log('API响应头:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('API响应数据:', data);
    } else {
      const errorText = await response.text();
      console.error('API错误响应:', errorText);
    }
  } catch (error) {
    console.error('API调用失败:', error);
  }
  
  console.log('=== 测试结束 ===');
};

// 导出调试函数到全局，方便在浏览器控制台中使用
if (typeof window !== 'undefined') {
  window.debugUserInfo = debugUserInfo;
  window.debugReduxState = debugReduxState;
  window.testAPICall = testAPICall;
} 