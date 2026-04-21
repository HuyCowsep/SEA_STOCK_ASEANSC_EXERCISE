// Client Socket.io để kết nối tới backend realtime server
import io from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3001';

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity, // Tự động reconnect mãi mãi
});

// Lưu exchange hiện tại để re-subscribe khi reconnect
let _currentExchange: string | null = null;
let _currentExchanges: string[] = [];

/** Cập nhật exchange đang subscribe — gọi từ Dashboard */
export function setCurrentExchange(exchange: string) {
  _currentExchange = exchange;
  _currentExchanges = [];
}

/** Cập nhật nhiều exchange đang subscribe — dùng cho mode danh mục yêu thích */
export function setCurrentExchanges(exchanges: string[]) {
  _currentExchanges = exchanges;
  _currentExchange = null;
}

socket.on('connect', () => {
  console.log('✅ Kết nối backend realtime thành công!');
  // Re-subscribe exchange room sau khi reconnect
  if (_currentExchanges.length > 0) {
    socket.emit('subscribe_exchanges', _currentExchanges);
    console.log(`🔄 Re-subscribe exchanges: ${_currentExchanges.join(', ')}`);
  } else if (_currentExchange) {
    socket.emit('subscribe_exchange', _currentExchange);
    console.log(`🔄 Re-subscribe exchange: ${_currentExchange}`);
  }
});

socket.on('disconnect', (reason: string) => {
  console.log('❌ Mất kết nối backend:', reason);
});

socket.on('error', (err: Error) => {
  console.error('🚨 Lỗi socket:', err);
});

export default socket;
