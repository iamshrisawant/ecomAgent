// client/src/App.js
import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, Navigate, Outlet } from 'react-router-dom';
import axios from 'axios';
import ChatWindow from './components/ChatWindow';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import './App.css';
import setAuthToken from './services/setAuthToken';

// This component is the "customer" storefront.
// It's a "dumb" component that assumes you are a logged-in customer.
function HomePage() {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const authToken = localStorage.getItem('token');
    const customerId = localStorage.getItem('customerId');

    return (
        <div className="App">
            <header className="App-header">
                <h1 style={{ fontSize: '24px', color: 'var(--primary-color)', margin: 0 }}>
                    ecomagent
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span>Welcome, Customer {customerId}!</span>
                    <Link to="/logout" style={{ 
                        padding: '8px 12px', 
                        background: '#dc3545', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: 'pointer',
                        textDecoration: 'none'
                    }}>
                        Logout
                    </Link>
                </div>
            </header>

            <main className="homepage-container">
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <h2>Your E-Commerce Storefront</h2>
                    <p>This is the main customer-facing page.</p>
                </div>
            </main>

            <button 
                onClick={() => setIsChatOpen(true)} 
                className="chat-fab"
                title="Open Support Chat"
            >
                💬
            </button>

            <ChatWindow
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                token={authToken}
            />
        </div>
    );
}


// This component "gates" our protected content
const ProtectedRoute = () => {
    const token = localStorage.getItem('token');
    
    // Set auth token on every load
    useEffect(() => {
        if (token) {
            setAuthToken(token);
        }
    }, [token]);

    if (!token) {
        // If no token, redirect to login
        return <Navigate to="/login" replace />;
    }

    // If token exists, render the child routes (e.g., HomePage or Dashboard)
    return <Outlet />;
};

// This component handles the redirection logic
const RoleBasedRedirect = () => {
    const role = localStorage.getItem('role');

    if (role === 'AGENT') {
        return <Navigate to="/dashboard" replace />;
    }
    
    // Default to customer homepage
    return <Navigate to="/home" replace />;
};

// This component handles logging out
const Logout = () => {
    const navigate = useNavigate();
    useEffect(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('customerId');
        setAuthToken(null);
        navigate('/login', { replace: true });
    }, [navigate]);

    return null; // This component just redirects
};


// The main App component now just handles routing
function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/logout" element={<Logout />} />

            {/* All private routes are children of ProtectedRoute */}
            <Route element={<ProtectedRoute />}>
                <Route path="/home" element={<HomePage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                
                {/* Root path '/' redirects based on role */}
                <Route path="/" element={<RoleBasedRedirect />} />
            </Route>

            {/* Catch-all for any other route, redirect to login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    );
}

export default App;