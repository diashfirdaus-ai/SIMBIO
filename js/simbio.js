/* ============================================
   SIMBIO — SIMBIO Page JavaScript
   Journal Management, Graph Extraction, RAG Chat
   Menggunakan @google/genai SDK
   ============================================ */

// ============ API Configuration ============
// Menggunakan Vercel Serverless API (/api/generate)

// ============ Journal Registry ============
// Built-in journals from the jurnal/ folder
const builtInJournals = [
    { id: 'jurnal1', name: 'Jurnal 1: Jerawat & C. acnes', file: 'jurnal/jurnal1_jerawat.txt' },
    { id: 'jurnal2', name: 'Jurnal 2: Eksim & S. aureus', file: 'jurnal/jurnal2_eksim.txt' },
    { id: 'jurnal3', name: 'Jurnal 3: Psoriasis & Mikrobioma', file: 'jurnal/jurnal3_psoriasis.txt' }
];

// Uploaded journals (stored in-memory during session)
let uploadedJournals = [];
let pendingUploadFile = null;

// ============ Graph State ============
window.currentGraphData = null;
let network = null;

// Visual Colors for nodes
const typeColors = {
    "Microbe":    { background: '#10b981', border: '#047857', font: 'white' },
    "Condition":  { background: '#f43f5e', border: '#be123c', font: 'white' },
    "Treatment":  { background: '#3b82f6', border: '#1d4ed8', font: 'white' },
    "Metabolite": { background: '#f59e0b', border: '#b45309', font: 'white' },
    "Unknown":    { background: '#64748b', border: '#334155', font: 'white' }
};

// ============ Initialize ============
window.addEventListener('DOMContentLoaded', () => {
    populateJournalSelect();
    initGraph();
    initDragDrop();
    logMsg("Sistem siap. Pilih jurnal atau upload file baru.", "muted");
});

// ============ Journal Select Population ============
function populateJournalSelect() {
    const select = document.getElementById('journalSelect');
    select.innerHTML = '<option value="">-- Ketik / Tempel Manual --</option>';

    if (builtInJournals.length > 0) {
        const builtInGroup = document.createElement('optgroup');
        builtInGroup.label = '📁 Koleksi Jurnal';
        builtInJournals.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.name;
            builtInGroup.appendChild(opt);
        });
        select.appendChild(builtInGroup);
    }

    if (uploadedJournals.length > 0) {
        const uploadGroup = document.createElement('optgroup');
        uploadGroup.label = '📤 Jurnal Upload';
        uploadedJournals.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.name;
            uploadGroup.appendChild(opt);
        });
        select.appendChild(uploadGroup);
    }
}

// ============ Journal Selection Handler ============
window.handleSelectChange = async function () {
    const select = document.getElementById('journalSelect');
    const textInput = document.getElementById('inputText');
    const selectedId = select.value;

    if (!selectedId) {
        textInput.value = '';
        logMsg("Mode input manual.", "info");
        return;
    }

    const builtIn = builtInJournals.find(j => j.id === selectedId);
    if (builtIn) {
        logMsg(`Memuat jurnal: ${builtIn.name}...`, "info");
        try {
            const response = await fetch(builtIn.file);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            textInput.value = text;
            logMsg(`Jurnal berhasil dimuat (${text.length} karakter).`, "success");
        } catch (error) {
            logMsg(`Gagal memuat jurnal: ${error.message}`, "error");
            showToast("Gagal memuat file jurnal. Pastikan server berjalan.");
        }
        return;
    }

    const uploaded = uploadedJournals.find(j => j.id === selectedId);
    if (uploaded) {
        textInput.value = uploaded.content;
        logMsg(`Memuat jurnal upload: ${uploaded.name} (${uploaded.content.length} karakter).`, "success");
    }
};

// ============ PDF.js Worker Setup ============
// Runs after PDF.js CDN script is loaded (window.pdfjsLib is available)
function getPdfjsLib() {
    // PDF.js v3 exposes itself as window['pdfjs-dist/build/pdf'] or pdfjsLib
    return window.pdfjsLib || window['pdfjs-dist/build/pdf'];
}

async function extractTextFromPDF(file) {
    const pdfjsLib = getPdfjsLib();
    if (!pdfjsLib) throw new Error("PDF.js tidak tersedia.");

    // Set worker once
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    logMsg(`PDF dimuat: ${pdf.numPages} halaman.`, "info");

    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    return fullText.trim();
}

// ============ Upload Modal ============
window.openUploadModal = function () {
    document.getElementById('uploadModal').classList.add('open');
    pendingUploadFile = null;
    document.getElementById('uploadFileName').classList.remove('show');
    document.getElementById('confirmUploadBtn').disabled = true;
    document.getElementById('fileInput').value = '';
};

window.closeUploadModal = function () {
    document.getElementById('uploadModal').classList.remove('open');
    pendingUploadFile = null;
};

window.handleFileSelect = function (event) {
    const file = event.target.files[0];
    if (file) processSelectedFile(file);
};

function processSelectedFile(file) {
    const isText = file.name.endsWith('.txt');
    const isPdf  = file.name.endsWith('.pdf') || file.type === 'application/pdf';

    if (!isText && !isPdf) {
        showToast("Hanya file .txt atau .pdf yang didukung.");
        return;
    }
    pendingUploadFile = file;
    const ext = isPdf ? '📕 PDF' : '📄 TXT';
    const fileNameEl = document.getElementById('uploadFileName');
    fileNameEl.textContent = `${ext} ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileNameEl.classList.add('show');
    document.getElementById('confirmUploadBtn').disabled = false;
}

window.confirmUpload = async function () {
    if (!pendingUploadFile) return;

    const confirmBtn = document.getElementById('confirmUploadBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Memproses...';

    const isPdf = pendingUploadFile.name.endsWith('.pdf') || pendingUploadFile.type === 'application/pdf';

    try {
        let content;

        if (isPdf) {
            logMsg(`Mengekstrak teks dari PDF: ${pendingUploadFile.name}...`, "info");
            content = await extractTextFromPDF(pendingUploadFile);
            if (!content || content.length < 50) {
                throw new Error("Teks terlalu sedikit — PDF mungkin berupa gambar/scan.");
            }
        } else {
            content = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload  = e => resolve(e.target.result);
                reader.onerror = () => reject(new Error("Gagal membaca file"));
                reader.readAsText(pendingUploadFile);
            });
        }

        const fileName  = pendingUploadFile.name.replace(/\.(txt|pdf)$/i, '');
        const journalId = `upload_${Date.now()}`;
        const journalName = `${isPdf ? '📕' : '📄'} ${fileName}`;

        uploadedJournals.push({ id: journalId, name: journalName, content });
        populateJournalSelect();

        const select = document.getElementById('journalSelect');
        select.value = journalId;
        document.getElementById('inputText').value = content;

        logMsg(`Upload sukses: "${fileName}" (${content.length} karakter, ${isPdf ? 'PDF' : 'TXT'}).`, "success");
        window.closeUploadModal();

    } catch (err) {
        logMsg(`Gagal upload: ${err.message}`, "error");
        showToast(err.message);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Upload & Muat';
    }
};

// ============ Drag & Drop ============
function initDragDrop() {
    const dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) processSelectedFile(file);
    });
}

// ============ Logger & Toast ============
function logMsg(msg, type = "info") {
    const consoleEl = document.getElementById('consoleLog');
    let colorClass, icon;
    switch (type) {
        case "error":   colorClass = "log-error";   icon = '<i class="fa-solid fa-xmark"></i>';         break;
        case "success": colorClass = "log-success"; icon = '<i class="fa-solid fa-check"></i>';         break;
        case "muted":   colorClass = "log-muted";   icon = '<i class="fa-solid fa-circle-info"></i>';   break;
        default:        colorClass = "log-info";    icon = '<i class="fa-solid fa-angle-right"></i>';   break;
    }
    const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="${colorClass}">${icon} ${msg}</span>`;
    consoleEl.appendChild(entry);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function showToast(msg) {
    const toast = document.getElementById('errorToast');
    document.getElementById('errorToastMsg').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

// ============ Graph Initialization ============
function initGraph(nodesArray = [], edgesArray = []) {
    const container = document.getElementById('mynetwork');
    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);

    const options = {
        nodes: {
            shape: 'box',
            margin: 14,
            font: { size: 14, face: 'Inter, system-ui, sans-serif' },
            borderWidth: 2,
            shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', size: 10, x: 0, y: 4 }
        },
        edges: {
            arrows: { to: { enabled: true, scaleFactor: 0.7 } },
            font: {
                size: 13, align: 'horizontal', face: 'Inter, system-ui, sans-serif',
                background: 'rgba(15, 22, 41, 0.9)', strokeWidth: 0, color: '#94a3b8'
            },
            color: { color: '#334155', highlight: '#6366f1' },
            smooth: { type: 'dynamic' },
            width: 2,
            length: 300
        },
        physics: {
            barnesHut: { gravitationalConstant: -3500, springConstant: 0.02, springLength: 300 },
            stabilization: { iterations: 150 }
        },
        interaction: { hover: true, tooltipDelay: 200 }
    };

    if (network) network.destroy();
    network = new vis.Network(container, { nodes, edges }, options);

    // Lock nodes in place after user drags them so they can arrange the graph to read edges
    network.on("dragStart", function (params) {
        if (params.nodes && params.nodes.length > 0) {
            const updates = params.nodes.map(nodeId => ({ id: nodeId, fixed: false }));
            nodes.update(updates);
        }
    });

    network.on("dragEnd", function (params) {
        if (params.nodes && params.nodes.length > 0) {
            const updates = params.nodes.map(nodeId => ({ id: nodeId, fixed: true }));
            nodes.update(updates);
        }
    });

    // expose network globally so graph-fit-btn works
    window.network = network;
}

// ============ @google/genai — Graph Extraction ============
async function extractGraph(text) {
    const systemPrompt = `Anda adalah sistem ekstraksi Knowledge Graph biomedis spesialis dermatologi dan mikrobioma.
Tugas Anda membaca teks abstrak, mengekstrak entitas penting, dan memetakan relasi (sebab-akibat/korelasi).

Kategori Tipe Entitas yang diizinkan (HANYA INI):
1. "Microbe" (Bakteri/jamur. Contoh: Cutibacterium acnes)
2. "Condition" (Gejala/penyakit/proses biologis. Contoh: Acne Vulgaris, Inflamasi)
3. "Treatment" (Obat/perawatan/probiotik. Contoh: Asam salisilat)
4. "Metabolite" (Senyawa/peptida. Contoh: Peptida antimikroba)

Hasilkan HANYA JSON.`;

    const responseSchema = {
        type: "object",
        properties: {
            entities: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id:    { type: "string" },
                        label: { type: "string" },
                        type:  { type: "string" }
                    },
                    required: ["id", "label", "type"]
                }
            },
            relationships: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        source: { type: "string" },
                        target: { type: "string" },
                        label:  { type: "string" }
                    },
                    required: ["source", "target", "label"]
                }
            }
        },
        required: ["entities", "relationships"]
    };

    const retries = 3;
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text,
                    systemInstruction: systemPrompt,
                    responseSchema: responseSchema
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            return JSON.parse(data.text);
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        }
    }
}

// ============ Extract Button Handler ============
document.getElementById('extractBtn').addEventListener('click', async () => {
    const text = document.getElementById('inputText').value.trim();
    if (!text) {
        showToast("Teks jurnal tidak boleh kosong.");
        return;
    }

    const overlay = document.getElementById('loadingOverlay');
    const btn = document.getElementById('extractBtn');

    overlay.classList.add('active');
    btn.disabled = true;
    document.getElementById('consoleLog').innerHTML = '';
    logMsg("Memulai pemrosesan NLP & Ekstraksi Grafik...", "info");

    try {
        logMsg("Mengirim teks ke Gemini AI...", "info");
        const graphData = await extractGraph(text);
        window.currentGraphData = graphData;

        logMsg(`Ekstraksi sukses: ${graphData.entities.length} node, ${graphData.relationships.length} relasi.`, "success");

        const visNodes = graphData.entities.map(ent => {
            const style = typeColors[ent.type] || typeColors["Unknown"];
            return {
                id: ent.id,
                label: ent.label,
                color: { background: style.background, border: style.border },
                font: { color: style.font },
                title: `Tipe: ${ent.type}`
            };
        });

        const visEdges = graphData.relationships.map(rel => ({
            from: rel.source,
            to: rel.target,
            label: rel.label
        }));

        initGraph(visNodes, visEdges);
        logMsg("Graf berhasil di-render di kanvas.", "success");

        document.getElementById('chatLockOverlay').classList.add('hidden');
        if (!document.getElementById('chatWindow').classList.contains('open')) {
            document.getElementById('chatNotif').classList.add('show');
        }

        // Show Skincare Button
        document.getElementById('skincareBtn').style.display = 'flex';

        graphData.entities.forEach(ent => logMsg(`[${ent.type}] ${ent.label}`, "muted"));

    } catch (error) {
        logMsg("Error ekstraksi: " + error.message, "error");
        showToast("Gagal terhubung ke API AI. Periksa API key & koneksi.");
    } finally {
        overlay.classList.remove('active');
        btn.disabled = false;
    }
});

// ============ Chat Toggle ============
window.toggleChat = function () {
    const chatWindow = document.getElementById('chatWindow');
    const icon = document.getElementById('chatFabIcon');
    const notif = document.getElementById('chatNotif');

    if (chatWindow.classList.contains('open')) {
        chatWindow.classList.remove('open');
        icon.className = 'fa-solid fa-robot';
    } else {
        chatWindow.classList.add('open');
        icon.className = 'fa-solid fa-chevron-down';
        notif.classList.remove('show');
    }
};

// ============ Chat Message Handling ============
window.handleChatKeyPress = function (event) {
    if (event.key === 'Enter') sendChatMessage();
};

function appendMessage(sender, text, id = null) {
    const history = document.getElementById('chatHistory');
    const div = document.createElement('div');
    if (id) div.id = id;

    if (sender === 'user') {
        div.className = 'chat-msg user';
        div.innerHTML = `
            <div class="chat-avatar human"><i class="fa-solid fa-user"></i></div>
            <div class="chat-bubble">${text}</div>`;
    } else if (sender === 'loading') {
        div.className = 'chat-msg';
        div.innerHTML = `
            <div class="chat-avatar bot"><i class="fa-solid fa-robot"></i></div>
            <div class="chat-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>`;
    } else {
        div.className = 'chat-msg';
        const formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        div.innerHTML = `
            <div class="chat-avatar bot"><i class="fa-solid fa-robot"></i></div>
            <div class="chat-bubble">${formatted}</div>`;
    }

    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
}

window.sendChatMessage = async function () {
    const inputEl = document.getElementById('chatInput');
    const message = inputEl.value.trim();
    if (!message) return;

    if (!window.currentGraphData) {
        showToast("Ekstrak graph terlebih dahulu.");
        return;
    }

    inputEl.value = '';
    appendMessage('user', message);

    const sourceText = document.getElementById('inputText').value;
    const contextData = JSON.stringify(window.currentGraphData);

    const systemPrompt = `Anda adalah AI Assistant RAG. Jawablah secara akurat HANYA berdasarkan konteks yang diberikan.
Jika info tidak ada di teks, katakan tidak ditemukan. Gunakan bahasa Indonesia, profesional, ringkas (maks 3 kalimat).

Konteks Teks Abstrak:
${sourceText}

Konteks Knowledge Graph (JSON):
${contextData}`;

    const loadingId = 'loading-' + Date.now();
    appendMessage('loading', '', loadingId);
    inputEl.disabled = true;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: message,
                systemInstruction: systemPrompt
            })
        });

        if (!response.ok) {
            throw new Error("Gagal memanggil API Vercel");
        }
        
        const data = await response.json();

        document.getElementById(loadingId)?.remove();
        appendMessage('bot', data.text);
    } catch (e) {
        document.getElementById(loadingId)?.remove();
        appendMessage('bot', "⚠️ Maaf, terjadi kesalahan saat menghubungi server AI.");
        logMsg("Chat error: " + e.message, "error");
    } finally {
        inputEl.disabled = false;
        inputEl.focus();
    }
};

// ============ Skincare AI Recommendation ============
window.openSkincareModal = async function () {
    const modal = document.getElementById('skincareModal');
    const content = document.getElementById('skincareResultContent');
    
    modal.classList.add('open');
    
    // Reset to loading state
    content.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 40px; flex-direction: column; gap: 16px;">
            <div class="loading-spinner" style="border-top-color: #f43f5e; border-left-color: #f43f5e; margin: 0;"></div>
            <p style="color: var(--text-muted); font-weight: 500;">AI sedang memformulasi rekomendasi skincare...</p>
        </div>
    `;

    if (!window.currentGraphData) {
        content.innerHTML = `<p style="color: var(--accent-rose); text-align: center;">Gagal: Tidak ada data hasil analisis jurnal.</p>`;
        return;
    }

    try {
        const sourceText = document.getElementById('inputText').value;
        const contextData = JSON.stringify(window.currentGraphData);

        const systemPrompt = `Anda adalah seorang Dokter Kulit Ahli (Dermatologist) dan Spesialis Skincare Formulator.
Tugas Anda adalah memberikan rekomendasi kandungan skincare (skincare ingredients) berdasarkan hasil analisis mikrobioma/jurnal berikut.
Berikan rekomendasi yang spesifik (misal: Salicylic Acid 2%, Niacinamide, Ceramide, dll) dan jelaskan secara singkat mengapa kandungan tersebut cocok berdasarkan kondisi dan mikroba yang terdeteksi di data.
Gunakan format HTML sederhana (h4, ul, li, p, strong) agar rapi saat dirender di web. Jangan gunakan markdown (***).
Fokus pada:
1. Active Ingredients untuk mengatasi masalah.
2. Barrier Support / Soothing Ingredients.
3. Hal yang harus dihindari (Avoid).
Jawab dalam bahasa Indonesia yang profesional dan mudah dipahami.`;

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: "Tolong berikan rekomendasi skincare berdasarkan data jurnal dan knowledge graph ini.",
                systemInstruction: systemPrompt + "\\n\\nData Jurnal:\\n" + sourceText + "\\n\\nKnowledge Graph:\\n" + contextData
            })
        });

        if (!response.ok) {
            throw new Error("Gagal memanggil API AI");
        }
        
        const data = await response.json();
        
        content.innerHTML = `
            <div style="background: rgba(244, 63, 94, 0.1); border-left: 4px solid #f43f5e; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 0.85rem; color: #f43f5e;">
                    <strong><i class="fa-solid fa-robot"></i> Rekomendasi Personal AI</strong><br>
                    Rekomendasi ini diformulasikan khusus berdasarkan entitas (Bakteri, Kondisi, Treatment) yang berhasil diekstrak dari abstrak jurnal Anda.
                </p>
            </div>
            <div class="skincare-html-content" style="display: flex; flex-direction: column; gap: 10px;">
                ${data.text}
            </div>
        `;
        logMsg("Rekomendasi Skincare AI berhasil dimuat.", "success");
    } catch (e) {
        content.innerHTML = `
            <div style="text-align: center; color: var(--accent-rose); padding: 20px;">
                <i class="fa-solid fa-triangle-exclamation fa-2x" style="margin-bottom: 10px;"></i>
                <p>Gagal memuat rekomendasi: ${e.message}</p>
            </div>
        `;
        logMsg("Skincare error: " + e.message, "error");
    }
};

window.closeSkincareModal = function () {
    document.getElementById('skincareModal').classList.remove('open');
};

