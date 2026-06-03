// SynapseSwarm Studio App Logic

// Node Swarm State
let nodes = [];
let selectedNodeId = null;
let dragNode = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Authentication & Database State
let currentUser = null;
const API_URL = 'http://localhost:3000/api';

// Default Template Definitions
const templates = {
    concierge: [
        { id: 'triage', name: 'Triage Agent', role: 'triage', prompt: 'Analyze customer message. Detect intent: if it is billing or credit card, route to Technical Support. If it is about discounts, buying, or enterprise sales, route to Sales Negotiator. Otherwise, general info.', temperature: 0.2, nextNodeId: 'sales', x: 50, y: 150 },
        { id: 'sales', name: 'Sales Negotiator', role: 'sales', prompt: 'You handle sales leads and price quotes. If the user wants a discount, offer a maximum of 20% off. Calculate the customized enterprise package based on details.', temperature: 0.8, nextNodeId: 'validator', x: 300, y: 60 },
        { id: 'support', name: 'Technical Support', role: 'support', prompt: 'You diagnose payment failures. If credit card failed, check if card is expired or has insufficient funds. Guide customer on how to retry.', temperature: 0.5, nextNodeId: 'validator', x: 300, y: 260 },
        { id: 'validator', name: 'Swarm Validator', role: 'validator', prompt: 'Verify outbound response. Ensure no sensitive information is leaked, formatting is professional, and instructions match company standards.', temperature: 0.1, nextNodeId: null, x: 550, y: 150 }
    ],
    ecommerce: [
        { id: 'e-triage', name: 'Refund Classifier', role: 'triage', prompt: 'Categorize returns or order issues. Direct payment refunds to Billing Agent, check suspicious behavior using Fraud Analyst.', temperature: 0.3, nextNodeId: 'e-fraud', x: 50, y: 150 },
        { id: 'e-fraud', name: 'Fraud Analyst', role: 'sales', prompt: 'Audit customer account history. Flag transactions > $500 as high risk. Provide security recommendation score.', temperature: 0.4, nextNodeId: 'e-billing', x: 280, y: 60 },
        { id: 'e-billing', name: 'Billing Agent', role: 'support', prompt: 'Process transactions and balance refunds. Query mock order history and execute refund guidelines.', temperature: 0.6, nextNodeId: 'e-validator', x: 280, y: 260 },
        { id: 'e-validator', name: 'Outbound Inspector', role: 'validator', prompt: 'Double check refund confirmation letter before sending details to client simulator.', temperature: 0.2, nextNodeId: null, x: 520, y: 150 }
    ],
    'lead-enricher': [
        { id: 'l-triage', name: 'Lead Classifier', role: 'triage', prompt: 'Parse email contents and grade company size. Route medium/large organizations to Enrichment Bot.', temperature: 0.3, nextNodeId: 'l-enrich', x: 60, y: 160 },
        { id: 'l-enrich', name: 'Enrichment Bot', role: 'enrichment', prompt: 'Scrape mock LinkedIn profile details, check annual revenue indicators, and calculate potential lead valuation.', temperature: 0.7, nextNodeId: 'l-neg', x: 300, y: 160 },
        { id: 'l-neg', name: 'Negotiation Bot', role: 'sales', prompt: 'Develop a personalized sales strategy based on enriched intelligence details.', temperature: 0.9, nextNodeId: null, x: 540, y: 160 }
    ]
};

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCanvas();
    initInspector();
    initSimulator();
    initTemplates();
    initAuth();
    checkActiveSession();
    
    // Load default template to populate the view
    loadSwarmTemplate('concierge');
    updateDashboardInfo();
});

// 1. SPA Navigation Logic
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.content-section');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            btn.classList.add('active');
            const targetSection = document.getElementById(btn.id.replace('btn-', 'section-'));
            if (targetSection) {
                targetSection.classList.add('active');
            }
            
            // Re-render connections if switching to Studio
            if (btn.id === 'btn-studio') {
                setTimeout(renderConnections, 50);
            }
        });
    });

    // Side Drawer Workspace Tabs switcher
    const wTabs = document.querySelectorAll('.w-tab');
    const wContents = document.querySelectorAll('.w-content');
    wTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            wTabs.forEach(t => t.classList.remove('active'));
            wContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const targetContent = document.getElementById(tab.id.replace('tab-', 'content-'));
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    document.getElementById('quick-studio-btn').addEventListener('click', () => {
        document.getElementById('btn-studio').click();
    });
}

// 2. Canvas drag-and-drop and Nodes render Engine
function initCanvas() {
    const canvas = document.getElementById('swarm-canvas');
    
    // Add Node button
    document.getElementById('add-agent-btn').addEventListener('click', () => {
        const id = 'agent-' + Date.now();
        const newNode = {
            id,
            name: 'Agent ' + (nodes.length + 1),
            role: 'support',
            prompt: 'Explain instructions for user support requests clearly.',
            temperature: 0.7,
            nextNodeId: null,
            x: 100 + Math.random() * 150,
            y: 100 + Math.random() * 150
        };
        nodes.push(newNode);
        renderNode(newNode);
        renderConnections();
        updateDashboardInfo();
    });

    // Reset Canvas
    document.getElementById('reset-canvas-btn').addEventListener('click', () => {
        nodes = [];
        canvas.querySelectorAll('.node-card').forEach(n => n.remove());
        renderConnections();
        closeInspector();
        updateDashboardInfo();
    });

    // Handle global mouse up to stop drag
    window.addEventListener('mouseup', () => {
        if (dragNode) {
            dragNode.style.cursor = 'grab';
            dragNode = null;
        }
    });

    // Track mouse dragging moves
    canvas.addEventListener('mousemove', (e) => {
        if (!dragNode) return;
        
        const rect = canvas.getBoundingClientRect();
        let newX = e.clientX - rect.left - dragOffsetX;
        let newY = e.clientY - rect.top - dragOffsetY;
        
        // Bounds checking
        newX = Math.max(10, Math.min(rect.width - 230, newX));
        newY = Math.max(10, Math.min(rect.height - 180, newY));
        
        // Update DOM node
        dragNode.style.left = newX + 'px';
        dragNode.style.top = newY + 'px';
        
        // Update state
        const nodeState = nodes.find(n => n.id === dragNode.dataset.id);
        if (nodeState) {
            nodeState.x = newX;
            nodeState.y = newY;
        }
        
        renderConnections();
    });
}

// Render node element in the canvas
function renderNode(node) {
    const canvas = document.getElementById('swarm-canvas');
    const card = document.createElement('div');
    card.className = 'node-card';
    card.id = `card-${node.id}`;
    card.dataset.id = node.id;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    
    // Set role-based icon
    let icon = 'AG';
    if (node.role === 'triage') icon = 'TR';
    if (node.role === 'sales') icon = 'SL';
    if (node.role === 'support') icon = 'SP';
    if (node.role === 'validator') icon = 'VL';
    if (node.role === 'enrichment') icon = 'ER';

    card.innerHTML = `
        <div class="node-header">
            <div class="node-title-group">
                <span class="node-icon">${icon}</span>
                <span class="node-title">${node.name}</span>
            </div>
            <button class="node-delete-btn" title="Delete node">&times;</button>
        </div>
        <div class="node-body">
            <div class="node-prompt-summary">${node.prompt}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Role: <span style="text-transform: capitalize; color: var(--clr-cyan);">${node.role}</span></div>
        </div>
        <div class="node-ports">
            <div class="port input"></div>
            <div class="port output"></div>
        </div>
    `;

    // Handle Dragging
    card.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('node-delete-btn')) return;
        dragNode = card;
        card.style.cursor = 'grabbing';
        
        const rect = card.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        
        selectNode(node.id);
    });

    // Double click to open Inspector configurations
    card.addEventListener('dblclick', () => {
        selectNode(node.id);
        document.getElementById('tab-config').click();
    });

    // Delete handling
    card.querySelector('.node-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        nodes = nodes.filter(n => n.id !== node.id);
        // Clean references
        nodes.forEach(n => {
            if (n.nextNodeId === node.id) n.nextNodeId = null;
        });
        card.remove();
        renderConnections();
        if (selectedNodeId === node.id) closeInspector();
        updateDashboardInfo();
    });

    canvas.appendChild(card);
}

// Select a node visually and inside Inspector
function selectNode(id) {
    selectedNodeId = id;
    document.querySelectorAll('.node-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.getElementById(`card-${id}`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    openInspector(id);
}

// Draw connection lines on SVG
function renderConnections() {
    const svg = document.getElementById('canvas-connections');
    svg.innerHTML = ''; // Clear SVG
    
    nodes.forEach(node => {
        if (!node.nextNodeId) return;
        
        const nextNode = nodes.find(n => n.id === node.nextNodeId);
        if (!nextNode) return;
        
        // Compute position points
        // Ports location logic: output on the right of source, input on the left of target
        const startX = node.x + 220; // width of card
        const startY = node.y + 70;  // approximate center height
        const endX = nextNode.x;
        const endY = nextNode.y + 70;
        
        // Draw curvy Bezier path
        const controlPoint = Math.abs(endX - startX) * 0.5;
        const pathData = `M ${startX} ${startY} C ${startX + controlPoint} ${startY}, ${endX - controlPoint} ${endY}, ${endX} ${endY}`;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'connection-line');
        path.setAttribute('id', `connection-${node.id}-to-${nextNode.id}`);
        svg.appendChild(path);
    });
}

// 3. Node settings configuration form
function initInspector() {
    const applyBtn = document.getElementById('save-config-btn');
    applyBtn.addEventListener('click', () => {
        if (!selectedNodeId) return;
        
        const node = nodes.find(n => n.id === selectedNodeId);
        if (!node) return;
        
        // Get values
        node.name = document.getElementById('agent-name-input').value;
        node.role = document.getElementById('agent-role-input').value;
        node.prompt = document.getElementById('agent-prompt-input').value;
        node.temperature = parseFloat(document.getElementById('agent-temp-input').value) || 0.7;
        
        const nextNodeVal = document.getElementById('agent-route-input').value;
        node.nextNodeId = nextNodeVal === 'null' ? null : nextNodeVal;
        
        // Update DOM element details
        const card = document.getElementById(`card-${node.id}`);
        if (card) {
            card.querySelector('.node-title').textContent = node.name;
            card.querySelector('.node-prompt-summary').textContent = node.prompt;
            let icon = 'AG';
            if (node.role === 'triage') icon = 'TR';
            if (node.role === 'sales') icon = 'SL';
            if (node.role === 'support') icon = 'SP';
            if (node.role === 'validator') icon = 'VL';
            if (node.role === 'enrichment') icon = 'ER';
            card.querySelector('.node-icon').textContent = icon;
        }
        
        renderConnections();
        updateDashboardInfo();
        closeInspector();
    });
}

function openInspector(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    document.getElementById('config-fields').classList.remove('hidden');
    document.querySelector('.no-node-selected').classList.add('hidden');
    
    document.getElementById('config-node-name').textContent = `Configure: ${node.name}`;
    document.getElementById('agent-name-input').value = node.name;
    document.getElementById('agent-role-input').value = node.role;
    document.getElementById('agent-prompt-input').value = node.prompt;
    document.getElementById('agent-temp-input').value = node.temperature;
    
    // Populate possible targets
    const routeSelect = document.getElementById('agent-route-input');
    routeSelect.innerHTML = '<option value="null">None (Terminator Node)</option>';
    
    nodes.forEach(n => {
        if (n.id !== node.id) {
            const selected = node.nextNodeId === n.id ? 'selected' : '';
            routeSelect.innerHTML += `<option value="${n.id}" ${selected}>${n.name}</option>`;
        }
    });
}

function closeInspector() {
    document.getElementById('config-fields').classList.add('hidden');
    document.querySelector('.no-node-selected').classList.remove('hidden');
    selectedNodeId = null;
    document.querySelectorAll('.node-card').forEach(c => c.classList.remove('selected'));
}

// 4. Templates Loading Engine
function initTemplates() {
    const templateCards = document.querySelectorAll('.template-card');
    templateCards.forEach(card => {
        const btn = card.querySelector('.select-template-btn');
        btn.addEventListener('click', () => {
            const swarmId = card.dataset.swarmId;
            loadSwarmTemplate(swarmId);
            
            // Switch views to visual canvas builder
            document.getElementById('btn-studio').click();
        });
    });
}

function loadSwarmTemplate(id) {
    const canvas = document.getElementById('swarm-canvas');
    canvas.querySelectorAll('.node-card').forEach(n => n.remove());
    closeInspector();
    
    const templateNodes = templates[id] || [];
    // Clone nodes so updates don't alter base configuration values
    nodes = JSON.parse(JSON.stringify(templateNodes));
    
    document.getElementById('active-swarm-name').textContent = 
        id === 'concierge' ? 'Enterprise Concierge Swarm' :
        id === 'ecommerce' ? 'Smart Refund & Dispute Swarm' : 'Lead Scoring & Outreach Swarm';
        
    nodes.forEach(renderNode);
    setTimeout(renderConnections, 100);
    updateDashboardInfo();
}

// 5. Chat Simulator & Cognitive Swarm Execution Engine
function initSimulator() {
    const sendBtn = document.getElementById('chat-send-btn');
    const inputField = document.getElementById('chat-input-field');
    
    const triggerSubmit = () => {
        const text = inputField.value.trim();
        if (!text) return;
        
        inputField.value = '';
        appendMessage(text, 'sent');
        
        // Start Swarm processing sequence
        executeSwarmFlow(text);
    };

    sendBtn.addEventListener('click', triggerSubmit);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerSubmit();
    });
}

function appendMessage(text, type) {
    const chatBody = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = type === 'sent' ? 'msg-sent' : 'msg-received';
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msg.innerHTML = `
        <div class="msg-text">${text}</div>
        <div class="msg-time">${time}</div>
    `;
    
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
}

// Simulates the Swarm execution sequence node by node
async function executeSwarmFlow(query) {
    if (nodes.length === 0) {
        appendMessage("Swarm Error: No active agent nodes found in the workspace.", "received");
        return;
    }

    // Switch right panel to "Execution Trace" to show behind-the-scenes action
    document.getElementById('tab-execution').click();
    
    const traceLog = document.getElementById('execution-trace-log');
    traceLog.innerHTML = `<div class="log-entry system">[${new Date().toLocaleTimeString()}] Swarm triggered by user inquiry. Query: "${query}"</div>`;
    
    // Find the starting node: we look for the triage role, or the leftmost node, or simply nodes[0]
    let currentNode = nodes.find(n => n.role === 'triage') || nodes[0];
    let stepCount = 1;
    let payload = { query: query, context: {} };
    
    // Deactivate previous active card indicators
    document.querySelectorAll('.node-card').forEach(c => c.classList.remove('executing'));
    document.querySelectorAll('.connection-line').forEach(l => l.classList.remove('active'));

    while (currentNode) {
        // Animate node card state to executing
        const card = document.getElementById(`card-${currentNode.id}`);
        if (card) card.classList.add('executing');

        // Log thinking trace
        appendLogEntry('system', `Step ${stepCount}: Delegating task to ${currentNode.name}...`);
        await delay(800); // Thinking delay

        // Swarm logic simulator
        let stepOutput = simulateAgentResponse(currentNode, payload);
        
        appendLogEntry(currentNode.role, `[${currentNode.name}]: Processing instructions...`);
        await delay(500);
        appendLogEntry('thought', `Prompt: "${currentNode.prompt}" (Temp: ${currentNode.temperature})`);
        appendLogEntry(currentNode.role, `Result: ${stepOutput.action}`);
        
        payload.context = { ...payload.context, ...stepOutput.contextData };
        payload.lastResponse = stepOutput.reply;

        // Visual connection flow animation
        const nextNode = nodes.find(n => n.id === currentNode.nextNodeId);
        if (nextNode) {
            const line = document.getElementById(`connection-${currentNode.id}-to-${nextNode.id}`);
            if (line) line.classList.add('active');
        }

        await delay(1000);
        
        // Remove active state animation
        if (card) card.classList.remove('executing');
        
        // Advance logic to next node
        // In template concierge, triage routes to sales or support based on intent
        if (currentNode.id === 'triage' || currentNode.id === 'e-triage' || currentNode.id === 'l-triage') {
            const routeTargetId = stepOutput.routeOverride || currentNode.nextNodeId;
            currentNode = nodes.find(n => n.id === routeTargetId);
        } else {
            currentNode = nextNode;
        }
        
        stepCount++;
    }

    // Final response compiled
    appendLogEntry('system', `Swarm Execution completed successfully. Streaming response to phone client simulator...`);
    await delay(600);
    
    // Append back to live simulator chat
    document.getElementById('tab-simulator').click();
    appendMessage(payload.lastResponse || "Swarm execution terminated without response.", 'received');
    
    // Add transaction to active logs dashboard
    logSwarmTransaction(query, payload.lastResponse);
}

function appendLogEntry(role, text) {
    const traceLog = document.getElementById('execution-trace-log');
    const log = document.createElement('div');
    log.className = `log-entry ${role}`;
    log.textContent = text;
    traceLog.appendChild(log);
    traceLog.scrollTop = traceLog.scrollHeight;
}

// Cognitive logic response mock engine
function simulateAgentResponse(agent, payload) {
    const q = payload.query.toLowerCase();
    
    // Enterprise Concierge Swarm Simulation
    if (agent.id === 'triage') {
        const routeTo = (q.includes('fail') || q.includes('card') || q.includes('error') || q.includes('billing')) ? 'support' : 'sales';
        return {
            action: `Intent detected. RouteOverride -> ${routeTo === 'support' ? 'Technical Support' : 'Sales Negotiator'}`,
            routeOverride: routeTo,
            contextData: { intent: routeTo }
        };
    }
    
    if (agent.id === 'sales') {
        let reply = "Hello, I'd be happy to discuss enterprise deals! We offer specialized packages starting at $299/mo. Because you asked, I can offer an exclusive discount of 20%, bringing it to $239/mo. Would you like to proceed?";
        if (q.includes('enterprise') || q.includes('quote')) {
            reply = "I've drafted a premium Enterprise Package configuration with custom API limits and 24/7 priority support. I can apply a hackathon-special 20% discount on this plan. Let me know if you would like me to lock this in!";
        }
        return {
            action: "Computed customized package structure with 20% discount applied.",
            reply: reply,
            contextData: { discountApplied: '20%', priceVal: '$239/mo' }
        };
    }

    if (agent.id === 'support') {
        return {
            action: "Diagnosed mock billing error. Payment gateway flagged transaction under code 4043.",
            reply: "I looked up your payment transaction details. It seems the card payment was blocked due to a bank authorization mismatch. I recommend attempting payment again with a verified card or using PayPal.",
            contextData: { diagCode: '4043', retryStatus: 'pending' }
        };
    }

    if (agent.id === 'validator') {
        let outbound = payload.lastResponse;
        return {
            action: "Sanitization audit: 0 policy violations detected. Outbound message validated.",
            reply: outbound + " (SynapseSwarm verified)",
            contextData: { verified: true }
        };
    }

    // Generic fallbacks for custom added agents
    return {
        action: `Processed query as agent role: ${agent.role}`,
        reply: `This is a response simulated by Agent "${agent.name}" using role ${agent.role}. Parameters configured: Temperature ${agent.temperature}.`,
        contextData: {}
    };
}

// 6. Dashboard metrics update helpers
function updateDashboardInfo() {
    // Populate dashboard lists
    const agentList = document.getElementById('dashboard-agent-list');
    agentList.innerHTML = '';
    
    nodes.forEach(node => {
        const item = document.createElement('div');
        item.className = 'agent-status-item';
        
        let icon = 'AG';
        if (node.role === 'triage') icon = 'TR';
        if (node.role === 'sales') icon = 'SL';
        if (node.role === 'support') icon = 'SP';
        if (node.role === 'validator') icon = 'VL';
        if (node.role === 'enrichment') icon = 'ER';

        item.innerHTML = `
            <div class="agent-status-avatar">${icon}</div>
            <div class="agent-status-details">
                <div class="agent-status-name">${node.name}</div>
                <div class="agent-status-role">Role: ${node.role}</div>
            </div>
            <div class="agent-state-badge idle">
                <span class="status-indicator online"></span>
                Ready
            </div>
        `;
        agentList.appendChild(item);
    });
}

function logSwarmTransaction(query, reply) {
    const list = document.getElementById('dashboard-activity-log');
    const div = document.createElement('div');
    div.className = 'activity-item';
    
    const time = new Date().toLocaleTimeString();
    div.innerHTML = `
        <span class="activity-time">${time}</span>
        <div class="activity-body">
            <span class="activity-agent triage">Swarm Node Chain</span> executed task for inquiry: "<em>${query}</em>". Outbound response sent to simulator client.
        </div>
    `;
    
    list.prepend(div);
}

// Helper utility delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- DATABASE & USER AUTHENTICATION INTEGRATION ---

function initAuth() {
    // Auth Modal open triggers
    document.getElementById('landing-login-btn').addEventListener('click', openAuthModal);
    document.getElementById('landing-start-btn').addEventListener('click', openAuthModal);
    document.getElementById('hero-cta-btn').addEventListener('click', () => {
        if (currentUser) {
            enterWorkspace();
        } else {
            openAuthModal();
        }
    });
    
    // Auth Modal close
    document.getElementById('close-auth-btn').addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('auth-modal-overlay')) closeAuthModal();
    });

    // Tab switcher
    document.getElementById('tab-login-btn').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('tab-register-btn').addEventListener('click', () => switchAuthTab('register'));

    // Forms submit
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Logout
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // Workspace Pipeline database actions
    document.getElementById('save-pipeline-btn').addEventListener('click', saveCurrentPipeline);
    document.getElementById('user-pipelines-select').addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) loadSelectedPipeline(val);
    });
}

function checkActiveSession() {
    const savedUser = localStorage.getItem('synapse_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        enterWorkspace();
    }
}

function openAuthModal() {
    document.getElementById('auth-modal-overlay').classList.remove('hidden');
    switchAuthTab('login');
}

function closeAuthModal() {
    document.getElementById('auth-modal-overlay').classList.add('hidden');
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginTab = document.getElementById('tab-login-btn');
    const registerTab = document.getElementById('tab-register-btn');
    
    // Clear errors
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('register-error').classList.add('hidden');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Login failed');

        currentUser = { userId: data.userId, username: data.username };
        localStorage.setItem('synapse_user', JSON.stringify(currentUser));
        
        closeAuthModal();
        enterWorkspace();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const errorEl = document.getElementById('register-error');

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Registration failed');

        currentUser = { userId: data.userId, username: data.username };
        localStorage.setItem('synapse_user', JSON.stringify(currentUser));

        closeAuthModal();
        enterWorkspace();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('synapse_user');
    
    // Hide workspace and show landing
    document.getElementById('workspace-container').classList.add('hidden');
    document.getElementById('landing-container').classList.remove('hidden');
    document.body.style.overflow = 'auto'; // allow scrolling landing page
}

function enterWorkspace() {
    document.getElementById('landing-container').classList.add('hidden');
    document.getElementById('workspace-container').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // lock canvas scroll
    
    // Update sidebar profiles
    document.getElementById('user-profile-info').classList.remove('hidden');
    document.getElementById('logged-username').textContent = currentUser.username;
    
    // Enable database pipeline buttons
    document.getElementById('save-pipeline-btn').classList.remove('hidden');
    document.getElementById('user-pipelines-select').classList.remove('hidden');
    
    // Fetch pipelines for select dropdown
    loadUserPipelines();
}

async function saveCurrentPipeline() {
    if (!currentUser) return;
    
    const pipelineName = prompt('Enter a name for this Cognitive Swarm configuration:');
    if (!pipelineName) return;

    try {
        const response = await fetch(`${API_URL}/pipelines/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.userId,
                name: pipelineName,
                nodes: nodes
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to save pipeline');

        alert('Swarm workspace saved successfully!');
        loadUserPipelines(); // reload dropdown
    } catch (err) {
        alert(err.message);
    }
}

async function loadUserPipelines() {
    if (!currentUser) return;
    const select = document.getElementById('user-pipelines-select');

    try {
        const response = await fetch(`${API_URL}/pipelines/${currentUser.userId}`);
        const pipelines = await response.json();
        
        select.innerHTML = '<option value="">Load Swarm...</option>';
        pipelines.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
    } catch (err) {
        console.error('Failed to load user pipelines:', err);
    }
}

async function loadSelectedPipeline(pipelineId) {
    try {
        const response = await fetch(`${API_URL}/pipelines/load/${pipelineId}`);
        const pipeline = await response.json();
        
        if (!response.ok) throw new Error(pipeline.error || 'Failed to fetch pipeline');

        // Clear current canvas
        const canvas = document.getElementById('swarm-canvas');
        canvas.querySelectorAll('.node-card').forEach(n => n.remove());
        closeInspector();
        
        // Load custom nodes graph
        nodes = pipeline.nodes;
        document.getElementById('active-swarm-name').textContent = pipeline.name;
        
        // Render updated canvas
        nodes.forEach(renderNode);
        setTimeout(renderConnections, 100);
        updateDashboardInfo();
    } catch (err) {
        alert(err.message);
    }
}

