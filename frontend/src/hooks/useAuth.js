import { useSelector } from 'react-redux';
import { getStoredToken, getStoredUserInfo, validateToken } from '@/utils/auth';

export function useAuth() {
  const { token, userInfo } = useSelector(state => state.user);
  
  // 检查token是否存在且有效
  const checkTokenValidity = () => {
    const storedToken = getStoredToken();
    const storedUserInfo = getStoredUserInfo();
    
    if (!storedToken || !storedUserInfo) {
      return false;
    }
    
    const validation = validateToken(storedToken);
    if (!validation.isValid) {
      // 清除无效的认证信息
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      localStorage.removeItem('tokenInfo');
      return false;
    }
    
    return true;
  };
  
  // 优先使用Redux store中的数据，如果为空则检查localStorage
  const isAuthenticated = token && userInfo ? true : checkTokenValidity();
  
  return isAuthenticated;
} 