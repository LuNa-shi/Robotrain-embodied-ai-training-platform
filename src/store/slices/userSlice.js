import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { loginAPI, logoutAPI, getCurrentUserAPI, storeUserInfo, clearUserInfo, getStoredToken, getStoredUserInfo } from '@/utils/auth';

// 异步action：登录
export const loginUser = createAsyncThunk(
  'user/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await loginAPI(username, password);
      // 存储到localStorage
      storeUserInfo(response.token, response.user);
      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || '登录失败');
    }
  }
);

// 异步action：登出
export const logoutUser = createAsyncThunk(
  'user/logout',
  async () => {
    try {
      await logoutAPI();
      // 清除localStorage
      clearUserInfo();
    } catch (error) {
      // 即使API调用失败，也要清除本地存储
      clearUserInfo();
      console.error('Logout error:', error);
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
