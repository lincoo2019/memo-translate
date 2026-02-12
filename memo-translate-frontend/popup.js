/* popup.js */

let currentTab = 'words';
let allItems = []; // Current list data
let searchQuery = '';
let isReviewMode = false;

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupSearchBar();
    setupReviewMode(() => {
        loadItems();
    });

    document.getElementById('clear-all').addEventListener('click', handleClearAll);
    document.getElementById('export-csv').addEventListener('click', exportToAnki);
    document.getElementById('generate-qr').addEventListener('click', generateQRCode);
    document.getElementById('soundwave-sync').addEventListener('click', openSoundWaveSync);
});

function setupReviewMode(callback) {
    const toggle = document.getElementById('review-toggle');

    chrome.storage.local.get(['isReviewMode'], (result) => {
        isReviewMode = result.isReviewMode || false;
        toggle.checked = isReviewMode;
        if (callback) callback();
        else renderList();
    });

    toggle.addEventListener('change', (e) => {
        isReviewMode = e.target.checked;
        chrome.storage.local.set({ isReviewMode });
        renderList();
    });
}

function setupTabs() {
    document.getElementById('tab-words').addEventListener('click', () => switchTab('words'));
    document.getElementById('tab-sentences').addEventListener('click', () => switchTab('sentences'));
}

function setupSearchBar() {
    const bar = document.getElementById('search-bar');
    bar.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderList();
    });
}

function switchTab(tab) {
    if (currentTab === tab) return;
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    document.getElementById('search-bar').value = '';
    searchQuery = '';

    loadItems();
}

function loadItems() {
    const storageKey = currentTab === 'words' ? 'memoWords' : 'memoSentences';
    chrome.storage.local.get([storageKey], (result) => {
        allItems = result[storageKey] || [];
        updateCount();
        renderList();
    });
}

function updateCount() {
    const countEl = document.getElementById('items-count');
    countEl.textContent = `${allItems.length} ${currentTab === 'words' ? 'words' : 'sentences'}`;
}

function renderList() {
    const list = document.getElementById('word-list');
    list.innerHTML = '';

    const filtered = allItems.filter(item => {
        if (!searchQuery) return true;
        return (item.original.toLowerCase().includes(searchQuery) ||
            item.translated.toLowerCase().includes(searchQuery));
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${searchQuery ? '📭' : '📚'}</div>
                <div>${searchQuery ? 'No matches found.' : 'Your vocabulary book is empty.'}</div>
                <div style="font-size:12px; margin-top:8px; opacity:0.6;">
                    ${searchQuery ? 'Try a different search term.' : 'Start translating to save items!'}
                </div>
            </div>`;
        return;
    }

    filtered.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = `word-item ${isReviewMode ? 'review-mode' : ''}`;

        const date = new Date(item.timestamp).toLocaleDateString();
        const displayOriginal = item.original;

        li.innerHTML = `
            <div class="word-main">
                <span class="word-text" style="${currentTab === 'sentences' ? 'font-size: 14px; font-weight: 500;' : ''}">${escapeHtml(displayOriginal)}</span>
                <div class="word-actions">
                    <span class="action-icon play-audio" title="Listen">🔊</span>
                    <a href="${item.url}" target="_blank" class="action-icon" title="Source Page">🔗</a>
                    <span class="action-icon delete" data-index="${index}" title="Remove">🗑️</span>
                </div>
            </div>
            <div class="word-trans ${currentTab === 'sentences' ? 'memo-is-sentence' : ''}">${escapeHtml(item.translated)}</div>
            <div class="word-info">
                <span>${date}</span>
                ${item.url ? `<span class="word-url" title="${escapeHtml(item.url)}">${escapeHtml(getDomain(item.url))}</span>` : ''}
                ${item.phonetic ? `
                    <span class="phonetic-toggle" style="cursor:pointer; color:var(--memo-primary); opacity:0.8; margin-left:8px;">[音标/拼音]</span>
                    <span class="word-phonetic" style="display:none; opacity:0.7; margin-left:4px;">[${item.phonetic}]</span>
                ` : ''}
            </div>
        `;

        li.querySelector('.play-audio').addEventListener('click', () => playAudio(item.original));
        li.querySelector('.delete').addEventListener('click', () => removeItem(item));

        const toggle = li.querySelector('.phonetic-toggle');
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                const phoneticEl = li.querySelector('.word-phonetic');
                const isHidden = phoneticEl.style.display === 'none';
                phoneticEl.style.display = isHidden ? 'inline' : 'none';
                toggle.textContent = isHidden ? '[收起]' : '[音标/拼音]';
            });
        }

        list.appendChild(li);
    });
}

function playAudio(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

function removeItem(itemToRemove) {
    const mainIndex = allItems.findIndex(w => w.original === itemToRemove.original && w.timestamp === itemToRemove.timestamp);
    if (mainIndex === -1) return;

    allItems.splice(mainIndex, 1);
    const storageKey = currentTab === 'words' ? 'memoWords' : 'memoSentences';
    chrome.storage.local.set({ [storageKey]: allItems }, () => {
        updateCount();
        renderList();
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                if (currentTab === 'words') {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'removeHighlight',
                        word: itemToRemove.original
                    });
                } else {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'removeSentenceHighlight',
                        sentence: itemToRemove.original
                    });
                }
            }
        });
    });
}

function handleClearAll() {
    const name = currentTab === 'words' ? '单词' : '句子';
    if (confirm(`Are you sure you want to clear all ${name}?`)) {
        const storageKey = currentTab === 'words' ? 'memoWords' : 'memoSentences';
        chrome.storage.local.set({ [storageKey]: [] }, () => {
            allItems = [];
            updateCount();
            renderList();
            
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    if (currentTab === 'words') {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'clearAllHighlights'
                        });
                    } else {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'clearAllHighlights'
                        });
                    }
                }
            });
        });
    }
}

function exportToAnki() {
    if (allItems.length === 0) {
        alert('Empty list!');
        return;
    }

    let csvContent = "# separator:Tab\n# html:true\nFront\tBack\n";
    allItems.forEach(w => {
        let front = `<strong>${w.original}</strong>`;
        if (currentTab === 'words' && w.phonetic) front += ` <span style="color:#666;">[${w.phonetic}]</span>`;

        let back = `<div style="text-align:left;">${w.translated}</div>`;
        back += `<div style="margin-top:10px; font-size:10px; color:#999;">Source: ${w.url}</div>`;

        const clean = (str) => str.replace(/\t/g, " ").replace(/\n/g, "<br>");
        csvContent += `${clean(front)}\t${clean(back)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `memo_${currentTab}_export.csv`;
    link.click();
}

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getDomain(url) {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return url;
    }
}

function generateQRCode() {
    if (allItems.length === 0) {
        alert('单词列表为空，无法生成二维码！');
        return;
    }

    const vocabularyData = {
        version: '1.0',
        timestamp: Date.now(),
        count: allItems.length,
        words: allItems.map(item => ({
            word: item.original,
            meaning: item.translated,
            phonetic: item.phonetic || ''
        }))
    };

    const jsonData = JSON.stringify(vocabularyData);
    
    let base64Data = btoa(unescape(encodeURIComponent(jsonData)));
    
    const maxQRSize = 1800;
    const chunks = [];
    for (let i = 0; i < base64Data.length; i += maxQRSize) {
        chunks.push(base64Data.slice(i, i + maxQRSize));
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 12px;
        text-align: center;
        max-width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;

    const title = document.createElement('h3');
    title.textContent = '单词表二维码';
    title.style.cssText = 'margin: 0 0 16px 0; color: #333;';

    const info = document.createElement('p');
    info.textContent = `共 ${allItems.length} 个单词，分为 ${chunks.length} 个二维码`;
    info.style.cssText = 'margin: 12px 0; color: #666; font-size: 14px;';

    const qrContainer = document.createElement('div');
    qrContainer.style.cssText = 'display: flex; flex-direction: column; gap: 20px; align-items: center;';

    const hint = document.createElement('p');
    hint.textContent = '按顺序扫描所有二维码，使用配配单词App导入单词';
    hint.style.cssText = 'margin: 8px 0 16px 0; color: #999; font-size: 12px;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = `
        background: #6366f1;
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 8px;
    `;
    closeBtn.onclick = () => {
        document.body.removeChild(modal);
    };

    content.appendChild(title);
    content.appendChild(info);
    content.appendChild(qrContainer);
    content.appendChild(hint);
    content.appendChild(closeBtn);
    modal.appendChild(content);
    document.body.appendChild(modal);

    let currentChunk = 0;
    const generateNextQR = () => {
        if (currentChunk >= chunks.length) {
            return;
        }

        const chunkWrapper = document.createElement('div');
        chunkWrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 8px;';

        const chunkLabel = document.createElement('div');
        chunkLabel.textContent = `二维码 ${currentChunk + 1}/${chunks.length}`;
        chunkLabel.style.cssText = 'font-size: 12px; color: #666; font-weight: 600;';

        const qrDiv = document.createElement('div');
        qrDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; padding: 16px; background: #f9fafb; border-radius: 8px;';

        chunkWrapper.appendChild(chunkLabel);
        chunkWrapper.appendChild(qrDiv);
        qrContainer.appendChild(chunkWrapper);

        const chunkData = `word://v1/${currentChunk + 1}/${chunks.length}/${chunks[currentChunk]}`;
        console.log('Generating QR code for chunk:', currentChunk + 1, 'data length:', chunkData.length);
        console.log('Chunk data preview:', chunkData.substring(0, 100));
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(chunkData)}`;

        const img = document.createElement('img');
        img.src = qrApiUrl;
        img.alt = 'QR Code';
        img.style.cssText = 'max-width: 256px; height: auto; border: 1px solid #ddd; border-radius: 4px;';
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            console.log('QR code loaded successfully:', currentChunk + 1);
            currentChunk++;
            generateNextQR();
        };
        
        img.onerror = (e) => {
            console.error('Failed to load QR code:', e);
            qrDiv.innerHTML = '<p style="color: #ef4444; font-size: 12px; padding: 8px;">二维码生成失败，请重试</p>';
            currentChunk++;
            generateNextQR();
        };

        qrDiv.appendChild(img);
    };

    generateNextQR();

    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
}

function openSoundWaveSync() {
    chrome.tabs.create({ url: chrome.runtime.getURL('soundwave.html') });
}
