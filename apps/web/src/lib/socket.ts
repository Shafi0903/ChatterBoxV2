import { io, Socket } from 'socket.io-client';
import { api, getAccessToken } from './api';

function resolveWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Bypass Next.js HTTP rewrites (which drop WS upgrades) when running directly on port 3000
    if (port === '3000') {
      return `${protocol}//${hostname}:4000`;
    }
    return window.location.origin;
  }
  return 'http://127.0.0.1:4000';
}

let activeSocket: Socket | null = null;
let consecutiveAuthErrors = 0;
const MAX_AUTH_RETRIES = 3;

/**
 * Returns the active Socket.IO instance if connected.
 */
export function getSocket(): Socket | null {
  return activeSocket;
}

/**
 * Proactively updates the token on the active socket instance.
 */
export function updateSocketToken(token: string | null) {
  if (activeSocket) {
    activeSocket.auth = { token };
  }
}

/**
 * Connects the Socket.IO client using the provided JWT access token.
 */
export function connectSocket(token?: string): Socket {
  const authToken = token || getAccessToken();

  if (activeSocket && activeSocket.connected) {
    if (authToken) {
      activeSocket.auth = { token: authToken };
    }
    return activeSocket;
  }

  if (activeSocket) {
    activeSocket.removeAllListeners();
    activeSocket.disconnect();
    activeSocket = null;
  }

  consecutiveAuthErrors = 0;

  activeSocket = io(resolveWsUrl(), {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    autoConnect: true,
  });

  activeSocket.on('connect', () => {
    consecutiveAuthErrors = 0;
  });

  activeSocket.on('connect_error', async (err: any) => {
    const isAuthError =
      err?.message?.includes('token') ||
      err?.message?.includes('Authentication') ||
      err?.data?.code === 'AUTH_ERROR';

    if (isAuthError) {
      if (consecutiveAuthErrors >= MAX_AUTH_RETRIES) {
        disconnectSocket();
        return;
      }

      consecutiveAuthErrors++;

      try {
        const newToken = await api.refresh();
        if (newToken && activeSocket) {
          activeSocket.auth = { token: newToken };
          activeSocket.connect();
        } else {
          disconnectSocket();
        }
      } catch {
        disconnectSocket();
      }
    }
  });

  return activeSocket;
}

/**
 * Cleanly disconnects and tears down the Socket.IO connection.
 */
export function disconnectSocket() {
  if (activeSocket) {
    activeSocket.removeAllListeners();
    activeSocket.disconnect();
    activeSocket = null;
    consecutiveAuthErrors = 0;
  }
}
