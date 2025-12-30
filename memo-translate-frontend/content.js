/* content.js - Expert Version (Fixing Clipping & Layout) */

const SseStreamHandler = {
    async read(response, onDelta, onComplete) {
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const content = line.substring(5);
                        if (content) onDelta(content);
                    }
                }
            }
            if (buffer.startsWith('data:')) onDelta(buffer.substring(5));
            if (onComplete) onComplete();
        } catch (error) {
            console.error("[SseStreamHandler] Stream error:", error);
            throw error;
        }
    }
};

const MarkdownFormatter = {
    format(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, '<span class="memo-md-bold">$1</span>')
            .replace(/`(.*?)`/g, '<span class="memo-md-code">$1</span>')
            .replace(/\n\n/g, '<br><div style="margin-bottom:8px;"></div>')
            .replace(/\n/g, '<br>');
    }
};

let icon = null;
let popup = null;
let currentSelection = "";

const initUI = () => {
    if (document.getElementById('memo-translate-icon')) return;

    icon = document.createElement('div');
    icon.id = 'memo-translate-icon';
    icon.textContent = '译';
    icon.style.display = 'none';
    document.body.appendChild(icon);

    popup = document.createElement('div');
    popup.id = 'memo-translate-popup';
    popup.style.display = 'none';
    popup.innerHTML = `
        <div class="memo-header">
            <span class="memo-title">Memo Translate</span>
            <span class="memo-close">×</span>
        </div>
        <div class="memo-content"></div>
        <div class="memo-action-area" style="display:none;">
            <div class="memo-chat-input-wrapper">
                <input type="text" class="memo-chat-input" placeholder="输入问题探讨上下文...">
                <button class="memo-chat-send">提问</button>
            </div>
            <div class="memo-footer-btns">
                <button id="memo-save-btn">添加到生词本</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    icon.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = window.getSelection().toString().trim();
        if (text) showTranslation(text);
    });

    popup.querySelector('.memo-close').addEventListener('click', () => {
        popup.style.display = 'none';
    });

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('dblclick', handleDblClick);
    document.addEventListener('mousedown', handleClickOutside);
};

const handleMouseUp = (e) => {
    if (popup.contains(e.target) || icon.contains(e.target)) return;
    setTimeout(() => {
        if (popup.style.display === 'block') return;
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text && text.length < 1000) {
            currentSelection = text;
            updateIconPosition(selection);
            icon.style.display = 'flex';
        } else {
            icon.style.display = 'none';
        }
    }, 10);
};

const handleDblClick = (e) => {
    if (popup.contains(e.target) || icon.contains(e.target)) return;
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text && text.length < 1000) {
        currentSelection = text;
        updateIconPosition(selection);
        showTranslation(text);
    }
};

const handleClickOutside = (e) => {
    if (!icon.contains(e.target) && !popup.contains(e.target)) {
        icon.style.display = 'none';
        popup.style.display = 'none';
    }
};

const updateIconPosition = (selection) => {
    if (selection.rangeCount === 0) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    icon.style.left = `${window.scrollX + rect.right + 5}px`;
    icon.style.top = `${window.scrollY + rect.top}px`;
};

async function showTranslation(text) {
    icon.style.display = 'none';
    popup.style.display = 'block';
    popup.style.left = icon.style.left;
    popup.style.top = icon.style.top;

    const contentDiv = popup.querySelector('.memo-content');
    contentDiv.innerHTML = '<div class="memo-loading">✨ 深度翻译中...</div>';

    const saveBtn = popup.querySelector('#memo-save-btn');
    saveBtn.innerText = "添加到生词本";
    saveBtn.disabled = true;

    chrome.runtime.sendMessage({ action: "translate", text: text }, (response) => {
        if (!response || !response.success) {
            contentDiv.textContent = "翻译失败: " + (response?.error || 'Unknown error');
            return;
        }

        const data = response.data;
        const isSentence = text.trim().split(/\s+/).length > 1;
        data.isSentence = isSentence;

        renderInitialPopup(contentDiv, data, isSentence);

        const actionArea = popup.querySelector('.memo-action-area');
        actionArea.style.display = 'block';
        setupAIChat(popup, data.original);

        bindCommonActions(contentDiv, data, isSentence);
        fetchAIAnalysis(data.original, contentDiv);
    });
}

function renderInitialPopup(container, data, isSentence) {
    let html = '';
    if (isSentence) {
        html = `
            <div class="memo-result-header">
                <span class="memo-play-audio" title="朗读" data-word="${data.original}">🔊</span>
                <span class="memo-result-sentence-trans">${data.translated}</span>
            </div>
        `;
    } else {
        html = `
            <div class="memo-result-header">
                <span class="memo-result-word">${data.translated}</span>
                <span class="memo-play-audio" title="朗读" data-word="${data.original}">🔊</span>
                ${data.phonetic ? `
                    <span class="memo-phonetic-toggle" style="cursor:pointer; font-size:12px; color:var(--memo-primary); opacity:0.7;">[音标/拼音]</span>
                    <span class="memo-result-phonetic" style="display:none; font-size:13px; color:var(--memo-text-light);">[${data.phonetic}]</span>
                ` : ''}
            </div>
        `;
        if (data.dictionary && data.dictionary.length > 0) {
            html += `<div class="memo-section">`;
            data.dictionary.forEach(item => {
                html += `<div class="memo-dict-item"><span class="memo-pos">${item.pos}</span> ${item.terms.join(', ')}</div>`;
            });
            html += `</div>`;
        }
        if (data.definitions && data.definitions.length > 0) {
            html += `<div class="memo-section-title">ENGLISH DEFINITIONS</div><div class="memo-section">`;
            data.definitions.forEach(item => {
                html += `<div class="memo-def-group"><span class="memo-pos">${item.pos}</span></div>`;
                item.defs.forEach((def, idx) => {
                    html += `<div class="memo-def-item">${idx + 1}. ${def}</div>`;
                });
            });
            html += `</div>`;
        }
    }
    html += `
        <div class="memo-ai-analysis">
            <div class="memo-ai-content memo-ai-loading">✨ AI 正在深度解析中...</div>
        </div>
        <div class="memo-ai-chat-container">
            <div class="memo-section-title" style="color:var(--memo-text-light);">深度跟进 (Ask AI)</div>
            <div class="memo-chat-history"></div>
        </div>
    `;
    container.innerHTML = html;
}

function bindCommonActions(container, data, isSentence) {
    const pToggle = container.querySelector('.memo-phonetic-toggle');
    if (pToggle) {
        pToggle.onclick = () => {
            const pEl = container.querySelector('.memo-result-phonetic');
            const isHidden = pEl.style.display === 'none';
            pEl.style.display = isHidden ? 'inline' : 'none';
            pToggle.innerText = isHidden ? '[收起]' : '[音标/拼音]';
        };
    }
    container.querySelector('.memo-play-audio')?.addEventListener('click', (e) => {
        e.stopPropagation();
        playAudio(e.target.dataset.word);
    });
    const saveBtn = popup.querySelector('#memo-save-btn');
    saveBtn.innerText = isSentence ? "收藏句子" : "添加到生词本";
    saveBtn.disabled = false;
    saveBtn.onclick = () => {
        saveWord(data);
        if (!isSentence) highlightWordOnPage(data.original, data.translated);
        saveBtn.innerText = "已保存";
        saveBtn.disabled = true;
    };
}

async function fetchAIAnalysis(text, container) {
    const aiDiv = container.querySelector('.memo-ai-analysis');
    if (!aiDiv) return;
    try {
        const response = await fetch('http://localhost:8080/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!response.ok) throw new Error("API Connection Failed");
        aiDiv.innerHTML = `
            <div class="memo-section-title" style="color:#d93025;">AI 语法解析</div>
            <div class="memo-ai-content memo-ai-grammar" style="font-size:13px; color:#444; margin-bottom:12px;"></div>
            <div class="memo-section-title" style="color:#188038;">关键短语</div>
            <div class="memo-ai-content memo-ai-phrases" style="margin-bottom:12px;"></div>
            <div class="memo-section-title" style="color:#f9ab00;">助记</div>
            <div class="memo-ai-content memo-ai-tip" style="font-style:italic;"></div>
        `;
        const grammarEl = aiDiv.querySelector('.memo-ai-grammar');
        const phrasesEl = aiDiv.querySelector('.memo-ai-phrases');
        const tipEl = aiDiv.querySelector('.memo-ai-tip');
        [grammarEl, phrasesEl, tipEl].forEach(el => el.classList.add('memo-streaming'));
        let accumulated = "";
        await SseStreamHandler.read(response, (delta) => {
            accumulated += delta;
            renderPartialAI(accumulated, grammarEl, phrasesEl, tipEl);
        }, () => {
            [grammarEl, phrasesEl, tipEl].forEach(el => el.classList.remove('memo-streaming'));
        });
    } catch (e) {
        aiDiv.innerHTML = `<div style="color:var(--memo-text-light); font-size:11px; padding:10px; border:1px dashed var(--memo-border); border-radius:8px;">AI 解析暂不可用: ${e.message}</div>`;
    }
}

function renderPartialAI(text, grammarEl, phrasesEl, tipEl) {
    const parsePart = (start, end) => {
        const startIdx = text.indexOf(start);
        if (startIdx === -1) return "";
        const realStart = startIdx + start.length;
        const endIdx = end ? text.indexOf(end, realStart) : text.length;
        return text.substring(realStart, endIdx === -1 ? text.length : endIdx).trim();
    };
    const grammar = parsePart("[grammar]", "[phrases]");
    const phrases = parsePart("[phrases]", "[tip]");
    const tip = parsePart("[tip]", null);
    if (grammar) grammarEl.innerHTML = MarkdownFormatter.format(grammar);
    if (phrases) {
        phrasesEl.innerHTML = phrases.split(/[,，]/).filter(p => p.trim())
            .map(p => `<span class="memo-tag">${p.trim()}</span>`).join(' ');
    }
    if (tip) tipEl.innerHTML = MarkdownFormatter.format(tip);
}

function setupAIChat(rootContainer, context) {
    const historyEl = rootContainer.querySelector('.memo-chat-history');
    const inputEl = rootContainer.querySelector('.memo-chat-input');
    const sendBtn = rootContainer.querySelector('.memo-chat-send');
    const contentArea = rootContainer.querySelector('.memo-content');
    if (!historyEl || !inputEl || !sendBtn) return;
    const stopPropagation = (e) => e.stopPropagation();
    inputEl.addEventListener('keydown', stopPropagation);
    inputEl.addEventListener('keyup', stopPropagation);
    inputEl.addEventListener('keypress', stopPropagation);
    const triggerChat = async () => {
        const message = inputEl.value.trim();
        if (!message) return;
        appendChatMessage(historyEl, 'user', message);
        inputEl.value = '';
        const aiMsgEl = appendChatMessage(historyEl, 'ai', '...');
        const scrollToBottom = () => { contentArea.scrollTop = contentArea.scrollHeight; };
        scrollToBottom();
        try {
            const response = await fetch('http://localhost:8080/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context, message })
            });
            if (!response.ok) throw new Error("Chat failed");
            let fullAiText = "";
            aiMsgEl.innerHTML = "";
            aiMsgEl.classList.add('memo-streaming');
            await SseStreamHandler.read(response, (delta) => {
                fullAiText += delta;
                aiMsgEl.innerHTML = MarkdownFormatter.format(fullAiText);
                scrollToBottom();
            }, () => {
                aiMsgEl.classList.remove('memo-streaming');
            });
        } catch (e) {
            aiMsgEl.textContent = "Error: " + e.message;
        }
    };
    sendBtn.onclick = triggerChat;
    inputEl.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') triggerChat();
    };
    setTimeout(() => inputEl.focus(), 100);
}

function appendChatMessage(container, role, text) {
    const msg = document.createElement('div');
    msg.className = `memo-chat-msg ${role}`;
    msg.innerHTML = MarkdownFormatter.format(text);
    container.appendChild(msg);
    return msg;
}

function playAudio(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
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
    const storageKey = data.isSentence ? 'memoSentences' : 'memoWords';
    chrome.storage.local.get([storageKey], (result) => {
        const list = result[storageKey] || [];
        if (!list.find(w => w.original === item.original)) {
            list.unshift(item);
            chrome.storage.local.set({ [storageKey]: list });
        }
    });
}

function highlightWordOnPage(wordText, translation) {
    if (!wordText || wordText.length < 2) return;
    const cleanWord = wordText.trim();
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(${escapeRegExp(cleanWord)})`, 'gi');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const parent = node.parentNode;
            if (!parent || ['script', 'style', 'textarea', 'input', 'select', 'noscript'].includes(parent.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
            if (parent.isContentEditable || parent.classList.contains('memo-highlight') || (parent.id && parent.id.startsWith('memo-translate'))) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const nodesToReplace = [];
    let currentNode;
    while (currentNode = walker.nextNode()) {
        if (pattern.test(currentNode.nodeValue)) nodesToReplace.push(currentNode);
    }
    nodesToReplace.forEach(node => {
        const span = document.createElement('span');
        const cleanTrans = translation ? translation.replace(/\[.*?\]/g, '').split(/[;,]/)[0].substring(0, 10) : '';
        span.innerHTML = node.nodeValue.replace(pattern, `<span class="memo-highlight" data-trans="${cleanTrans}">$1</span>`);
        node.parentNode?.replaceChild(span, node);
    });
}

initUI();
