// client/src/components/dashboard/SuggestionsTab.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function SuggestionsTab() {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal State
    const [selectedSuggestion, setSelectedSuggestion] = useState(null);
    const [formData, setFormData] = useState({
        intentName: '',
        description: '',
        entities: ''
    });

    const fetchSuggestions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/dashboard/suggestions');
            setSuggestions(res.data);
        } catch (err) {
            console.error("Failed to fetch suggestions", err);
            setError("Failed to load AI suggestions.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSuggestions();
    }, []);

    // --- MODAL HANDLERS ---
    const openModal = (s) => {
        setFormData({
            intentName: s.proposedIntent || '',
            description: s.proposedDescription || '',
            entities: s.proposedEntities ? s.proposedEntities.join(', ') : ''
        });
        
        // Parse the hypothesis JSON for display
        let parsedHypothesis = null;
        try {
            parsedHypothesis = s.failedHypothesis ? JSON.parse(s.failedHypothesis) : null;
        } catch (e) { /* ignore parse error */ }

        setSelectedSuggestion({ ...s, parsedHypothesis });
    };

    const closeModal = () => {
        setSelectedSuggestion(null);
    };

    // --- ACTIONS ---
    const handleApprove = async () => {
        if (!selectedSuggestion) return;
        try {
            const requiredEntities = formData.entities.split(',').map(e => e.trim()).filter(e => e);
            await axios.post('/api/dashboard/suggestions/approve', {
                id: selectedSuggestion.id,
                intentName: formData.intentName,
                description: formData.description,
                requiredEntities
            });
            alert(`Learned new rule: ${formData.intentName}`);
            closeModal();
            fetchSuggestions();
        } catch (e) { 
            console.error(e);
            alert("Failed to approve."); 
        }
    };

    const handleReject = async () => {
        if (!selectedSuggestion || !window.confirm("Discard this proposal?")) return;
        try {
            await axios.post('/api/dashboard/suggestions/reject', { id: selectedSuggestion.id });
            closeModal();
            fetchSuggestions();
        } catch (e) { 
            console.error(e);
            alert("Failed to reject."); 
        }
    };

    if (loading && !suggestions.length) return <div>Loading AI Suggestions...</div>;
    if (error) return <div style={{color: 'red'}}>{error}</div>;

    return (
        <div className="ticket-list">
            <h2 style={{color: '#28a745'}}>🧠 AI Proposals</h2>
            <p>Review, rectify, and approve new rules suggested by the AI based on resolved escalations.</p>

            {suggestions.length === 0 ? (
                <div style={{padding:'20px', background:'#f8f9fa', borderRadius:'8px', textAlign:'center'}}>
                    <p>No new proposals pending. Great job!</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {suggestions.map((s) => (
                        <div 
                            key={s.id} 
                            className="ticket-card" 
                            style={{ borderLeft: '5px solid #28a745', cursor: 'pointer', transition: 'transform 0.2s' }}
                            onClick={() => openModal(s)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: '0 0 5px', fontSize: '1.1rem' }}>{s.proposedIntent}</h3>
                                <span style={{ fontSize: '1.2rem', color: '#28a745' }}>↗</span>
                            </div>
                            <p style={{ color: '#666', fontSize: '0.9rem', fontStyle: 'italic', margin: '5px 0' }}>
                                {s.proposedDescription}
                            </p>
                            <div style={{ marginTop: '10px', fontSize: '0.85rem', background:'#e8f5e9', padding:'8px', borderRadius:'4px' }}>
                                <strong>Based on: </strong> "{s.query.substring(0, 40)}..."
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- SUGGESTION REVIEW MODAL --- */}
            {selectedSuggestion && (
                <div style={modalOverlayStyle}>
                    <div style={modalStyle}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px'}}>
                            <h2 style={{margin:0}}>Review & Rectify Proposal</h2>
                            <button onClick={closeModal} style={closeBtnStyle}>&times;</button>
                        </div>

                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '25px'}}>
                            {/* LEFT: Context Column */}
                            <div style={{background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef'}}>
                                <h4 style={{marginTop:0, color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px'}}>Analysis Context</h4>
                                
                                <p style={{fontSize:'0.9rem'}}><strong>User Query:</strong><br/>"{selectedSuggestion.query}"</p>
                                
                                {/* --- NEW: FAILED HYPOTHESIS DISPLAY --- */}
                                <div style={{background:'#fff', padding:'10px', borderRadius:'4px', borderLeft:'3px solid #dc3545', margin:'15px 0', boxShadow:'0 2px 4px rgba(0,0,0,0.05)'}}>
                                    <strong style={{color:'#dc3545', fontSize:'0.85rem', display:'block', marginBottom:'5px'}}>❌ Why AI Failed (Hypothesis):</strong>
                                    {selectedSuggestion.parsedHypothesis ? (
                                        <ul style={{margin:'0', paddingLeft:'20px', fontSize:'0.85rem', color:'#444'}}>
                                            <li><strong>Guessed:</strong> {selectedSuggestion.parsedHypothesis.suspectedIntent}</li>
                                            <li><strong>Reason:</strong> {selectedSuggestion.parsedHypothesis.reasoning}</li>
                                        </ul>
                                    ) : (
                                        <p style={{margin:'0', fontStyle:'italic', fontSize:'0.85rem', color:'#999'}}>No hypothesis recorded.</p>
                                    )}
                                </div>

                                <p style={{fontSize:'0.9rem'}}><strong>Human Guidance:</strong><br/>"{selectedSuggestion.plan}"</p>
                            </div>

                            {/* RIGHT: Edit Form Column */}
                            <div>
                                <h4 style={{marginTop:0, color: '#555', borderBottom: '1px solid #ddd', paddingBottom: '5px'}}>Proposed Rule (Editable)</h4>
                                
                                <label style={labelStyle}>Intent Name (ID)</label>
                                <input 
                                    style={inputStyle} 
                                    value={formData.intentName} 
                                    onChange={e => setFormData({...formData, intentName: e.target.value})}
                                />

                                <label style={labelStyle}>Description</label>
                                <textarea 
                                    style={{...inputStyle, height: '80px'}} 
                                    value={formData.description} 
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                />

                                <label style={labelStyle}>Workflow (Entities)</label>
                                <input 
                                    style={inputStyle} 
                                    value={formData.entities} 
                                    onChange={e => setFormData({...formData, entities: e.target.value})}
                                    placeholder="e.g. orderId, reason"
                                />
                                <small style={{color:'#666'}}>Comma-separated list of required data points.</small>
                            </div>
                        </div>

                        <div style={{display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid #eee'}}>
                            <button onClick={handleReject} style={{...btnStyle, background: '#dc3545'}}>Reject</button>
                            <button onClick={handleApprove} style={{...btnStyle, background: '#28a745'}}>Approve & Teach</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- STYLES ---
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' };
const modalStyle = { backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '900px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' };
const inputStyle = { width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9rem', color: '#333' };
const btnStyle = { padding: '10px 20px', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' };
const closeBtnStyle = { background: 'none', border: 'none', fontSize: '2rem', cursor: 'pointer', lineHeight: '1' };

export default SuggestionsTab;