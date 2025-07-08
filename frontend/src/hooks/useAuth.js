import { useSelector } from 'react-redux';

export function useAuth() {
  const { token, userInfo } = useSelector(state => state.user);
  return !!(token && userInfo);
} 