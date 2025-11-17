const WS_URL = 'ws://localhost:5000';
let socket = null;

const connect = (onMessageCallback, token) => {
    if (socket && socket.readyState === WebSocket.OPEN) return;
    if (!token) {
        console.error("Authentication token not provided for WebSocket.");
        return;
    }

    socket = new WebSocket(`${WS_URL}?token=${token}`);

    socket.onopen = () => console.log('WebSocket connection established.');
    socket.onmessage = (event) => onMessageCallback(JSON.parse(event.data));
    socket.onclose = () => { console.log('WebSocket connection closed.'); socket = null; };
    socket.onerror = (error) => { console.error('WebSocket Error:', error); socket = null; };
};

const disconnect = () => { if (socket) socket.close(); };
const sendMessage = (message) => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(message); };

const socketService = { connect, disconnect, sendMessage };
export default socketService;