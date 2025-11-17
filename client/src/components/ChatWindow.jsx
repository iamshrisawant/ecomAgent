import React, { useState, useEffect, useRef } from 'react';
import '../styles/ChatWindow.css';
import socketService from '../services/socketService';

function ChatWindow({ isOpen, onClose, token }) { // Added token to props
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const chatBodyRef = useRef(null);

    useEffect(() => {
        if (isOpen && token) { // Check for token before connecting
            const handleNewMessage = (message) => {
                setMessages(prevMessages => [...prevMessages, message]);
            };
            socketService.connect(handleNewMessage, token); // Pass token
        }
        return () => {
            socketService.disconnect();
            setMessages([]);
        };
    }, [isOpen, token]); // Add token to dependency array

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
        <div className="chat-overlay" onClick={onClose}>
            <div className="chat-window" onClick={(e) => e.stopPropagation()}>
                <div className="chat-header">
                    <h2>Support Chat</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="chat-body" ref={chatBodyRef}>
                    {messages.map((message) => (
                        <div key={message.id} className={`message ${message.sender}`}>
                            <p>{message.text}</p>
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
                    <button type="submit">Send</button>
                </form>
            </div>
        </div>
    );
}

export default ChatWindow;