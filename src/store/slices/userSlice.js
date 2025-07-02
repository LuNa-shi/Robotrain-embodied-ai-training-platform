import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { loginAPI, logoutAPI, getCurrentUserAPI, storeUserInfo, clearUserInfo, getStoredToken, getStoredUserInfo } from '@/utils/auth';

// 异步action：登录
export const loginUser = createAsyncThunk(
  'user/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await loginAPI(username, password);
      console.log('登录成功，获取到token:', response.access_token.substring(0, 20) + '...');
      
      // 先存储token到localStorage，这样getCurrentUserAPI才能找到token
      storeUserInfo(response.access_token, response.token_type);
      console.log('Token已存储到localStorage');
      
      // 登录成功后，调用新的API获取用户信息（包含管理员状态）
      let userInfo = {
        username: username,
        role: 'user',
        isAdmin: false
      };
      
      try {
        // 调用 /api/users/me 获取完整的用户信息
        const userResponse = await getCurrentUserAPI();
        userInfo = {
          id: userResponse.id,
          username: userResponse.username,
          role: userResponse.is_admin ? 'admin' : 'user',
          isAdmin: userResponse.is_admin,
          created_at: userResponse.created_at,
          last_login: userResponse.last_login
        };
        
        // 更新localStorage中的用户信息
        storeUserInfo(response.access_token, response.token_type, userInfo);
      } catch (userError) {
        console.warn('获取用户信息失败，使用默认信息:', userError);
        // 如果获取用户信息失败，尝试从JWT token中解析基本信息
        try {
          const payload = JSON.parse(atob(response.access_token.split('.')[1]));
          userInfo = {
            id: payload.user_id || payload.sub || payload.id,
            username: payload.username || username,
            role: payload.role || 'user',
            isAdmin: payload.is_admin || payload.admin || false,
            exp: payload.exp,
            iat: payload.iat
          };
          
          // 更新localStorage中的用户信息
          storeUserInfo(response.access_token, response.token_type, userInfo);
        } catch (parseError) {
          console.warn('无法从JWT token解析用户信息:', parseError);
        }
      }
      
      return {
        token: response.access_token,
        user: userInfo
      };
    } catch (error) {
      return rejectWithValue(error.message || '登录失败');
    }
  }
);

// 异步action：登出
export const logoutUser = createAsyncThunk(
  'user/logout',
  async (_, { rejectWithValue }) => {
    try {
      // 执行前端登出处理
      const result = await logoutAPI();
      
      // 清除本地存储
      clearUserInfo();
      
      // 返回结果信息
      return result;
    } catch (error) {
      // 即使处理失败，也要清除本地存储
      clearUserInfo();
      console.error('Logout error:', error);
      return rejectWithValue('登出处理失败，但已清除本地数据');
    }
  }
);

// 异步action：获取当前用户信息
export const fetchCurrentUser = createAsyncThunk(
  'user/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await getCurrentUserAPI();
      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || '获取用户信息失败');
    }
  }
);

// 初始化状态，从localStorage读取
const initialState = {
  token: getStoredToken(),
  userInfo: getStoredUserInfo(),
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    // 清除错误信息
    clearError: (state) => {
      state.error = null;
    },
    // 更新用户信息
    updateUserInfo: (state, action) => {
      state.userInfo = { ...state.userInfo, ...action.payload };
      // 同时更新localStorage
      if (state.userInfo) {
        localStorage.setItem('userInfo', JSON.stringify(state.userInfo));
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // 登录
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.userInfo = action.payload.user;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // 登出
      .addCase(logoutUser.fulfilled, (state) => {
        state.token = null;
        state.userInfo = null;
        state.error = null;
      })
      // 获取当前用户
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userInfo = action.payload;
        state.error = null;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // 如果获取用户信息失败，可能是token过期，清除状态
        state.token = null;
        state.userInfo = null;
      });
  },
});

export const { clearError, updateUserInfo } = userSlice.actions;
export default userSlice.reducer;
