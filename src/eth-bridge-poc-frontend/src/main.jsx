import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";

const config = createConfig({
  ssr: false, // Make sure to enable this for server-side rendering (SSR) applications.
  chains: [sepolia],
  connectors: [metaMask()],
  transports: {
    [sepolia.id]: http(),
  },
});

const client = new QueryClient();


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
