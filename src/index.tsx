import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createStore, applyMiddleware } from 'redux';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import nextTick from 'next-tick';

import reducer from './reducer';
import App from './components/App';

window.process = { nextTick: (callback: any, ...args: any) => nextTick(() => callback(...args)) } as any;

const appStore = createStore(reducer, applyMiddleware(thunk));
const app = document.getElementById('app');
ReactDOM.render(
  <Provider store={appStore}>
    <App/>
  </Provider>,
  app,
);
