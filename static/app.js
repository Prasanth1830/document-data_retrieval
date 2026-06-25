document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const uploadProgressContainer = document.getElementById('upload-progress-container');
    const uploadProgressFill = document.getElementById('upload-progress-fill');
    const uploadProgressText = document.getElementById('upload-progress-text');
    
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    const btnClear = document.getElementById('btn-clear');
    
    const btnEval = document.getElementById('btn-eval');
    const evalLoader = document.getElementById('eval-loader');
    const badgeConfig = document.getElementById('config-status-badge');
    const statusText = document.getElementById('status-text');
    const envModal = document.getElementById('env-modal');
    
    let isConfigured = false;
    let selectedDoc = null;
    let traceIdCounter = 0;

    // Check Configuration
    async function checkConfig() {
        try {
            const resp = await fetch('/api/config');
            const data = await resp.json();
            
            const dot = badgeConfig.querySelector('.status-dot');
            if (data.status === 'configured') {
                dot.className = 'status-dot success';
                statusText.textContent = `Connected: Index "${data.index_name}"`;
                isConfigured = true;
                envModal.style.display = 'none';
                enableControls(true);
                loadSources();
            } else {
                dot.className = 'status-dot warning';
                statusText.textContent = 'Configuration Pending';
                isConfigured = false;
                envModal.style.display = 'flex';
                enableControls(false);
            }
        } catch (e) {
            console.error('Failed checking configuration', e);
            statusText.textContent = 'Offline (Server Disconnected)';
            enableControls(false);
        }
    }

    function enableControls(enable) {
        chatInput.disabled = !enable;
        btnSend.disabled = !enable;
        btnEval.disabled = !enable;
    }

    // Load sources
    async function loadSources() {
        if (!isConfigured) return;
        try {
            const resp = await fetch('/api/sources');
            const data = await resp.json();
            
            fileList.innerHTML = '';
            if (data.documents.length === 0) {
                fileList.innerHTML = '<li class="empty-list-placeholder">No documents uploaded yet.</li>';
                btnEval.disabled = true;
            } else {
                data.documents.forEach(doc => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span class="file-item-name"><i class="fa-solid fa-file-pdf"></i> ${doc}</span>
                        <span class="file-item-status"><i class="fa-solid fa-circle-check"></i></span>
                    `;
                    li.addEventListener('click', () => {
                        document.querySelectorAll('.file-list li').forEach(el => el.classList.remove('active'));
                        li.classList.add('active');
                        selectedDoc = doc;
                    });
                    fileList.appendChild(li);
                });
                
                // If there are logs in chat history, enable evaluation
                if (data.chat_count > 0) {
                    btnEval.disabled = false;
                }
            }
        } catch (e) {
            console.error('Error fetching sources', e);
        }
    }

    // Drag & Drop
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleUpload(fileInput.files[0]);
        }
    });

    // Upload PDF
    async function handleUpload(file) {
        if (!file.name.endsWith('.pdf')) {
            alert('Please select a PDF document.');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        uploadProgressContainer.style.display = 'block';
        uploadProgressFill.style.width = '0%';
        uploadProgressText.textContent = 'Uploading file...';
        
        try {
            // Animate progress up to 90%
            let progress = 10;
            const progressInterval = setInterval(() => {
                progress = Math.min(90, progress + 10);
                uploadProgressFill.style.width = `${progress}%`;
                uploadProgressText.textContent = progress < 50 ? 'Parsing document paragraphs...' : 'Generating embeddings & saving vectors...';
            }, 400);

            const resp = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            clearInterval(progressInterval);
            
            if (resp.ok) {
                const result = await resp.json();
                uploadProgressFill.style.width = '100%';
                uploadProgressText.textContent = 'Ingested successfully!';
                
                setTimeout(() => {
                    uploadProgressContainer.style.display = 'none';
                    loadSources();
                }, 1500);
                
                addSystemMessage(`Successfully ingested <strong>${result.filename}</strong>. It has been chunked and securely stored in your Pinecone index.`);
            } else {
                const error = await resp.json();
                throw new Error(error.detail || 'Inbound processing error');
            }
        } catch (e) {
            uploadProgressContainer.style.display = 'none';
            alert(`File Ingestion Failed: ${e.message}`);
        }
    }

    // Helper functions for Chat Messages
    function addSystemMessage(htmlText) {
        const msg = document.createElement('div');
        msg.className = 'message system';
        msg.innerHTML = `
            <div class="avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-content">
                <p>${htmlText}</p>
            </div>
        `;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatText(text) {
        // Simple Markdown formats: Bold and newlines
        let formatted = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
        // Style citations
        const citationRegex = /\[([^\]]+)\]/g;
        return formatted.replace(citationRegex, (match, content) => {
            return `<span class="citation" title="${content}">[${content}]</span>`;
        });
    }

    function addChatBubble(query, answer, traces) {
        // Add User message
        const userMsg = document.createElement('div');
        userMsg.className = 'message user';
        userMsg.innerHTML = `
            <div class="avatar"><i class="fa-solid fa-user"></i></div>
            <div class="message-content">
                <p>${formatText(query)}</p>
            </div>
        `;
        chatMessages.appendChild(userMsg);

        // Add Assistant message with traces
        const assistantMsg = document.createElement('div');
        assistantMsg.className = 'message system';
        
        const traceId = `trace-${traceIdCounter++}`;
        
        let traceHTML = '';
        if (traces && traces.length > 0) {
            traceHTML = `
                <div class="trace-accordion">
                    <div class="trace-title" onclick="document.getElementById('${traceId}').classList.toggle('active')">
                        <span><i class="fa-solid fa-route"></i> View Grounded Retrieval Traces</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </div>
                    <div class="trace-body" id="${traceId}">
                        ${traces.map(t => `
                            <div class="trace-item">
                                <div class="trace-item-header">
                                    <span>${t.document_name} (Page ${t.page_number})</span>
                                    <span class="trace-item-score"><i class="fa-solid fa-bullseye"></i> Similarity: ${t.score}</span>
                                </div>
                                <div class="trace-item-text">"...${t.text}..."</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        assistantMsg.innerHTML = `
            <div class="avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-content">
                <p>${formatText(answer)}</p>
                ${traceHTML}
            </div>
        `;
        chatMessages.appendChild(assistantMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Query Document
    async function submitQuery() {
        const queryText = chatInput.value.trim();
        if (!queryText) return;
        
        chatInput.value = '';
        enableControls(false);
        
        try {
            const resp = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: queryText,
                    document_name: selectedDoc
                })
            });
            
            if (resp.ok) {
                const data = await resp.json();
                addChatBubble(queryText, data.answer, data.traces);
                btnEval.disabled = false; // Enable evaluations after queries
            } else {
                const error = await resp.json();
                throw new Error(error.detail || 'Inquiry retrieval failure');
            }
        } catch (e) {
            alert(`Query Failed: ${e.message}`);
        } finally {
            enableControls(true);
            chatInput.focus();
        }
    }

    // Radial Gauge Updates
    function setRadialScore(id, score) {
        const circle = document.getElementById(id);
        const textVal = document.getElementById('val-' + id.split('-')[1]);
        
        if (!circle) return;
        
        if (score === null || score === undefined) {
            textVal.textContent = '-';
            circle.style.strokeDashoffset = '213.6';
            return;
        }
        
        const percent = Math.min(100, Math.max(0, Math.round(score * 100)));
        textVal.textContent = percent + '%';
        
        const offset = 213.6 - (percent / 100) * 213.6;
        circle.style.strokeDashoffset = offset;
    }

    // Run Ragas
    async function runRagas() {
        btnEval.disabled = true;
        evalLoader.style.display = 'flex';
        
        // Reset gauges
        setRadialScore('score-faithfulness', null);
        setRadialScore('score-relevance', null);
        setRadialScore('score-precision', null);
        setRadialScore('score-recall', null);

        try {
            const resp = await fetch('/api/evaluate', {
                method: 'POST'
            });
            
            if (resp.ok) {
                const result = await resp.json();
                
                // Animate metric display
                setRadialScore('score-faithfulness', result.scores.faithfulness);
                setRadialScore('score-relevance', result.scores.answer_relevance);
                setRadialScore('score-precision', result.scores.context_precision);
                setRadialScore('score-recall', result.scores.context_recall);
                
            } else {
                const error = await resp.json();
                throw new Error(error.detail || 'Evaluation run error');
            }
        } catch (e) {
            alert(`Ragas Evaluation Failed: ${e.message}`);
        } finally {
            evalLoader.style.display = 'none';
            btnEval.disabled = false;
        }
    }

    // Clear logs
    async function clearLogs() {
        if (!confirm('Are you sure you want to clear the chat and Ragas scores history?')) return;
        try {
            await fetch('/api/clear', { method: 'POST' });
            chatMessages.innerHTML = `
                <div class="message system">
                    <div class="avatar"><i class="fa-solid fa-robot"></i></div>
                    <div class="message-content">
                        <p>Chat logs cleared. System is reset and ready for new questions.</p>
                    </div>
                </div>
            `;
            setRadialScore('score-faithfulness', null);
            setRadialScore('score-relevance', null);
            setRadialScore('score-precision', null);
            setRadialScore('score-recall', null);
            btnEval.disabled = true;
        } catch (e) {
            console.error('Failed clearing logs', e);
        }
    }

    // Listeners
    btnSend.addEventListener('click', submitQuery);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitQuery();
    });
    
    btnEval.addEventListener('click', runRagas);
    btnClear.addEventListener('click', clearLogs);

    // Initial check
    checkConfig();
});
