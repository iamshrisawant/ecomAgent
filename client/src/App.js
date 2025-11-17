// client/src/App.js
import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ChatWindow from './components/ChatWindow';
import Dashboard from './pages/Dashboard';
import './App.css';
import setAuthToken from './services/setAuthToken'; // <-- IMPORT THE UTILITY

function HomePage() {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [email, setEmail] = useState('agent101@example.com');
    const [password, setPassword] = useState('password123');
    const [error, setError] = useState('');
    
    // --- START FIX: Auth State from localStorage ---
    // This state is now powered by localStorage to persist logins
    const [authToken, setAuthToken_local] = useState(localStorage.getItem('token'));
    const [userRole, setUserRole] = useState(localStorage.getItem('role'));
    const [customerId, setCustomerId] = useState(localStorage.getItem('customerId'));
    // --- END FIX ---
    
    const navigate = useNavigate();

    // On component mount, set the auth token in axios if it exists
    useEffect(() => {
        if (authToken) {
            setAuthToken(authToken);
        }
    }, [authToken]); // Run when authToken changes

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await axios.post('/api/auth/login', { email, password });
            const { token, customerId, role } = res.data; // Get all data

            // 1. Save all data to localStorage
            localStorage.setItem('token', token);
            localStorage.setItem('role', role);
            localStorage.setItem('customerId', customerId);

            // 2. Set the token in axios headers
            setAuthToken(token);

            // 3. Set local React state to re-render the page
            setAuthToken_local(token);
            setUserRole(role);
            setCustomerId(customerId);

            // 4. Redirect if agent
            if (role === 'AGENT') {
                navigate('/dashboard');
            }
            
        } catch (err) {
            setError('Login failed. Please check your credentials.');
            // Clear all old data on failure
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('customerId');
            setAuthToken(null);
            setAuthToken_local(null);
            setUserRole(null);
            setCustomerId(null);
        }
    };

    const handleLogout = () => {
        // Clear all session data
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('customerId');
        setAuthToken(null);
        setAuthToken_local(null);
        setUserRole(null);
        setCustomerId(null);
        navigate('/'); // Go back to login
    };

    return (
        <div className="App">
            <header className="App-header">
                {!authToken ? (
                    <form onSubmit={handleLogin} style={{ textAlign: 'center' }}>
                        <h2>Login</h2>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ padding: '8px', margin: '5px' }}/>
                        <br />
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={{ padding: '8px', margin: '5px' }}/>
                        <br />
                        <button type="submit" style={{ padding: '10px 20px', marginTop: '10px' }}>Login</button>
                        {error && <p style={{ color: 'red', fontSize: '14px' }}>{error}</p>}
                    </form>
                ) : (
                    <div>
                        {/* Welcome message now respects the role */}
                        <p>Welcome, {userRole === 'AGENT' ? 'Agent' : `Customer ${customerId}`}!</p>
                        
                        {/* --- START FIX: Conditional Rendering --- */}
                        {/* Only show Chat button for CUSTOMER */}
                        {userRole === 'CUSTOMER' && (
                            <button onClick={() => setIsChatOpen(true)} style={{ padding: '10px 20px', fontSize: '16px', margin: '5px' }}>
                                Open Chat 💬
                            </button>
                        )}
                        
                        {/* Only show Dashboard link for AGENT */}
                        {userRole === 'AGENT' && (
                            <div style={{ marginTop: '20px' }}>
                                <Link to="/dashboard" style={{ color: '#61dafb' }}>Go to Agent Dashboard 🕵️</Link>
                            </div>
                        )}
                        {/* --- END FIX --- */}
                        
                        <button onClick={handleLogout} style={{ padding: '10px 20px', fontSize: '16px', margin: '5px', background: '#dc3545' }}>
                            Logout
                        </button>
                    </div>
                )}
            </header>
            <ChatWindow
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                token={authToken}
            />
        </div>
    );
}


// The main App component now just handles routing
function App() {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
    );
}

export default App;