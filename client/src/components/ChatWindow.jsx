import React, { useState, useEffect, useRef } from 'react';
import '../styles/ChatWindow.css';
import socketService from '../services/socketService';

function ChatWindow({ isOpen, onClose, token }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const chatBodyRef = useRef(null);

    useEffect(() => {
        if (isOpen && token) {
            setMessages([]);
            const handleNewMessage = (message) => {
                setMessages(prevMessages => [...prevMessages, message]);
            };
            socketService.connect(handleNewMessage, token);
        }
        return () => {
            if (isOpen) {
                socketService.disconnect();
            }
        };
    }, [isOpen, token]);

    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (newMessage.trim() === '') return;
        const userMessage = { id: Date.now(), text: newMessage, sender: 'user' };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        socketService.sendMessage(newMessage);
        setNewMessage('');
    };

    if (!isOpen) return null;

    return (
        <div className="chat-window" onClick={(e) => e.stopPropagation()}>
            <div className="chat-header">
                {/* New Avatar and Status */}
                <div className="chat-header-info">
                    <div className="chat-avatar">
                        <div className="chat-status-dot"></div>
                    </div>
                    <div>
                        <h2>Support Chat</h2>
                        <p className="chat-status-text">We're online</p>
                    </div>
                </div>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="chat-body" ref={chatBodyRef}>
                {messages.map((message) => (
                    <div key={message.id} className={`message-wrapper ${message.sender}`}>
                        <div className={`message ${message.sender}`}>
                            <p>{message.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            <form className="chat-footer" onSubmit={handleSendMessage}>
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                />
                {/* Changed button to an icon */}
                <button type="submit" className="send-btn" title="Send">➤</button>
            </form>
        </div>
    );
}

export default ChatWindow;