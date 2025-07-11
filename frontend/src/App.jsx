import React from 'react';
import { useRoutes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import routes from './config/routes';
import AuthProvider from './components/AuthProvider';

function App() {
  const backendServer = import.meta.env.VITE_BACNEND_SERVER;
  const backendPort = import.meta.env.VITE_BACKEND_PORT;
  const element = useRoutes(routes);
  return (
    <AntApp>
      <AuthProvider>
        {element}
      </AuthProvider>
    </AntApp>
  );
}

export default App;