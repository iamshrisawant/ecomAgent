// client/src/pages/Dashboard.jsx
import React, { useState } from 'react';
import TicketsTab from '../components/dashboard/TicketsTab';
import '../styles/Dashboard.css';

// --- ADDED (PRIORITY 2) ---
import EscalationsTab from '../components/dashboard/EscalationsTab';
import SuggestionsTab from '../components/dashboard/SuggestionsTab';
// --- END ADDED ---

function Dashboard() {
    const [activeTab, setActiveTab] = useState('tickets');

    return (
        <div className="dashboard-container">
            <h1>Agent Dashboard</h1>
            <div className="dashboard-tabs">
                <button 
                    className={activeTab === 'tickets' ? 'active' : ''} 
                    onClick={() => setActiveTab('tickets')}
                >
                    🎟️ Tickets
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
            </div>
            <div className="dashboard-content">
                {activeTab === 'tickets' && <TicketsTab />}
                
                {/* --- UPDATED (PRIORITY 2) --- */}
                {activeTab === 'escalations' && <EscalationsTab />}
                {activeTab === 'suggestions' && <SuggestionsTab />}
                {/* --- END UPDATED --- */}
            </div>
        </div>
    );
}

export default Dashboard;