// client/src/components/dashboard/ActiveIntentsTab.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ActiveIntentsTab() {
    const [activeIntents, setActiveIntents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Modal State
    const [selectedIntent, setSelectedIntent] = useState(null);
    const [formData, setFormData] = useState({
        intentName: '',
        description: '',
        entities: ''
    });

    const fetchActiveIntents = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/dashboard/intents/active');
            setActiveIntents(res.data);
        } catch (err) {
            console.error("Failed to fetch active intents", err);
            setError("Failed to load the Knowledge Base.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActiveIntents();
    }, []);

    // --- MODAL HANDLERS ---
    const openModal = (intent) => {
        setFormData({
            intentName: intent.name,
            description: intent.description || '',
            entities: intent.entities ? intent.entities.join(', ') : ''
        });
        setSelectedIntent(intent);
    };

    const closeModal = () => {
        setSelectedIntent(null);
    };

    // --- ACTIONS (Update/Undo) ---
    const handleUpdateLive = async () => {
        if (!selectedIntent) return;
        try {
            const requiredEntities = formData.entities.split(',').map(e => e.trim()).filter(e => e);
            
            await axios.post('/api/dashboard/intents/update', {
                intentName: formData.intentName, // Name is the ID, usually read-only
                description: formData.description,
                requiredEntities
            });
            alert(`Successfully updated workflow: ${formData.intentName}`);
            closeModal();
            fetchActiveIntents();
        } catch (e) { 
            console.error(e);
            alert("Failed to update rule."); 
        }
    };

    const handleUndoLive = async () => {
        const msg = `WARNING: This will DELETE the "${formData.intentName}" workflow.\n\nThe AI will no longer understand this intent.\n\nAre you sure?`;
        if (!selectedIntent || !window.confirm(msg)) return;
        
        try {
            await axios.post('/api/dashboard/intents/delete', { intentName: formData.intentName });
            alert("Workflow deleted.");
            closeModal();
            fetchActiveIntents();
        } catch (e) { 
            console.error(e);
            alert("Failed to delete rule."); 
        }
    };

    if (loading) return <div>Loading Active Knowledge...</div>;
    if (error) return <div style={{color: 'red'}}>{error}</div>;

    return (
        <div className="ticket-list">
            <h2 style={{color: '#007bff'}}>📚 Active Knowledge Base</h2>
            <p>Manage the live rules and workflows currently powering the AI agent.</p>

            {activeIntents.length === 0 ? (
                <div style={{padding:'20px', background:'#f8f9fa', borderRadius:'8px', textAlign:'center'}}>
                    <p>The Knowledge Base is empty. Approve some suggestions to populate it!</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {activeIntents.map((i, idx) => (
                        <div 
                            key={idx} 
                            className="ticket-card" 
                            style={{ borderLeft: '5px solid #007bff', cursor: 'pointer', transition: 'transform 0.2s' }}
                            onClick={() => openModal(i)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: '0 0 5px', fontSize: '1.1rem' }}>{i.name}</h3>
                                <span style={{ fontSize: '1.2rem', color: '#007bff' }}>✎</span>
                            </div>
                            <p style={{ color: '#666', fontSize: '0.9rem', height: '40px', overflow: 'hidden' }}>
                                {i.description || 'No description provided.'}
                            </p>
                            <div style={{ marginTop: '10px', fontSize: '0.85rem', background:'#e3f2fd', padding:'5px', borderRadius:'4px' }}>
                                <strong>Workflow: </strong>
                                {i.entities && i.entities.length > 0 ? i.entities.join(' ➝ ') : 'No Steps'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- ACTIVE INTENT MODAL --- */}
            {selectedIntent && (
                <div style={modalOverlayStyle}>
                    <div style={modalStyle}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
                            <h2 style={{margin:0}}>Manage Active Rule</h2>
                            <button onClick={closeModal} style={closeBtnStyle}>&times;</button>
                        </div>

                        <div style={{marginBottom: '20px'}}>
                            <div style={{background: '#e3f2fd', padding: '15px', borderRadius: '5px', marginBottom: '20px', border: '1px solid #90caf9'}}>
                                <strong>ℹ️ Live Status:</strong> This rule is currently <strong>ACTIVE</strong>. Any changes will immediately affect how the AI handles user queries.
                            </div>

                            <label style={labelStyle}>Intent Name (Read Only)</label>
                            <input 
                                style={{...inputStyle, background: '#e9ecef', cursor: 'not-allowed'}} 
                                value={formData.intentName} 
                                readOnly 
                            />

                            <label style={labelStyle}>Description (Context for AI)</label>
                            <textarea 
                                style={{...inputStyle, height: '80px'}} 
                                value={formData.description} 
                                onChange={e => setFormData({...formData, description: e.target.value})}
                            />

                            <label style={labelStyle}>Workflow Steps (Required Entities)</label>
                            <input 
                                style={inputStyle} 
                                value={formData.entities} 
                                onChange={e => setFormData({...formData, entities: e.target.value})}
                                placeholder="e.g. orderId, reason"
                            />
                            <small style={{color:'#666'}}>Comma-separated list of data points the AI must collect.</small>
                        </div>

                        <div style={{display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px'}}>
                            <button 
                                onClick={handleUndoLive} 
                                style={{...btnStyle, background: '#dc3545'}}
                            >
                                Undo (Delete Rule)
                            </button>
                            <button 
                                onClick={handleUpdateLive} 
                                style={{...btnStyle, background: '#007bff'}}
                            >
                                Save Updates
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Reuse styles for consistency
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' };
const modalStyle = { backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' };
const inputStyle = { width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9rem', color: '#333' };
const btnStyle = { padding: '10px 20px', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' };
const closeBtnStyle = { background: 'none', border: 'none', fontSize: '2rem', cursor: 'pointer', lineHeight: '1' };

export default ActiveIntentsTab;