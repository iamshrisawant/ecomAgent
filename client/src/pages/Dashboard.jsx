// client/src/pages/Dashboard.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom'; 
import TicketsTab from '../components/dashboard/TicketsTab';
import EscalationsTab from '../components/dashboard/EscalationsTab';
import SuggestionsTab from '../components/dashboard/SuggestionsTab';
import ActiveIntentsTab from '../components/dashboard/ActiveIntentsTab'; // [NEW IMPORT]
import ChatWindow from '../components/ChatWindow';
import '../styles/Dashboard.css';

function Dashboard() {
    const [activeTab, setActiveTab] = useState('tickets');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const authToken = localStorage.getItem('token');

    const renderTabContent = () => {
        switch(activeTab) {
            case 'tickets':
                return <TicketsTab />;
            case 'escalations':
                return <EscalationsTab />;
            case 'suggestions':
                return <SuggestionsTab />;
            case 'active': // [NEW CASE]
                return <ActiveIntentsTab />;
            default:
                return <TicketsTab />;
        }
    };

    return (
        <div className="dashboard-layout">
            {/* Sidebar Navigation */}
            <aside className="dashboard-sidebar">
                <div className="dashboard-nav-top">
                    <h2 style={{ color: 'var(--primary-color)', textAlign: 'center' }}>
                        ecomagent
                    </h2>
                    <nav className="dashboard-nav">
                        <button 
                            className={activeTab === 'tickets' ? 'active' : ''} 
                            onClick={() => setActiveTab('tickets')}
                        >
                            🎟️ All Tickets
                        </button>
                        <button 
                            className={activeTab === 'escalations' ? 'active' : ''} 
                            onClick={() => setActiveTab('escalations')}
                        >
                            🚨 Escalations
                        </button>
                        <button 
                            className={activeTab === 'suggestions' ? 'active' : ''} 
                            onClick={() => setActiveTab('suggestions')}
                        >
                            🧠 AI Suggestions
                        </button>
                        {/* [NEW BUTTON] */}
                        <button 
                            className={activeTab === 'active' ? 'active' : ''} 
                            onClick={() => setActiveTab('active')}
                        >
                            📚 Active Knowledge
                        </button>
                    </nav>
                </div>
                
                <Link to="/logout" className="logout-button">
                    Logout
                </Link>
            </aside>

            {/* Main Content Area */}
            <main className="dashboard-main-content">
                {renderTabContent()}
            </main>

            {/* Agent's Chat Button (FAB) */}
            <button 
                onClick={() => setIsChatOpen(true)} 
                className="chat-fab"
                title="Open Chat with AI"
            >
                🤖
            </button>

            {/* Agent's Chat Window */}
            <ChatWindow
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                token={authToken}
            />
        </div>
    );
}

export default Dashboard;