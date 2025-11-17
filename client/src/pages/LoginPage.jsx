import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import setAuthToken from '../services/setAuthToken';
import '../styles/LoginPage.css';

function LoginPage() {
    // Start with empty fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // If user is already logged in, redirect them away from this page
    useEffect(() => {
        const token = localStorage.getItem('token');
        const role = localStorage.getItem('role');
        
        if (token && role) {
            if (role === 'AGENT') {
                navigate('/dashboard', { replace: true });
            } else {
                navigate('/', { replace: true });
            }
        }
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await axios.post('/api/auth/login', { email, password });
            const { token, customerId, role } = res.data;

            // 1. Save all data to localStorage
            localStorage.setItem('token', token);
            localStorage.setItem('role', role);
            localStorage.setItem('customerId', customerId);

            // 2. Set the token in axios headers
            setAuthToken(token);

            // 3. Redirect to the correct place based on role
            if (role === 'AGENT') {
                navigate('/dashboard', { replace: true });
            } else {
                navigate('/', { replace: true });
            }
            
        } catch (err) {
            setError('Login failed. Please check your credentials.');
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('customerId');
            setAuthToken(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <form className="login-form" onSubmit={handleLogin}>
                <h1 style={{ color: 'var(--primary-color)' }}>ecomagent</h1>
                <h2>Welcome</h2>
                <div className="input-group">
                    <label htmlFor="email">Email</label>
                    <input 
                        type="email" 
                        id="email"
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        placeholder="Enter your email" 
                        required 
                    />
                </div>
                <div className="input-group">
                    <label htmlFor="password">Password</label>
                    <input 
                        type="password" 
                        id="password"
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        placeholder="Enter your password" 
                        required 
                    />
                </div>
                <button type="submit" className="login-button" disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                </button>
                {error && <p className="login-error">{error}</p>}
            </form>
        </div>
    );
}

export default LoginPage;