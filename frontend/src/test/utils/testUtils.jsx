import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { vi } from 'vitest';

// Mock Redux store
export const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      user: (state = initialState.user || {}, action) => {
        switch (action.type) {
          case 'user/loginUser/fulfilled':
            return {
              ...state,
              token: action.payload.token,
              userInfo: action.payload.user
            };
          case 'user/logoutUser/fulfilled':
            return {
              ...state,
              token: null,
              userInfo: null
            };
          default:
            return state;
        }
      }
    },
    preloadedState: initialState
  });
};

// Custom render function with providers
export const renderWithProviders = (
  ui,
  {
    preloadedState = {},
    store = createMockStore(preloadedState),
    ...renderOptions
  } = {}
) => {
  const Wrapper = ({ children }) => {
    return (
      <Provider store={store}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </Provider>
    );
  };

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions })
  };
};

// Mock API response helper
export const createMockApiResponse = (data, status = 200) => {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {}
  };
};

// Mock API error helper
export const createMockApiError = (message, status = 500, data = null) => {
  const error = new Error(message);
  error.response = {
    status,
    statusText: 'Error',
    data,
    headers: {},
    config: {}
  };
  return error;
};

// Wait for async operations
export const waitForAsync = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// Mock localStorage helper
export const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

// Setup localStorage mock
export const setupLocalStorageMock = () => {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true
  });
};

// Clear all mocks
export const clearAllMocks = () => {
  vi.clearAllMocks();
  mockLocalStorage.getItem.mockClear();
  mockLocalStorage.setItem.mockClear();
  mockLocalStorage.removeItem.mockClear();
  mockLocalStorage.clear.mockClear();
}; 