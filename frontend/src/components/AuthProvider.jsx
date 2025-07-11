import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { getStoredToken, getStoredUserInfo, clearUserInfo } from '@/utils/auth';

const AuthProvider = ({ children }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token, userInfo } = useSelector(state => state.user);

  useEffect(() => {
    const validateAndSyncAuth = () => {
      const storedToken = getStoredToken();
      const storedUserInfo = getStoredUserInfo();

      if (!storedToken || !storedUserInfo) {
        // 没有存储的认证信息，确保Redux状态为空
        if (token || userInfo) {
          // 如果Redux中有数据但localStorage中没有，清除Redux状态
          dispatch({ type: 'user/logoutUser/fulfilled' });
        }
        return;
      }

      // 验证token是否过期
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        const currentTime = Date.now() / 1000;

        if (payload.exp < currentTime) {
          // Token已过期，清除所有认证信息
          clearUserInfo();
          dispatch({ type: 'user/logoutUser/fulfilled' });
          console.log('Token已过期，已清除认证信息');
          return;
        }

        // Token有效，确保Redux状态与localStorage同步
        if (!token || !userInfo) {
          dispatch({
            type: 'user/loginUser/fulfilled',
            payload: {
              token: storedToken,
              user: storedUserInfo
            }
          });
        }
      } catch (error) {
        console.error('Token验证失败:', error);
        clearUserInfo();
        dispatch({ type: 'user/logoutUser/fulfilled' });
      }
    };

    // 在组件挂载时验证认证状态
    validateAndSyncAuth();
  }, [dispatch, token, userInfo]);

  return children;
};

export default AuthProvider; 