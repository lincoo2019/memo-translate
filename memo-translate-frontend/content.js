/* content.js */

let icon = null;
let popup = null;

// Create the floating icon
function createIcon() {
    const el = document.createElement('div');
    el.id = 'memo-translate-icon';
    el.textContent = '译';
    el.style.display = 'none';
    document.body.appendChild(el);

    el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = window.getSelection().toString().trim();
        if (text) {
            showTranslation(text);
        }
    });
    return el;
}

// Create the translation popup
function createPopup() {
    const el = document.createElement('div');
    el.id = 'memo-translate-popup';
    el.style.display = 'none';
    el.innerHTML = `
        <div class="memo-header">
            <span class="memo-title">翻译结果</span>
            <span class="memo-close">×</span>
        </div>
        <div class="memo-content">loading...</div>
        <div class="memo-footer">
            <button id="memo-save-btn">添加到生词本</button>
        </div>
    `;
    document.body.appendChild(el);

    el.querySelector('.memo-close').addEventListener('click', () => {
        el.style.display = 'none';
    });

    return el;
}

icon = createIcon();
popup = createPopup();

let currentSelection = "";

function updateIconPosition(selection) {
    if (selection.rangeCount === 0) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    icon.style.left = `${window.scrollX + rect.right + 5}px`;
    icon.style.top = `${window.scrollY + rect.top}px`;
}

document.addEventListener('mouseup', (e) => {
    if (popup.contains(e.target) || icon.contains(e.target)) return;

    // Short timeout to allow dblclick to fire first if applicable
    setTimeout(() => {
        // If popup is already shown (e.g. by dblclick), don't show icon
        if (popup.style.display === 'block') return;

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0 && text.length < 1000) {
            currentSelection = text;
            updateIconPosition(selection);
            icon.style.display = 'flex';
        } else {
            icon.style.display = 'none';
        }
    }, 10);
});

document.addEventListener('dblclick', (e) => {
    if (popup.contains(e.target) || icon.contains(e.target)) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length < 1000) {
        currentSelection = text;
        updateIconPosition(selection); // Ensure icon position is set so popup shows there
        showTranslation(text);
    }
});

document.addEventListener('mousedown', (e) => {
    if (!icon.contains(e.target) && !popup.contains(e.target)) {
        icon.style.display = 'none';
        popup.style.display = 'none';
    }
});

function showTranslation(text) {
    icon.style.display = 'none';
    popup.style.display = 'block';

    // Position popup where the icon was (or near selection)
    popup.style.left = icon.style.left;
    popup.style.top = icon.style.top;

    const contentDiv = popup.querySelector('.memo-content');
    contentDiv.innerHTML = '<div class="memo-loading">翻译中...</div>';

    const saveBtn = popup.querySelector('#memo-save-btn');
    saveBtn.innerText = "添加到生词本";
    saveBtn.disabled = true;

    chrome.runtime.sendMessage({ action: "translate", text: text }, (response) => {
        if (response && response.success) {
            const data = response.data;

            // Detect if Sentence
            const wordCount = text.trim().split(/\s+/).length;
            const isSentence = wordCount > 1; // Relaxed threshold for testing
            data.isSentence = isSentence;

            console.log("Memo Translate Debug:", { text, wordCount, isSentence });

            let html = '';

            if (isSentence) {
                console.log("Memo: Rendering Sentence UI & Triggering AI...");
                // Sentence UI with AI Analysis Placeholder
                html = `
                    <div class="memo-result-header">
                        <span class="memo-play-audio" title="朗读" data-word="${data.original}">🔊</span>
                        <span class="memo-result-sentence-trans">${data.translated}</span>
                    </div>
                    <div class="memo-ai-analysis">
                        <div class="memo-ai-loading">✨ AI 正在深度解析语法...</div>
                    </div>
                `;

                // Trigger AI Analysis
                // We must confirm contentDiv is mounted? yes usually.
                setTimeout(() => fetchAIAnalysis(data.original, contentDiv), 100);

            } else {
                // Word UI
                html = `
                    <div class="memo-result-header">
                        <span class="memo-result-word">${data.translated}</span>
                        <span class="memo-play-audio" title="朗读" data-word="${data.original}">🔊</span>
                        <span class="memo-result-phonetic">${data.phonetic ? `[${data.phonetic}]` : ''}</span>
                    </div>
                `;

                // ... (Dictionary sections same as before)
                // Bilingual Dictionary (Translations)
                if (data.dictionary) {
                    html += `<div class="memo-section">`;
                    data.dictionary.forEach(item => {
                        html += `<div class="memo-dict-item"><span class="memo-pos">${item.pos}</span> ${item.terms.join(', ')}</div>`;
                    });
                    html += `</div>`;
                }

                // Definitions (English)
                if (data.definitions) {
                    html += `<div class="memo-section-title">英文定义</div><div class="memo-section">`;
                    data.definitions.forEach(item => {
                        html += `<div class="memo-def-group"><span class="memo-pos">${item.pos}</span></div>`;
                        item.defs.forEach((def, idx) => {
                            html += `<div class="memo-def-item">${idx + 1}. ${def}</div>`;
                        });
                    });
                    html += `</div>`;
                }

                // Examples
                if (data.examples) {
                    html += `<div class="memo-section-title">例句</div><div class="memo-section memo-examples">`;
                    data.examples.forEach(ex => {
                        const cleanEx = ex.replace(/<b>|<\/b>/g, '');
                        html += `<div class="memo-ex-item">&bull; ${cleanEx}</div>`;
                    });
                    html += `</div>`;
                }
            }

            contentDiv.innerHTML = html;

            // Bind Audio Click
            const audioBtn = contentDiv.querySelector('.memo-play-audio');
            if (audioBtn) {
                audioBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent window close
                    const wordToPlay = e.target.dataset.word;
                    playAudio(wordToPlay);
                });
            }

            // Enable save
            const saveBtn = popup.querySelector('#memo-save-btn');
            saveBtn.innerText = isSentence ? "收藏句子" : "添加到生词本";
            saveBtn.disabled = false;
            saveBtn.onclick = () => {
                saveWord(data);

                if (!isSentence) {
                    highlightWordOnPage(data.original, data.translated);
                } else {
                    // Optional: Simple toast for sentence saved
                }

                saveBtn.innerText = "已保存";
                saveBtn.disabled = true;
            };
        } else {
            contentDiv.textContent = "翻译失败: " + (response ? response.error : 'Unknown error');
        }
    });
}

function playAudio(text) {
    if (!text) return;
    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // Default to English
    utterance.rate = 0.8; // Slightly slower is better for learning

    window.speechSynthesis.speak(utterance);
}

function saveWord(data) {
    const item = {
        original: data.original,
        translated: data.translated,
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
        phonetic: data.phonetic,
        dictionary: data.dictionary
    };

    // Choose storage key based on type
    const storageKey = data.isSentence ? 'memoSentences' : 'memoWords';

    chrome.storage.local.get([storageKey], (result) => {
        const list = result[storageKey] || [];
        // Simple de-duplication
        if (!list.find(w => w.original === item.original)) {
            list.unshift(item); // Add to top
            chrome.storage.local.set({ [storageKey]: list });
        }
    });
}

async function fetchAIAnalysis(text, container) {
    try {
        const res = await fetch('http://localhost:8080/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const aiDiv = container.querySelector('.memo-ai-analysis');
        if (!aiDiv || !res.ok) return;

        // Clear loading, set up structure
        aiDiv.innerHTML = `
            <div class="memo-section-title" style="color:#d93025;">AI 语法解析</div>
            <div class="memo-ai-content memo-ai-grammar" style="font-size:13px; color:#444; margin-bottom:10px;"></div>
            
            <div class="memo-section-title" style="color:#188038;">关键短语</div>
            <div class="memo-ai-content memo-ai-phrases" style="margin-bottom:10px;"></div>

            <div class="memo-section-title" style="color:#f9ab00;">助记</div>
            <div class="memo-ai-content memo-ai-tip" style="font-style:italic;"></div>
        `;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = ""; // Buffer for partial lines

        const grammarEl = aiDiv.querySelector('.memo-ai-grammar');
        const phrasesEl = aiDiv.querySelector('.memo-ai-phrases');
        const tipEl = aiDiv.querySelector('.memo-ai-tip');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last partial line in buffer

            for (let line of lines) {
                line = line.trim();
                // Spring TEXT_EVENT_STREAM sends data: content
                if (line.startsWith('data:')) {
                    const content = line.substring(5).trim();
                    if (content) {
                        fullText += content;
                        renderPartialAI(fullText, grammarEl, phrasesEl, tipEl);
                    }
                }
            }
        }
        // Process remaining buffer
        if (buffer.startsWith('data:')) {
            fullText += buffer.substring(5).trim();
            renderPartialAI(fullText, grammarEl, phrasesEl, tipEl);
        }
    } catch (e) {
        const aiDiv = container.querySelector('.memo-ai-analysis');
        if (aiDiv) aiDiv.innerHTML = `<div style="color:red; font-size:11px;">AI 加载失败: ${e.message}</div>`;
        console.error("Streaming failed", e);
    }
}

function renderPartialAI(text, grammarEl, phrasesEl, tipEl) {
    // 简单的解析逻辑：提取两个标记之间内容
    const getPart = (startMarker, nextMarker) => {
        const startIdx = text.indexOf(startMarker);
        if (startIdx === -1) return "";
        const realStart = startIdx + startMarker.length;
        const endIdx = nextMarker ? text.indexOf(nextMarker, realStart) : text.length;
        return text.substring(realStart, endIdx === -1 ? text.length : endIdx).trim();
    };

    const grammar = getPart("[grammar]", "[phrases]");
    const phrases = getPart("[phrases]", "[tip]");
    const tip = getPart("[tip]", null);

    if (grammar) grammarEl.textContent = grammar;
    if (phrases) {
        phrasesEl.innerHTML = phrases.split(/[,，]/)
            .filter(p => p.trim())
            .map(p => `<span class="memo-tag">${p.trim()}</span>`).join(' ');
    }
    if (tip) tipEl.textContent = tip;
}

// --- Highlighting Logic ---

// Run on load: highlight all known words
chrome.storage.local.get(['memoWords'], (result) => {
    const words = result.memoWords || [];
    if (words.length > 0) {
        // Debounce slightly to not freeze page load
        setTimeout(() => {
            words.forEach(w => highlightWordOnPage(w.original, w.translated));
        }, 1000);
    }
});

function highlightWordOnPage(wordText, translation) {
    if (!wordText || wordText.length < 2) return; // Ignore single chars

    // safe clean
    const cleanWord = wordText.trim();
    if (!cleanWord) return;

    // Build regex: Case insensitive, word boundary if valid word chars
    // Be careful with symbols in word
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(${escapeRegExp(cleanWord)})`, 'gi');

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip if parent is script, style, textarea, or our own popup
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;

                const tag = parent.tagName.toLowerCase();
                if (['script', 'style', 'textarea', 'input', 'select', 'noscript'].includes(tag)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
                if (parent.classList.contains('memo-highlight')) return NodeFilter.FILTER_REJECT;
                if (parent.id && parent.id.startsWith('memo-translate')) return NodeFilter.FILTER_REJECT;

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToReplace = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
        if (pattern.test(currentNode.nodeValue)) {
            nodesToReplace.push(currentNode);
        }
        currentNode = walker.nextNode();
    }

    // Replace nodes
    nodesToReplace.forEach(node => {
        const span = document.createElement('span');
        // Truncate translation to avoid massive overlay
        let cleanTrans = translation ? translation.replace(/\[.*?\]/g, '').split(/[;,]/)[0].substring(0, 10) : '';

        // Use data attribute to store translation
        const newHtml = node.nodeValue.replace(pattern, `<span class="memo-highlight" data-trans="${cleanTrans}">$1</span>`);
        span.innerHTML = newHtml;

        if (node.parentNode) {
            // We use a span as a wrapper to replace the text node
            // However, inserting innerHTML into a span is safer than replacing parent innerHTML
            // But we need to unwrap the outer span if we want valid HTML structure generally, 
            // easier is just replace the node with the fragments.

            // Simpler approach: replaceChild the node with the span
            node.parentNode.replaceChild(span, node);

            // Optional: Unwrap (remove) the outer span but keep children, 
            // if we worry about affecting layout (display:inline usually fine).
            // For now, keeping the wrapper span is safer to group the text fragments.
        }
    });
}
