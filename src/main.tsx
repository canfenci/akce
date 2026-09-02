import ReactDOM from 'react-dom/client';
import App from './App';
import { AkceStoreProvider } from './store/AkceStore';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AkceStoreProvider><App /></AkceStoreProvider>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
}
