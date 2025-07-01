import React from 'react';
import { useRoutes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import routes from './config/routes';

function App() {
  const element = useRoutes(routes);
  return (
    <AntApp>
      {element}
    </AntApp>
  );
}

export default App;