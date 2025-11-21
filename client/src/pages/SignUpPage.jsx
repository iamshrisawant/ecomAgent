// client/src/pages/SignupPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import setAuthToken from '../services/setAuthToken';
import '../styles/LoginPage.css'; // Reuse the Login styles for consistency

function SignupPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // Redirect if already logged in
    useEffect(() => {
        if (localStorage.getItem('token')) {
            navigate('/', { replace: true });
        }
    }, [navigate]);

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Call the new Signup endpoint
            const res = await axios.post('/api/auth/signup', { name, email, password });
            const { token, customerId, role } = res.data;

            // Save data (Auto-Login)
            localStorage.setItem('token', token);
            localStorage.setItem('role', role);
            localStorage.setItem('customerId', customerId);
            setAuthToken(token);

            // Redirect to Home
            navigate('/home', { replace: true });

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <form className="login-form" onSubmit={handleSignup}>
                <h1 style={{ color: 'var(--primary-color)' }}>ecomagent</h1>
                <h2>Create Account</h2>
                
                <div className="input-group">
                    <label htmlFor="name">Full Name</label>
                    <input 
                        type="text" 
                        id="name"
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        placeholder="John Doe" 
                        required 
                    />
                </div>

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
                        placeholder="Choose a password" 
                        required 
                    />
                </div>

                <button type="submit" className="login-button" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Sign Up'}
                </button>

                {error && <p className="login-error">{error}</p>}

                <div className="customer-link">
                    Already have an account? <Link to="/login">Login here</Link>
                </div>
            </form>
        </div>
    );
}

export default SignupPage;