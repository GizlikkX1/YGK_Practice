/* Live board updates over WebSocket + connection state (А6: banner, reconnect in 5 s) */
import { api, onNetworkError } from './api.js';

const RETRY_SECONDS = 5;
const listeners = new Set();

export const connection = {
  online: true,
  countdown: 0,
};

function setState(patch) {
  Object.assign(connection, patch);
  for (const fn of listeners) fn(connection);
}
export function onConnection(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let socket = null;
let socketBoard = null;
let socketUser = null;
let eventHandler = () => {};
let timer = null;
let pingTimer = null;
let intentional = false;

export function openBoardSocket(boardId, userId, onEvent) {
  closeBoardSocket();
  socketBoard = boardId;
  socketUser = userId;
  eventHandler = onEvent;
  connect();
}

export function closeBoardSocket() {
  intentional = true;
  clearInterval(pingTimer);
  if (socket) socket.close();
  socket = null;
  socketBoard = null;
  eventHandler = () => {};
  intentional = false;
}

function connect() {
  if (socketBoard == null) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/boards/${socketBoard}?user_id=${socketUser}`);
  socket = ws;
  ws.onopen = () => {
    const wasOffline = !connection.online;
    stopRetry();
    setState({ online: true, countdown: 0 });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
    if (wasOffline) eventHandler({ type: 'reconnected' });
  };
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type !== 'pong') eventHandler(data);
    } catch { /* ignore */ }
  };
  ws.onclose = (e) => {
    clearInterval(pingTimer);
    if (socket !== ws || intentional) return;
    if (e.code === 4403) return; // no access to the board
    goOffline();
  };
}

function goOffline() {
  if (!connection.online && timer) return;
  setState({ online: false, countdown: RETRY_SECONDS });
  stopRetry();
  timer = setInterval(() => {
    const left = connection.countdown - 1;
    if (left <= 0) {
      setState({ countdown: RETRY_SECONDS });
      tryReconnect();
    } else {
      setState({ countdown: left });
    }
  }, 1000);
}

function stopRetry() { clearInterval(timer); timer = null; }

export async function tryReconnect() {
  try {
    await api.health();
  } catch { return; } // still offline — the timer will try again
  if (socketBoard != null && (!socket || socket.readyState > 1)) {
    connect(); // onopen switches to online and refreshes the board
    return;
  }
  stopRetry();
  setState({ online: true, countdown: 0 });
  eventHandler({ type: 'reconnected' });
}

export function reconnectNow() {
  setState({ countdown: RETRY_SECONDS });
  tryReconnect();
}

onNetworkError(() => goOffline());
