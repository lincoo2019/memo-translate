/* popup.js */

let currentTab = 'words';
let allItems = []; // Current list data
let searchQuery = '';
let isReviewMode = false;

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupSearchBar();
    // Load state first, then load items (which triggers render)
    setupReviewMode(() => {
        loadItems();
    });

    document.getElementById('clear-all').addEventListener('click', handleClearAll);
    document.getElementById('export-csv').addEventListener('click', exportToAnki);
});

function setupReviewMode(callback) {
    const toggle = document.getElementById('review-toggle');

    // Load persisted state
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

    // Clear search when switching tabs
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
        // Remove truncation so sentences show in full
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
                ${item.phonetic ? `
                    <span class="phonetic-toggle" style="cursor:pointer; color:var(--memo-primary); opacity:0.8; margin-left:8px;">[音标/拼音]</span>
                    <span class="word-phonetic" style="display:none; opacity:0.7; margin-left:4px;">[${item.phonetic}]</span>
                ` : ''}
            </div>
        `;

        // Bind Actions
        li.querySelector('.play-audio').addEventListener('click', () => playAudio(item.original));
        li.querySelector('.delete').addEventListener('click', () => removeItem(item));

        // Add phonetic toggle
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
        });
    }
}

// Reuse exportToAnki from original logic
function exportToAnki() {
    if (allItems.length === 0) {
        alert('Empty list!');
        return;
    }

    let csvContent = "# separator:Tab\n# html:true\nFront\tBack\n";
    // ... logic remains same as old popup.js ...
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
