(function () {

    // --- Verifica se o script já foi carregado ou está em execução ---
    // Usamos uma variável global simples para este exemplo.
    // Uma abordagem mais robusta poderia verificar a existência de um elemento específico criado pelo script.
    if (window.paranaTeclaV2Loaded) {
        console.log("Paraná Tecla V2: Script já carregado.");
        // Opcional: Mostrar a UI se estiver oculta
        const wrapper = document.getElementById('bmWrapper');
        if (wrapper && wrapper.style.display === 'none') {
            wrapper.style.display = 'block';
        }
        return; // Impede a re-execução
    }
    window.paranaTeclaV2Loaded = true; // Marca como carregado
    console.log("Paraná Tecla V2: Iniciando carregamento...");

    // --- Constantes de Configuração ---
    const MIN_DELAY = 1;
    const SCROLL_DELAY = 40;
    const STEP_DELAY = MIN_DELAY;
    const FAST_TYPE_DELAY = 1;
    const MIN_WRAPPER_WIDTH = 260; // Usado no CSS, mas mantido aqui para referência
    const MIN_WRAPPER_HEIGHT = 180; // Usado no CSS, mas mantido aqui para referência
    const ADV_CONTEXT_WORDS = 5;
    const AI_STATUS_UPDATE_INTERVAL = 2200;
    const AI_GENERATION_MIN_WORDS = 170;
    const AI_GENERATION_MAX_WORDS = 300;
    const TARGET_TEXTAREA_SELECTOR = 'textarea#outlined-multiline-static[class*="jss"]';

    // --- Variáveis de Estado ---
    let activeEl = null;
    let isCorrectionRunning = false;
    let currentCorrectionResolver = null;
    let correctionSplashEl = null;
    let aiStatusIntervalId = null;
    let isDarkModeOn = false;
    let contextMenuEl = null;
    let aiGenResultPopupEl = null;
    let lastAIGenerationPrompt = null;
    let uiWrapperElement = null;
    let stealthOn = false;


    // --- Função para Carregar CSS Externo ---
    function loadCSS(url) {
        return new Promise((resolve, reject) => {
            const linkId = 'parana-tecla-v2-styles'; // ID para evitar duplicação
            if (document.getElementById(linkId)) {
                console.log("Paraná Tecla V2: CSS já carregado.");
                resolve();
                return;
            }
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link.onload = () => {
                console.log('Paraná Tecla V2: CSS carregado com sucesso de:', url);
                resolve();
            };
            link.onerror = (err) => {
                console.error('Paraná Tecla V2: Falha ao carregar CSS de:', url, err);
                reject(new Error(`Não foi possível carregar o CSS de ${url}`));
            };
            document.head.appendChild(link);
        });
    }

    // --- Funções Principais (showCustomAlert, waitForElement, etc.) ---
    // (Cole aqui TODAS as funções do seu script original, DESDE function showCustomAlert(...) ATÉ showWritingSplash(...)
    // E TAMBÉM as funções handleAIGenerationRequest, extractPageContext, showAIGenerationResult, etc.
    // BASICAMENTE, todo o código JS que *não* era a string CSS ou o bloco de inicialização final)

    function showCustomAlert(message, type = 'info', buttons = [{ text: 'OK' }], alertId = 'bmAlertOverlay') {
        return new Promise((resolve) => {
            removeOverlay(alertId);
            const overlay = document.createElement('div');
            overlay.id = alertId;
            overlay.className = 'bmDialogOverlay';
            overlay.style.zIndex = '100005';
            const alertBox = document.createElement('div');
            alertBox.className = 'bmDialogBox';
            alertBox.classList.add(`bmAlert-${type}`);
            let iconHtml = '';
            switch (type) {
                case 'error': iconHtml = '<div class="bmDialogIcon error">!</div>'; break;
                case 'warning': iconHtml = '<div class="bmDialogIcon warning">!</div>'; break;
                case 'success': iconHtml = '<div class="bmDialogIcon success">✓</div>'; break;
                case 'question': iconHtml = '<div class="bmDialogIcon question">?</div>'; break;
                case 'info': default: iconHtml = '<div class="bmDialogIcon info">i</div>'; break;
            }
            const messageP = document.createElement('p');
            messageP.className = 'bmDialogMessage';
            messageP.innerHTML = message;
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'bmDialogButtonContainer';
            buttons.forEach(buttonInfo => {
                const btn = document.createElement('button');
                btn.textContent = buttonInfo.text;
                btn.className = `bmDialogButton ${buttonInfo.class || ''}`;
                btn.onclick = () => {
                    alertBox.classList.remove('bmDialogEnter');
                    alertBox.classList.add('bmDialogExit');
                    overlay.classList.add('bmDialogFadeOut');
                    setTimeout(() => {
                        removeOverlay(overlay);
                        resolve(buttonInfo.value !== undefined ? buttonInfo.value : buttonInfo.text);
                    }, 400);
                };
                buttonContainer.appendChild(btn);
            });
            alertBox.innerHTML = iconHtml;
            alertBox.appendChild(messageP);
            alertBox.appendChild(buttonContainer);
            overlay.appendChild(alertBox);
            document.body.appendChild(overlay);
            void alertBox.offsetWidth;
            overlay.classList.add('bmDialogFadeIn');
            alertBox.classList.add('bmDialogEnter');
        });
    }


    /**
     * Mostra um diálogo perguntando como inserir o texto da IA
     * @returns {Promise<string>} A opção escolhida ('replace', 'append', 'cancel')
     */
    async function showWriteOptionsDialog() {
        const buttons = [
             { text: 'Escrever no final do texto', value: 'append', class: 'secondary' },
             { text: 'Substituir o texto atual', value: 'replace' },
             { text: 'Cancelar', value: 'cancel', class: 'secondary' }
        ];
        const choice = await showCustomAlert(
            'O que deseja fazer com o texto gerado pela IA?',
            'question',
            buttons,
            'bmWriteOptionsDialog'
        );
        removeOverlay('bmWriteOptionsDialog');
        return choice;
    }




    /**
     * Espera um elemento ser REMOVIDO do DOM
     * Resolve a Promise APENAS quando o elemento não é mais encontrado pelo querySelector
     * Continua esperando se o elemento for encontrado, mesmo que oculto por CSS
     * Resolve com aviso em caso de timeout se o elemento ainda estiver no DOM
     * @param {string} selector Seletor CSS do elemento
     * @param {number} timeout Tempo máximo de espera em milissegundos
     * @returns {Promise<string>} Mensagem indicando o resultado
     */
    function waitForElementToDisappear(selector, timeout = 45000) {
        console.log(`Aguardando ${selector} ser REMOVIDO do DOM...`);
        return new Promise((resolve) => {
            const intervalTime = 100;
            let elapsedTime = 0;
            let timeoutId = null;

            const intervalId = setInterval(() => {
                const element = document.querySelector(selector);

                if (!element) {

                    clearInterval(intervalId);
                    clearTimeout(timeoutId);
                    console.log(`Espera por ${selector} concluída (elemento REMOVIDO do DOM).`);
                    resolve("Elemento removido do DOM");
                } else {

                    elapsedTime += intervalTime;

                    if (elapsedTime > timeout) {
                        clearInterval(intervalId);

                        console.warn(`Timeout (${timeout / 1000}s) esperando ${selector} ser REMOVIDO. O elemento AINDA está no DOM. Continuando o script...`);
                        resolve("Timeout (elemento ainda no DOM)");
                    } else if (elapsedTime % 5000 === 0 && elapsedTime > 0) {
                        console.log(`Ainda esperando <span class="math-inline">${selector} ser REMOVIDO... (${elapsedTime / 1000}s)`);
                    }
                }
            }, intervalTime);


            timeoutId = setTimeout(() => {
                clearInterval(intervalId);
                 const elementStillExists = document.querySelector(selector);
                 if (elementStillExists) {
                    console.warn(`Timeout final (${timeout / 1000}s) esperando ${selector} ser REMOVIDO. Elemento ainda no DOM. Continuando...`);
                    resolve("Timeout final (elemento ainda no DOM)");
                 } else {
                    console.log(`Timeout final (${timeout / 1000}s), mas elemento ${selector} já havia sido removido (OK).`);
                    resolve("Timeout final (elemento já removido)");
                 }
            }, timeout);
        });
    }

     function waitForElement(selector, timeout = 5000) {
         return new Promise((resolve, reject) => {
             const startTime = Date.now();
             const interval = setInterval(() => {
                 const element = document.querySelector(selector);

                 if (element && element.offsetParent !== null) {
                     clearInterval(interval);
                     resolve(element);
                 } else if (Date.now() - startTime > timeout) {
                     clearInterval(interval);
                     reject(new Error(`Timeout esperando aparecer: ${selector}`));
                 }
             }, 50);
         });
     }


    document.addEventListener('mousedown', e => {

        const wrapper = document.getElementById('bmWrapper');
        if (!wrapper || !wrapper.contains(e.target) || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
             activeEl = e.target;

         }
    }, true);

    function dispatchKeyEvent(target, eventType, key, keyCode, charCode = 0, ctrlKey = false, altKey = false, shiftKey = false, metaKey = false) {
        let effectiveCharCode = charCode;
        if (!effectiveCharCode && key && key.length === 1) {
            effectiveCharCode = key.charCodeAt(0);
        }
        const event = new KeyboardEvent(eventType, {
            key: key,
            code: keyCode === 8 ? 'Backspace' : `Key${key.toUpperCase()}`,
            keyCode: keyCode,
            which: keyCode,
            charCode: eventType === 'keypress' ? effectiveCharCode : 0,
            bubbles: true,
            cancelable: true,
            composed: true,
            ctrlKey: ctrlKey,
            altKey: altKey,
            shiftKey: shiftKey,
            metaKey: metaKey
        });

        try {
            target.dispatchEvent(event);
        } catch (e) {
            console.warn("Falha ao despachar evento:", eventType, key, e);
        }
    }

    async function simulateBackspace(targetElement) {
        if (!targetElement || !document.body.contains(targetElement)) return false;

        dispatchKeyEvent(targetElement, 'keydown', 'Backspace', 8);
        let valueChanged = false;
        if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
            const start = targetElement.selectionStart;
            const end = targetElement.selectionEnd;
            const currentValue = targetElement.value;
            let newValue = currentValue;
            let newCursorPos = start;
            if (start !== end) {
                newValue = currentValue.substring(0, start) + currentValue.substring(end);
                newCursorPos = start;
                valueChanged = true;
            } else if (start > 0) {
                newValue = currentValue.substring(0, start - 1) + currentValue.substring(end);
                newCursorPos = start - 1;
                valueChanged = true;
            }
            if (valueChanged) {
                try {

                    const prototype = Object.getPrototypeOf(targetElement);
                    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                    if (descriptor && descriptor.set) {
                        descriptor.set.call(targetElement, newValue);
                    } else {
                        targetElement.value = newValue;
                    }

                    targetElement.selectionStart = targetElement.selectionEnd = newCursorPos;
                    targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                    targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                } catch (e) {
                    console.warn("Erro ao definir valor/disparar evento no backspace simulado via descritor, tentando fallback", e);

                    targetElement.value = newValue;
                    targetElement.selectionStart = targetElement.selectionEnd = newCursorPos;
                    targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                    targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                }
            }
        } else if (targetElement.isContentEditable) {

            document.execCommand('delete', false, null);
            valueChanged = true;
        }
        dispatchKeyEvent(targetElement, 'keyup', 'Backspace', 8);
        if (MIN_DELAY > 0) await new Promise(r => setTimeout(r, MIN_DELAY));
        return valueChanged;
    }


     function sendChar(c, targetElement) {
         if (!targetElement || !document.body.contains(targetElement)) {
             console.warn("sendChar: Elemento alvo inválido ou não está no DOM.");
             return false;
         }
         try {

             if (document.activeElement !== targetElement) {
                 targetElement.focus({ preventScroll: true });
             }
         } catch (e) {
             console.warn("sendChar: Falha ao focar:", e);

         }

         const keyCode = c.charCodeAt(0);
         const charCode = keyCode;


         dispatchKeyEvent(targetElement, 'keydown', c, keyCode);
         dispatchKeyEvent(targetElement, 'keypress', c, keyCode, charCode);

         let valueChanged = false;

         if (targetElement.isContentEditable) {
             try {

                 if (!document.execCommand('insertText', false, c)) {

                     const sel = window.getSelection();
                     if (sel.rangeCount > 0) {
                         const range = sel.getRangeAt(0);
                         range.deleteContents();
                         range.insertNode(document.createTextNode(c));
                         range.collapse(false);
                         valueChanged = true;
                     }
                 } else {
                     valueChanged = true;
                 }
             } catch (e) {
                 console.warn("sendChar: Falha no execCommand('insertText') ou fallback:", e);
             }
         } else if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
             const start = targetElement.selectionStart;
             const end = targetElement.selectionEnd;
             const currentValue = targetElement.value;
             const newValue = currentValue.substring(0, start) + c + currentValue.substring(end);
             try {

                 const prototype = Object.getPrototypeOf(targetElement);
                 const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                 if (descriptor && descriptor.set) {
                     descriptor.set.call(targetElement, newValue);
                 } else {
                     targetElement.value = newValue;
                 }

                 targetElement.selectionStart = targetElement.selectionEnd = start + c.length;
                 targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                 targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                 valueChanged = true;
             } catch (e) {
                 console.warn("Erro ao definir valor via descritor no sendChar, tentando fallback", e);
                 try {
                     targetElement.value = newValue;
                     targetElement.selectionStart = targetElement.selectionEnd = start + c.length;
                     targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                     targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                     valueChanged = true;
                 } catch (e2) {
                     console.error("Falha total ao definir valor ou disparar eventos em sendChar:", e2);
                 }
             }
         }


         dispatchKeyEvent(targetElement, 'keyup', c, keyCode);

         return valueChanged;
     }

    async function clearTextareaSimulated(textareaElement) {
        if (!textareaElement || !document.body.contains(textareaElement)) {
            console.error("clearTextareaSimulated: Elemento alvo inválido.");
            return false;
        }
        console.log("Iniciando limpeza rápida da textarea...");

        try {
            textareaElement.focus({ preventScroll: true });
            await new Promise(r => setTimeout(r, 50));


            const prototype = Object.getPrototypeOf(textareaElement);
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(textareaElement, "");
            } else {
                textareaElement.value = "";
            }
            textareaElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
            textareaElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            if (textareaElement.value === "") {
                console.log("Textarea limpa com sucesso (método direto).");
                return true;
            } else {
                 console.warn("Limpeza direta falhou, tentando Select All + Backspace...");

                textareaElement.select();
                await new Promise(r => setTimeout(r, 50));
                const backspaceSuccess = await simulateBackspace(textareaElement);
                if (backspaceSuccess && textareaElement.value === "") {
                     console.log("Textarea limpa com sucesso (método simulado).");
                     return true;
                } else {
                     console.warn("Limpeza simulada também falhou. Forçando valor vazio.");
                     textareaElement.value = "";
                     return textareaElement.value === "";
                }
            }
        } catch (error) {
            console.error("Erro durante clearTextareaSimulated:", error);
             try {
                 textareaElement.value = "";
                 return textareaElement.value === "";
             } catch (e2) {
                 return false;
             }
        }
    }

    async function typeTextFast(text, targetElement) {
        if (!targetElement || !document.body.contains(targetElement)) {
            console.error("typeTextFast: Elemento alvo inválido.");
            return false;
        }
        console.log(`Iniciando digitação rápida (${FAST_TYPE_DELAY}ms delay)...`);

        targetElement.focus({ preventScroll: true });
        let success = true;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            const charSuccess = sendChar(char, targetElement);
            if (!charSuccess) {
                console.warn(`Falha ao digitar o caractere rápido: "${char}" na posição ${i}`);

            }
            if (FAST_TYPE_DELAY > 0) {
                await new Promise(r => setTimeout(r, FAST_TYPE_DELAY));
            }
            if (i % 200 === 0 && i > 0) {
                console.log(`Digitando rápido... ${i + 1}/${text.length}`);
            }
        }
        console.log("Digitação rápida concluída.");
        return success;
    }


    async function callPuterAI(prompt) {
        return new Promise((resolve, reject) => {
            console.log("Chamando Puter.JS AI...");

             console.log("Prompt enviado (primeiros 200 chars):", prompt.substring(0, 200) + (prompt.length > 200 ? "..." : ""));

            const executeAIChat = () => {
                if (!window.puter || !window.puter.ai || typeof window.puter.ai.chat !== 'function') {

                     console.log("Puter.JS não encontrado, tentando carregar...");
                     const s = document.createElement('script');
                     s.src = 'https://js.puter.com/v2/';
                     s.onload = () => {
                         console.log("Puter.JS carregado dinamicamente com sucesso.");
                         if (window.puter && window.puter.ai && typeof window.puter.ai.chat === 'function') {
                             setTimeout(executeAIChat, 100);
                         } else {
                             reject(new Error("Puter.JS carregado, mas puter.ai.chat ainda não está disponível."));
                         }
                     };
                     s.onerror = (err) => {
                         console.error("Falha ao carregar Puter.JS dinamicamente:", err);
                         reject(new Error("Não foi possível carregar o script do Puter.JS."));
                     };
                     document.body.appendChild(s);
                     return;
                }


                puter.ai.chat(prompt)
                    .then(response => {
                        console.log("Puter.JS AI respondeu (raw):", response);
                        let resultText = null;
                        if (typeof response === 'object' && response !== null) {
                            if (typeof response.message === 'object' && response.message !== null && typeof response.message.content === 'string') {
                                resultText = response.message.content;
                                console.log("Texto extraído com sucesso de response.message.content.");
                            } else if (typeof response.content === 'string') {
                                resultText = response.content;
                                console.log("Texto extraído com sucesso de response.content.");
                            } else if (typeof response.message === 'string') {
                                resultText = response.message;
                                console.log("Texto extraído com sucesso de response.message (string).");
                            }
                        } else if (typeof response === 'string') {
                            resultText = response;
                            console.log("A resposta da IA já era uma string.");
                        }

                        if (resultText !== null) {
                            resolve(resultText.trim());
                        } else {
                            console.error("Não foi possível extrair texto da resposta da IA (estrutura inesperada):", response);
                            reject(new Error("Formato de resposta da IA inesperado ou sem conteúdo textual."));
                        }
                    })
                    .catch(error => {
                        console.error("Erro ao chamar Puter.JS AI:", error);
                        reject(new Error(`Erro na chamada da IA: ${error.message || error}`));
                    });
            };


             if (window.puter && window.puter.ai && typeof window.puter.ai.chat === 'function') {
                 console.log("Puter.JS já carregado.");
                 executeAIChat();
             } else {

                 executeAIChat();
             }
        });
    }

    function removeOverlay(elementOrId) {

        if (aiStatusIntervalId) {
            clearInterval(aiStatusIntervalId);
            aiStatusIntervalId = null;

        }

        let overlayElement = null;
        if (typeof elementOrId === 'string') {
            overlayElement = document.getElementById(elementOrId);
        } else if (elementOrId instanceof HTMLElement) {
            overlayElement = elementOrId;
        }

        if (overlayElement && document.body.contains(overlayElement)) {

            const contentBox = overlayElement.querySelector('.bmAdvSplashContent, .bmDialogBox, .bmContextMenu, .bmAIGenResultPopupContent, #bmWritingSplashContent');


            overlayElement.style.transition = 'opacity 0.4s ease-out';
            overlayElement.style.opacity = '0';


            if (contentBox) {
                contentBox.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-in';
                contentBox.style.opacity = '0';
                contentBox.style.transform = 'scale(0.9)';
            }


            setTimeout(() => {
                if (overlayElement && document.body.contains(overlayElement)) {
                    document.body.removeChild(overlayElement);

                }
            }, 400);
        }
    }


    async function showAIReviewOverlayStyled() {

         return new Promise((resolve) => { const overlayId = 'bmAIReviewSplash'; removeOverlay(overlayId); const overlay = document.createElement('div'); overlay.id = overlayId; overlay.style.cssText = ` position: fixed; inset: 0; background: #0a0514; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100001; opacity: 0; transition: opacity 0.5s ease-out; font-family: 'Segoe UI', sans-serif; color: #eee; overflow: hidden; `; overlay.innerHTML = ` <div id="bmAIReviewContent" class="bmAdvSplashContent" style="opacity:0; transform: scale(0.9) rotateY(10deg); transition: opacity 0.5s ease-out 0.1s, transform 0.5s ease-out 0.1s;"> <h2 style="font-size: 2em; margin-bottom: 20px;">Revisão Final pela IA</h2> <p style="font-size: 1.1em; line-height: 1.6; color: #ccc; margin-bottom: 30px;"> Ótimo! Você terminou as etapas.<br> Deseja que uma IA dê uma última vistoria no texto? </p> <div class="bmAdvActionButtons" style="border-top: none; padding-top: 15px;"> <button id="bmAINoBtn" class="bmAdvActionButton skip">Não</button> <button id="bmAIYesBtn" class="bmAdvActionButton manual">Sim</button> </div> </div>`; document.body.appendChild(overlay); void overlay.offsetWidth; overlay.style.opacity = '1'; const contentBox = overlay.querySelector('#bmAIReviewContent'); if(contentBox){ contentBox.style.opacity = '1'; contentBox.style.transform = 'scale(1) rotateY(0deg)'; } document.getElementById('bmAIYesBtn').onclick = () => { resolve(true); removeOverlay(overlay); }; document.getElementById('bmAINoBtn').onclick = () => { resolve(false); removeOverlay(overlay); }; });
    }

    function showAILoadingOverlayStyled(initialMessage = "Processando IA...") {

         const overlayId = 'bmAILoadingSplash'; removeOverlay(overlayId); const overlay = document.createElement('div'); overlay.id = overlayId; overlay.style.cssText = ` position: fixed; inset: 0; background: #0a0514; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100002; opacity: 0; transition: opacity 0.4s ease-in; font-family: 'Segoe UI', sans-serif; color: #eee; overflow: hidden; `; overlay.innerHTML = ` <div id="bmAILoadingContent" class="bmAdvSplashContent" style="padding: 40px 50px; opacity:0; transform: scale(0.9); transition: opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s;"> <div class="bmAdvLoadingState" style="display: flex; flex-direction: column; position: static; background: none; backdrop-filter: none; border-radius: 0;"> <div class="spinner" style="width: 45px; height: 45px; border-width: 5px; margin-bottom: 20px;"></div> <div class="applying-text" style="font-size: 1.4em; margin-bottom: 25px;">${initialMessage}</div> <div class="bmProgressBarContainer" style="width: 80%; height: 10px; background-color: rgba(255, 255, 255, 0.1); border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.4);"> <div class="bmProgressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #b37ffc, #f0dfff); border-radius: 5px; transition: width 0.4s ease-out;"></div> </div> </div> </div>`; document.body.appendChild(overlay); void overlay.offsetWidth; overlay.style.opacity = '1'; const contentBox = overlay.querySelector('#bmAILoadingContent'); if(contentBox){ contentBox.style.opacity = '1'; contentBox.style.transform = 'scale(1)'; } return { overlayElement: overlay, statusTextElement: overlay.querySelector('.applying-text'), progressBarElement: overlay.querySelector('.bmProgressBar') };
    }

    function updateAIProgressBar(progressBarElement, targetPercentage) {

         if (progressBarElement) { const clampedPercentage = Math.max(0, Math.min(100, targetPercentage)); progressBarElement.style.width = `${clampedPercentage}%`; }
    }



    function extractPageContext() {
        console.log("Iniciando extração de contexto da página...");
        let context = "";

        const contentArea = document.querySelector('.jss6');
        const baseElement = contentArea || document.body;

        if (!contentArea) {
            console.warn("Área de conteúdo principal (jss6) não encontrada para extrair contexto. Buscando no body.");
        }


        const getNextRelevantSiblingText = (element) => {
            let sibling = element.nextElementSibling;
            while (sibling) {

                if (sibling.tagName === 'HR') return null;
                 if ((sibling.tagName === 'P' || sibling.tagName === 'DIV') && (sibling.innerText || sibling.textContent || '').trim()) {

                     if (element.textContent.toUpperCase().includes('PROPOSTA')) {
                         const qlEditor = sibling.classList.contains('ql-editor') ? sibling : sibling.querySelector('.ql-editor');
                         if (qlEditor) return (qlEditor.innerText || qlEditor.textContent).trim();
                     }

                     if (element.textContent.toUpperCase().includes('TOKEN')) {
                          const boldEl = sibling.querySelector('b');
                          if (boldEl) return boldEl.textContent.trim();
                     }

                     return (sibling.innerText || sibling.textContent).trim();
                 }
                 sibling = sibling.nextElementSibling;
            }
            return null;
        };


        const getSupportTexts = (element) => {
            let sibling = element.nextElementSibling;
            let supportText = "";
            let inSupportSection = false;
             while(sibling && sibling.tagName !== 'HR') {

                 if (sibling.tagName === 'DIV' && sibling.style.marginTop === '15px' && sibling.style.overflowWrap === 'break-word') {
                     inSupportSection = true;
                 }

                 if (inSupportSection) {
                     const textDivs = sibling.querySelectorAll('div[style*="text-align: justify"]');
                     textDivs.forEach(div => {
                         supportText += `- ${div.textContent.trim()}\n`;
                     });

                      if (textDivs.length === 0 && (sibling.innerText || sibling.textContent).trim()) {
                           supportText += `- ${sibling.textContent.trim()}\n`;
                      }
                 }
                  sibling = sibling.nextElementSibling;
             }
             return supportText.trim() || null;
        }


        const contextMap = {
            "GÊNERO TEXTUAL": null,
            "TEMA": null,
            "PROPOSTA": null,
            "TEXTOS DE APOIO": null
        };
        const headers = baseElement.querySelectorAll('h3[style*="color: var(--blue-light)"], h6[style*="color: var(--blue-light)"]');
        let foundDetailedProposal = false;

        headers.forEach(h => {
            const headerText = h.textContent.trim().toUpperCase();

            if (headerText.includes("GÊNERO TEXTUAL") && !contextMap["GÊNERO TEXTUAL"]) {
                contextMap["GÊNERO TEXTUAL"] = getNextRelevantSiblingText(h);
            } else if (headerText.includes("TEMA") && !contextMap["TEMA"]) {
                contextMap["TEMA"] = getNextRelevantSiblingText(h);
            } else if (headerText.includes("PROPOSTA") && !foundDetailedProposal) {
                contextMap["PROPOSTA"] = getNextRelevantSiblingText(h);
                if (contextMap["PROPOSTA"] && contextMap["PROPOSTA"].length > 100) {
                    foundDetailedProposal = true;
                     console.log("Proposta detalhada encontrada.");
                }
            } else if (headerText.includes("TEXTOS DE APOIO") && !contextMap["TEXTOS DE APOIO"]) {
                 contextMap["TEXTOS DE APOIO"] = getSupportTexts(h);
            }
        });


        let formattedContext = "--- CONTEXTO DA PÁGINA ---\n";
        let foundAnyContext = false;
        for (const key in contextMap) {
            if (contextMap[key]) {
                const label = key === "PROPOSTA" ? "PROPOSTA DETALHADA" : key;
                formattedContext += `${label}:\n${contextMap[key]}\n\n`;
                foundAnyContext = true;
            }
        }
        formattedContext += "--- FIM DO CONTEXTO ---";

        if (foundAnyContext) {
            console.log("Contexto extraído com sucesso.");

            return formattedContext;
        } else {
            console.error("Não foi possível extrair informações de contexto relevantes da página.");
            return null;
        }
    }

    async function showAIGenerationResult(generatedText, promptUsed) {
        return new Promise((resolve) => {
            const overlayId = 'bmAIGenResultPopup';
            removeOverlay(overlayId);

            aiGenResultPopupEl = document.createElement('div');
            aiGenResultPopupEl.id = overlayId;
            aiGenResultPopupEl.className = 'bmDialogOverlay';
            aiGenResultPopupEl.style.zIndex = '100003';

            const popupBox = document.createElement('div');
            popupBox.className = 'bmDialogBox bmAIGenResultPopupContent';
            popupBox.style.minWidth = '500px';
            popupBox.style.maxWidth = '80vw';
            popupBox.style.maxHeight = '85vh';
            popupBox.style.display = 'flex';
            popupBox.style.flexDirection = 'column';

            popupBox.innerHTML = `
                <h2 style="font-size: 1.6em; margin-bottom: 15px; color: #e0cffc;">Texto Gerado pela IA</h2>
                <textarea id="bmAIGenResultText" readonly style="width: 100%; min-height: 250px; height: 40vh; margin-bottom: 25px; background: #2a2a2e; color: #e8e8e8; border: 1px solid #555; border-radius: 8px; padding: 12px; font-size: 0.95em; resize: vertical; box-sizing: border-box; font-family: Consolas, Monaco, monospace;"></textarea>
                <div class="bmDialogButtonContainer" style="gap: 12px; margin-top: 10px;">
                    <button id="bmAIGenWriteBtn" class="bmDialogButton">Escrever</button>
                    <button id="bmAIGenRegenBtn" class="bmDialogButton secondary">Regenerar</button>
                    <button id="bmAIGenAbandonBtn" class="bmDialogButton secondary">Abandonar</button>
                </div>
            `;

            aiGenResultPopupEl.appendChild(popupBox);
            document.body.appendChild(aiGenResultPopupEl);

            const textArea = aiGenResultPopupEl.querySelector('#bmAIGenResultText');
            textArea.value = generatedText;

            void popupBox.offsetWidth;
            aiGenResultPopupEl.classList.add('bmDialogFadeIn');
            popupBox.classList.add('bmDialogEnter');

            document.getElementById('bmAIGenWriteBtn').onclick = () => {
                removeOverlay(aiGenResultPopupEl);
                resolve({ action: 'write', text: generatedText });
            };
            document.getElementById('bmAIGenRegenBtn').onclick = () => {
                removeOverlay(aiGenResultPopupEl);
                resolve({ action: 'regenerate', prompt: promptUsed });
            };
            document.getElementById('bmAIGenAbandonBtn').onclick = () => {
                removeOverlay(aiGenResultPopupEl);
                resolve({ action: 'abandon' });
            };
        });
    }

    /**
     * Mostra o splash "Escrevendo..." com efeito soundwave
     */
     function showWritingSplash() {
         const overlayId = 'bmWritingSplash';
         removeOverlay(overlayId);

         const overlay = document.createElement('div');
         overlay.id = overlayId;
         overlay.style.cssText = `
             position: fixed;
             inset: 0;
             background: #0a0514; /* Fundo escuro base */
             display: flex;
             flex-direction: column;
             align-items: center;
             justify-content: center;
             z-index: 100004; /* Acima de outros popups normais */
             opacity: 0;
             transition: opacity 0.5s ease-out;
             font-family: 'Segoe UI', sans-serif;
             color: #eee;
             overflow: hidden;
         `;

         overlay.innerHTML = `
             <div id="bmWritingSplashContent" style="position: relative; text-align: center; opacity:0; transform: scale(0.9); transition: opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s;">
                 <div class="soundwave-container">
                     ${Array.from({ length: 15 }).map((_, i) => `<div class="wave-bar" style="animation-delay: ${Math.random() * 0.5}s;"></div>`).join('')}
                 </div>
                 <h2 style="font-size: 1.8em; margin-top: 40px; color: #e0cffc; text-shadow: 0 0 10px rgba(160, 86, 247, 0.6);">
                     Deixando tudo pronto para você...
                 </h2>
             </div>
         `;

         document.body.appendChild(overlay);
         void overlay.offsetWidth;
         overlay.style.opacity = '1';
         const contentBox = overlay.querySelector('#bmWritingSplashContent');
         if(contentBox){ contentBox.style.opacity = '1'; contentBox.style.transform = 'scale(1)'; }


         return overlay;
     }


    async function handleAIGenerationRequest(isRegeneration = false, promptToUse = null) {
        console.log(isRegeneration ? "Requisição para REgerar texto com IA recebida." : "Requisição para gerar texto com IA recebida.");
        removeOverlay(contextMenuEl);

        if (!isRegeneration) {
            const confirm = await showCustomAlert(
                "A IA gerará um texto automaticamente pra você.<br>É um processo que pode demorar de 1 a 2 minutos.<br><br><b>Prosseguir?</b>",
                'question',
                [
                    { text: 'Não', value: false, class: 'secondary' },
                    { text: 'Sim', value: true }
                ],
                'bmAIGenConfirmDialog'
            );
             removeOverlay('bmAIGenConfirmDialog');

            if (!confirm) {
                console.log("Geração de texto cancelada pelo usuário.");
                return;
            }
        }

        console.log("Usuário confirmou (ou é regeneração). Iniciando...");
        let loadingUIData = null;
        if (!isRegeneration) {
             loadingUIData = showAILoadingOverlayStyled("Extraindo contexto da página...");
             updateAIProgressBar(loadingUIData.progressBarElement, 10);
         } else {
             loadingUIData = showAILoadingOverlayStyled("Regenerando texto com a IA...");
             updateAIProgressBar(loadingUIData.progressBarElement, 30);
         }


        try {
            let currentPrompt;
            if (isRegeneration && promptToUse) {
                currentPrompt = promptToUse;
                 if (loadingUIData?.statusTextElement) loadingUIData.statusTextElement.textContent = "Enviando prompt para IA...";
                 updateAIProgressBar(loadingUIData.progressBarElement, 40);
                 await new Promise(r => setTimeout(r, 300));
            } else {
                const pageContext = extractPageContext();
                if (!pageContext) {
                    throw new Error("Não foi possível extrair o contexto necessário da página.");
                }
                updateAIProgressBar(loadingUIData.progressBarElement, 25);
                if (loadingUIData.statusTextElement) loadingUIData.statusTextElement.textContent = "Construindo prompt para IA...";
                await new Promise(r => setTimeout(r, 500));

                currentPrompt = `Crie uma redação, e envie somente ela, sem título, sem textos adicionais, sem NADA a mais. Somente o texto da redação entre ${AI_GENERATION_MIN_WORDS} palavras (no minimo) e ${AI_GENERATION_MAX_WORDS} palavras (no maximo).\n\n${pageContext}`;
                lastAIGenerationPrompt = currentPrompt;

                if (loadingUIData.statusTextElement) loadingUIData.statusTextElement.textContent = "Comunicando com a IA...";
                updateAIProgressBar(loadingUIData.progressBarElement, 40);
            }


            const generatedText = await callPuterAI(currentPrompt);
            updateAIProgressBar(loadingUIData.progressBarElement, 100);
            removeOverlay(loadingUIData.overlayElement);

            console.log("Texto gerado/regenerado pela IA recebido.");

            const userChoice = await showAIGenerationResult(generatedText, currentPrompt);


            if (userChoice.action === 'write') {
                console.log("Usuário escolheu 'Escrever'. Verificando target...");

                const targetTextarea = document.querySelector(TARGET_TEXTAREA_SELECTOR);

                if (targetTextarea && document.body.contains(targetTextarea)) {

                    const writeMode = await showCustomAlert(
                        "Como você deseja inserir o texto gerado?",
                        'question',
                        [
                            { text: 'Cancelar', value: 'cancel', class: 'secondary' },
                            { text: 'Escrever no final do texto', value: 'append' },
                            { text: 'Substituir o texto atual', value: 'replace' }
                        ],
                        'bmAIWriteModeDialog'
                    );
                    removeOverlay('bmAIWriteModeDialog');

                    if (writeMode === 'replace') {
                        console.log("Usuário escolheu: Substituir texto.");

                        showWritingSplash();


                        const cleared = await clearTextareaSimulated(targetTextarea);
                        if (!cleared) {
                            console.error("Falha ao limpar a textarea antes de substituir.");
                            removeOverlay('bmWritingSplash');
                            showCustomAlert("Erro: Não foi possível limpar a área de texto antes de escrever.", 'error');
                            return;
                        }

                        activeEl = targetTextarea;
                        const writeSuccess = await typeTextFast(userChoice.text, targetTextarea);


                        removeOverlay('bmWritingSplash');

                        if (writeSuccess) {
                            showCustomAlert("Texto gerado pela IA foi escrito (substituindo o anterior)!", 'success');
                        } else {
                            showCustomAlert("Erro ao tentar escrever o texto substituído.", 'error');
                        }

                    } else if (writeMode === 'append') {
                        console.log("Usuário escolheu: Escrever no final.");
                        const writingSplashOverlay = showWritingSplash();
                        let appendSuccess = false;
                        try {
                             const currentText = targetTextarea.value;
                             const separator = currentText.trim().length > 0 ? "\n\n" : "";
                             const newText = currentText + separator + userChoice.text;

                             targetTextarea.focus({ preventScroll: true });
                             await new Promise(r => setTimeout(r, 50));

                             const prototype = Object.getPrototypeOf(targetTextarea);
                             const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                             if (valueSetter) {
                                  valueSetter.call(targetTextarea, newText);
                             } else {
                                  targetTextarea.value = newText;
                             }

                             targetTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                             targetTextarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                             targetTextarea.scrollTop = targetTextarea.scrollHeight;
                             targetTextarea.selectionStart = newText.length;
                             targetTextarea.selectionEnd = newText.length;

                             appendSuccess = true;
                             console.log("Texto da IA anexado com sucesso.");

                        } catch (error) {
                             console.error("Erro ao anexar texto da IA:", error);
                        }
                        removeOverlay(writingSplashOverlay);

                        if (appendSuccess) {
                             showCustomAlert("Texto gerado pela IA foi adicionado ao final!", 'success');
                        } else {
                             showCustomAlert("Erro ao tentar anexar o texto gerado.", 'error');
                        }

                    } else {
                        console.log("Usuário cancelou a escrita do texto da IA.");
                    }

                } else {
                    console.error("Textarea principal da página não encontrada para escrever o texto gerado.");
                    showCustomAlert("Erro: Não foi possível encontrar a área de texto principal na página para escrever.", 'error');
                }


            } else if (userChoice.action === 'regenerate') {
                console.log("Usuário escolheu 'Regenerar'.");

                await handleAIGenerationRequest(true, userChoice.prompt);
            } else {
                console.log("Usuário escolheu 'Abandonar'.");
                lastAIGenerationPrompt = null;
            }

        } catch (error) {
            console.error("Erro durante o processo de geração de texto AI:", error);
            removeOverlay(loadingUIData?.overlayElement);
            showCustomAlert(`Erro ao gerar texto: ${error.message}`, 'error');
            lastAIGenerationPrompt = null;
        }
    }
     // --- Funções de Correção (showModeSelectionDialog, getContextAroundError, etc.) ---
     async function showModeSelectionDialog() { const buttons = [ { text: 'Básico', value: 'basic', class: 'secondary' }, { text: 'Avançado', value: 'advanced' } ]; return await showCustomAlert( 'Escolha o modo de correção:', 'question', buttons, 'bmModeSelectionDialog' ); }
     async function showBasicModeConfirmationDialog() { const buttons = [ { text: 'Cancelar', value: false, class: 'secondary' }, { text: 'Continuar (Básico)', value: true } ]; return await showCustomAlert( 'Modo Básico:\nA correção será totalmente automática (usará a primeira sugestão do site).\nNenhuma tela de correção será exibida.', 'warning', buttons, 'bmBasicConfirmDialog' ); }
     function getContextAroundError(fullText, errorText, wordsBefore = 5, wordsAfter = 3) { const words = fullText.split(/(\s+)/); const errorWords = errorText.trim().split(/(\s+)/); let startIndex = -1; for (let i = 0; i <= words.length - errorWords.length; i++) { let match = true; for (let j = 0; j < errorWords.length; j++) { if (words[i + j] !== errorWords[j]) { match = false; break; } } if (match) { startIndex = i; break; } } if (startIndex === -1) { return { before: ``, error: errorText, after: "" }; } const endIndex = startIndex + errorWords.length; let beforeContext = []; let wordsCountedBefore = 0; for (let i = startIndex - 1; i >= 0 && wordsCountedBefore < wordsBefore; i--) { beforeContext.unshift(words[i]); if (words[i].trim().length > 0) { wordsCountedBefore++; } } let afterContext = []; let wordsCountedAfter = 0; for (let i = endIndex; i < words.length && wordsCountedAfter < wordsAfter; i++) { afterContext.push(words[i]); if (words[i].trim().length > 0) { wordsCountedAfter++; } } const joinWithSpace = (arr) => arr.join(''); return { before: joinWithSpace(beforeContext), error: errorText, after: joinWithSpace(afterContext) }; }
     function showAdvancedCorrectionSplash(initialMessage = "Preparando correção avançada...") { removeOverlay('bmAdvCorrectionSplash'); correctionSplashEl = document.createElement('div'); correctionSplashEl.id = 'bmAdvCorrectionSplash'; correctionSplashEl.innerHTML = ` <div class="bmAdvSplashContent"> <h2>${initialMessage}</h2> <div class="bmAdvContextDisplay">.</div> <div class="bmAdvOptionsContainer" style="display: none;"> <div class="bmAdvSuggestionButtons"></div> <div class="bmAdvActionButtons"></div> </div> <div class="bmAdvLoadingState" style="display: none;"> <div class="spinner"></div> <div class="applying-text">Processando...</div> </div> </div>`; document.body.appendChild(correctionSplashEl); void correctionSplashEl.offsetWidth; correctionSplashEl.classList.add('visible'); }
     async function updateAdvancedCorrectionSplash(context, suggestions) { if (!correctionSplashEl || !document.body.contains(correctionSplashEl)) return Promise.reject("Splash de correção avançada não visível."); const splashContent = correctionSplashEl.querySelector('.bmAdvSplashContent'); const h2 = splashContent.querySelector('h2'); const contextDisplay = splashContent.querySelector('.bmAdvContextDisplay'); const optionsContainer = splashContent.querySelector('.bmAdvOptionsContainer'); const suggestionContainer = splashContent.querySelector('.bmAdvSuggestionButtons'); const actionContainer = splashContent.querySelector('.bmAdvActionButtons'); const loadingState = splashContent.querySelector('.bmAdvLoadingState'); h2.textContent = 'Escolha a Correção:'; loadingState.style.display = 'none'; optionsContainer.style.display = 'block'; contextDisplay.style.opacity = 0; contextDisplay.style.transform = 'translateY(10px)'; await new Promise(r => setTimeout(r, 50)); contextDisplay.innerHTML = `<span class="context-before">${context.before}</span> <span class="error-word">${context.error}</span> <span class="context-after">${context.after}</span>`; contextDisplay.style.opacity = 1; contextDisplay.style.transform = 'translateY(0)'; suggestionContainer.innerHTML = ''; suggestions.forEach((sug, index) => { const btn = document.createElement('button'); btn.className = 'bmAdvSuggestionButton'; btn.textContent = sug; btn.style.opacity = 0; btn.style.transform = 'scale(0.8)'; btn.style.animation = `advButtonPopIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${0.1 + index * 0.08}s forwards`; btn.onclick = () => { if (currentCorrectionResolver) { currentCorrectionResolver({ type: 'suggestion', value: sug }); currentCorrectionResolver = null; showApplyingStateInSplash("Aplicando sugestão..."); } }; suggestionContainer.appendChild(btn); }); actionContainer.innerHTML = ''; const manualBtn = document.createElement('button'); manualBtn.className = 'bmAdvActionButton manual'; manualBtn.textContent = 'Escrever Manualmente'; manualBtn.style.opacity = 0; manualBtn.style.transform = 'translateX(-20px)'; manualBtn.style.animation = `advActionButtonSlideIn 0.5s ease-out ${0.1 + suggestions.length * 0.08}s forwards`; manualBtn.onclick = async () => { if (currentCorrectionResolver) {
                        // Substituindo o showCustomAlert por um prompt simples para compatibilidade/simplicidade
                        const correctionValue = prompt(`Digite a correção manual para "${context.error}":`, context.error);
                        if (correctionValue !== null) { // Se o usuário não clicou em Cancelar
                             currentCorrectionResolver({ type: 'manual', value: correctionValue });
                             currentCorrectionResolver = null;
                             showApplyingStateInSplash("Aplicando correção manual...");
                        } else { // Usuário cancelou o prompt
                             currentCorrectionResolver({ type: 'skip' }); // Tratar como skip se cancelado
                             currentCorrectionResolver = null;
                             showApplyingStateInSplash("Operação manual cancelada.");
                        }
                   }
             }; actionContainer.appendChild(manualBtn); const skipBtn = document.createElement('button'); skipBtn.className = 'bmAdvActionButton skip'; skipBtn.textContent = 'Pular Erro'; skipBtn.style.opacity = 0; skipBtn.style.transform = 'translateX(20px)'; skipBtn.style.animation = `advActionButtonSlideIn 0.5s ease-out ${0.15 + suggestions.length * 0.08}s forwards`; skipBtn.onclick = () => { if (currentCorrectionResolver) { currentCorrectionResolver({ type: 'skip' }); currentCorrectionResolver = null; showApplyingStateInSplash("Pulando erro..."); } }; actionContainer.appendChild(skipBtn); return new Promise(resolve => { currentCorrectionResolver = resolve; }); }
     function showApplyingStateInSplash(message = "Aplicando alterações...") { if (!correctionSplashEl || !document.body.contains(correctionSplashEl)) return; const loadingState = correctionSplashEl.querySelector('.bmAdvLoadingState'); const applyingText = loadingState.querySelector('.applying-text'); const optionsContainer = correctionSplashEl.querySelector('.bmAdvOptionsContainer'); if (loadingState && applyingText && optionsContainer) { optionsContainer.style.display = 'none'; if(applyingText) applyingText.textContent = message; loadingState.style.display = 'flex'; loadingState.style.opacity = 0; void loadingState.offsetWidth; loadingState.style.transition = 'opacity 0.3s ease-in'; loadingState.style.opacity = 1; } }
     function hideAdvancedCorrectionSplash() { if (correctionSplashEl) { removeOverlay(correctionSplashEl); correctionSplashEl = null; } }



    // --- Função de Inicialização ---
    async function initializeScript() {
        console.log("Paraná Tecla V2: Iniciando inicialização...");

        // 1. Checar se UI já existe (caso o loader seja clicado novamente)
        if (document.getElementById('bmWrapper')) {
            console.log("Paraná Tecla V2: UI já existe. Saindo da inicialização.");
            // Talvez mostrar a UI novamente se estiver oculta
             const wrapper = document.getElementById('bmWrapper');
             if (wrapper) {
                 wrapper.style.display = 'block';
                 wrapper.classList.add('show');
             }
            return;
        }

        // 2. Carregar o CSS
        try {
            // !!! IMPORTANTE: SUBSTITUA PELA URL REAL DO SEU CSS NO GITHUB RAW !!!
            const cssRawUrl = 'URL_PARA_SEU_STYLE_CSS_NO_GITHUB_RAW';
            await loadCSS(cssRawUrl);
        } catch (error) {
            showCustomAlert(`Falha crítica: Não foi possível carregar os estilos necessários.\n${error.message}`, 'error');
            window.paranaTeclaV2Loaded = false; // Permite tentar carregar novamente
            return; // Interrompe a inicialização se o CSS falhar
        }

        // 3. Mostrar Splash Screen (Opcional, pode remover se não quiser splash)
        const splash = document.createElement('div');
        splash.id = 'bmSplash';
        splash.innerHTML = `<div id="bmSplashContent"><img id="bmSplashImg" src="https://i.imgur.com/RUWcJ6e.png"/> <div id="bmSplashTexts"> <div id="bmSplashTitle">Paraná Tools</div> <div id="bmSplashSubtitle">Redação Paraná</div> </div> <div id="bmLoadingBar"><div id="bmLoadingProgress"></div></div> </div> <div id="bmSplashBgEffect"></div><div class="bmSplashGrid"></div>`;
        document.body.appendChild(splash);

        const splashTimeout = 3800;
        setTimeout(() => {
            if (document.body.contains(splash)) { splash.remove(); }

            // 4. Criar e Mostrar a UI Principal
            uiWrapperElement = document.createElement('div');
            uiWrapperElement.id = 'bmWrapper';
             // Ajuste no innerHTML para usar variáveis CSS se necessário ou manter valores fixos
            uiWrapperElement.innerHTML = `
                <div id="bmHeader"><span>Paraná Tecla V2</span><span id="bmMinimizeBtn" title="Minimizar/Expandir">-</span></div>
                <div id="bmContent">
                    <textarea id="bmText" placeholder="Cole o texto para digitar aqui..." class="bmFadeInSlideUp" style="animation-delay: 0.1s;"></textarea>
                    <input id="bmDelay" type="number" step="1" value="${MIN_DELAY}" min="0" placeholder="Delay Digitação (ms)" title="Delay entre caracteres na digitação (ms)" class="bmFadeInSlideUp" style="animation-delay: 0.15s;">
                    <div id="bmToggleWrapper" class="bmFadeInSlideUp" style="animation-delay: 0.2s;" title="Oculta a janela quando o mouse não está sobre ela."><div id="bmToggleImg"></div> <span id="bmToggleText">Modo Disfarçado</span></div>
                    <div id="bmDarkModeToggleWrapper" class="bmFadeInSlideUp" style="animation-delay: 0.25s;" title="Ativa/Desativa o modo escuro para a página inteira."><div id="bmDarkModeToggleImg"></div> <span id="bmDarkModeToggleText">Modo Escuro Página</span></div>
                    <button id="bmBtn" class="bmFadeInSlideUp" style="animation-delay: 0.3s;" title="Inicia a digitação simulada do texto acima no campo focado na página.">Iniciar Digitação</button>
                    <button id="bmBtnCorrect" class="bmFadeInSlideUp" style="animation-delay: 0.35s;" title="Inicia o processo de correção automática dos erros indicados na página.">Corrigir Automaticamente</button>
                    <div id="bmMoreOptionsBtn" title="Mais Opções (Geração IA)" class="bmFadeInSlideUp" style="animation-delay: 0.4s;">...</div>
                </div>
            `;
            document.body.appendChild(uiWrapperElement);

            setTimeout(() => uiWrapperElement.classList.add('show'), 50);

            // 5. Adicionar Lógica da UI (Arrastar, Minimizar, Stealth, Dark Mode, Botões)
            setupUIInteractions();

        }, splashTimeout); // Fim do setTimeout do Splash

    } // Fim da função initializeScript

    // --- Função para Configurar Interações da UI ---
    function setupUIInteractions() {
        const bmContent = document.getElementById('bmContent');
        const bmMinimizeBtn = document.getElementById('bmMinimizeBtn');
        const header = document.getElementById('bmHeader');

        // Lógica de Arrastar Janela
        let isDragging = false;
        let dragStartX, dragStartY, initialLeft, initialTop;
        header.onmousedown = e => {
            if (e.target === bmMinimizeBtn || bmMinimizeBtn.contains(e.target)) return;
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const rect = uiWrapperElement.getBoundingClientRect();
            initialLeft = rect.left; // Usar getBoundingClientRect para mais precisão
            initialTop = rect.top;
            header.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('mouseup', onDragUp);
            e.preventDefault();
        };
        function onDragMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            const newLeft = Math.max(0, Math.min(window.innerWidth - uiWrapperElement.offsetWidth, initialLeft + dx));
            const newTop = Math.max(0, Math.min(window.innerHeight - uiWrapperElement.offsetHeight, initialTop + dy));
            uiWrapperElement.style.left = newLeft + 'px';
            uiWrapperElement.style.top = newTop + 'px';
             // Atualizar rect para modo stealth se estiver ativo
             if (stealthOn) {
                 try { rectStealth = uiWrapperElement.classList.contains('minimized') ? header.getBoundingClientRect() : uiWrapperElement.getBoundingClientRect(); } catch (err) { console.warn("Erro ao obter rect no drag com stealth.") }
             }
        }
        function onDragUp() {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'move';
                document.removeEventListener('mousemove', onDragMove);
                document.removeEventListener('mouseup', onDragUp);
            }
        }

        // Lógica de Minimizar/Expandir
         let rectStealth = null; // Variável para guardar o rect no modo stealth
        if (bmMinimizeBtn && uiWrapperElement) {
            bmMinimizeBtn.onclick = (e) => {
                e.stopPropagation();
                const isMinimized = uiWrapperElement.classList.toggle('minimized');
                bmMinimizeBtn.textContent = isMinimized ? '+' : '-';
                bmMinimizeBtn.title = isMinimized ? 'Expandir' : 'Minimizar';
                 // Atualizar rect para modo stealth se estiver ativo
                 if (stealthOn) {
                     setTimeout(() => { try { rectStealth = uiWrapperElement.classList.contains('minimized') ? header.getBoundingClientRect() : uiWrapperElement.getBoundingClientRect(); } catch (err) { console.warn("Erro ao obter rect no modo disfarçado minimizado.") } }, 360);
                 }
            };
        }

        // Lógica do Modo Disfarçado (Stealth)
        const toggleWrapper = document.getElementById('bmToggleWrapper');
        const toggleBox = document.getElementById('bmToggleImg');
        let firstTimeStealth = true;


        function handleStealthMouseMove(ev) {
             if (!stealthOn || !uiWrapperElement || !document.body.contains(uiWrapperElement)) { exitStealth(); return; }
             try {
                  // Obter o retângulo APENAS se necessário (transição ou primeira vez)
                 if (!rectStealth || uiWrapperElement.style.opacity === '1' || uiWrapperElement.style.opacity === '') {
                      rectStealth = uiWrapperElement.classList.contains('minimized') ? header.getBoundingClientRect() : uiWrapperElement.getBoundingClientRect();
                      if (!rectStealth || rectStealth.width === 0 || rectStealth.height === 0) return; // Retângulo inválido, não fazer nada
                  }
                  const mouseX = ev.clientX;
                  const mouseY = ev.clientY;
                  const isInside = (mouseX >= rectStealth.left && mouseX <= rectStealth.right && mouseY >= rectStealth.top && mouseY <= rectStealth.bottom);

                  if (isInside) {
                      if (uiWrapperElement.style.opacity !== '1') {
                          uiWrapperElement.style.opacity = 1;
                          uiWrapperElement.style.pointerEvents = 'auto';
                      }
                  } else {
                      if (uiWrapperElement.style.opacity !== '0') {
                          uiWrapperElement.style.opacity = 0;
                          uiWrapperElement.style.pointerEvents = 'none';
                           // Anular rectStealth para forçar recalcular na próxima vez que o mouse entrar
                           rectStealth = null;
                      }
                  }
             } catch (err) {
                 console.warn("Erro no handleStealthMouseMove:", err);
                 exitStealth();
             }
        }
         function enterStealth() {
             if (!uiWrapperElement || !document.body.contains(uiWrapperElement)) return;
             stealthOn = true;
             uiWrapperElement.classList.add('stealth-mode');
             toggleBox.classList.add('active');
             uiWrapperElement.style.opacity = 1;
             uiWrapperElement.style.pointerEvents = 'auto';
             try {
                  rectStealth = uiWrapperElement.classList.contains('minimized') ? header.getBoundingClientRect() : uiWrapperElement.getBoundingClientRect();
                  if (!rectStealth || rectStealth.width === 0 || rectStealth.height === 0) { throw new Error("Rect inválido ao entrar no modo disfarçado."); }
                  document.addEventListener('mousemove', handleStealthMouseMove);

                  // Pequeno delay antes de esconder inicialmente
                  setTimeout(() => {
                       if (stealthOn && uiWrapperElement && !uiWrapperElement.matches(':hover')) { // Só esconde se o mouse JÁ não estiver em cima
                           uiWrapperElement.style.opacity = 0;
                           uiWrapperElement.style.pointerEvents = 'none';
                           rectStealth = null; // Resetar rect
                       }
                  }, 300);
                  console.log("Stealth Mode Ativado");
             } catch (err) {
                 console.error("Erro ao entrar no modo disfarçado:", err);
                 exitStealth();
                 showCustomAlert("Erro ao ativar Modo Disfarçado.", "error");
             }
         }
         function exitStealth() {
             stealthOn = false;
             document.removeEventListener('mousemove', handleStealthMouseMove);
             if (uiWrapperElement && document.body.contains(uiWrapperElement)) {
                 uiWrapperElement.classList.remove('stealth-mode');
                 toggleBox.classList.remove('active');
                 uiWrapperElement.style.opacity = 1;
                 uiWrapperElement.style.pointerEvents = 'auto';
             }
             rectStealth = null;
             console.log("Stealth Mode Desativado");
         }
         function showStealthOverlay() {
             const ovId = 'bmStealthInfoOv';
             removeOverlay(ovId);
             const ov = document.createElement('div'); ov.id = ovId; ov.className = 'bmDialogOverlay';
             ov.innerHTML = `<div id="bmOvContent" class="bmDialogBox"> <img src="https://i.imgur.com/RquEok4.gif" alt="Demo" style="max-width: 80%; height: auto; border-radius: 8px;"/> <p class="bmDialogMessage" style="margin-top: 25px;">O Modo Disfarçado oculta a janela quando o mouse não está sobre ela. Mova o mouse para a área da janela para revelá-la.</p> <div class="bmDialogButtonContainer"><button id="bmOvBtnStealth" class="bmDialogButton">Entendido</button></div></div>`;
             document.body.appendChild(ov);
             const box = ov.querySelector('.bmDialogBox');
             ov.classList.add('bmDialogFadeIn');
             box.classList.add('bmDialogEnter');
             document.getElementById('bmOvBtnStealth').onclick = () => {
                 removeOverlay(ov);
                 enterStealth();
             };
         }
        toggleWrapper.onclick = () => {
            if (!stealthOn) {
                if (firstTimeStealth) {
                    firstTimeStealth = false;
                    showStealthOverlay();
                } else {
                    enterStealth();
                }
            } else {
                exitStealth();
            }
        };


        // Lógica do Modo Escuro da Página
        const darkModeToggleWrapper = document.getElementById('bmDarkModeToggleWrapper');
        const darkModeToggleBox = document.getElementById('bmDarkModeToggleImg');
        const applyDarkMode = (activate) => {
            isDarkModeOn = activate;
            darkModeToggleBox.classList.toggle('active', isDarkModeOn);
            document.body.classList.toggle('bm-dark-mode', isDarkModeOn);
            console.log("Dark Mode Página:", isDarkModeOn ? "ON" : "OFF");
        };

        // Ativa o modo escuro por padrão ao iniciar
        applyDarkMode(true);

        darkModeToggleWrapper.onclick = () => {
            applyDarkMode(!isDarkModeOn);
        };

        // Lógica dos Botões Principais (Iniciar Digitação, Corrigir)
        const startButton = document.getElementById('bmBtn');
        const correctButton = document.getElementById('bmBtnCorrect');

        // --- Lógica Botão Iniciar Digitação ---
        startButton.onclick = async function () {
            const text = document.getElementById('bmText').value;

            const delayInput = document.getElementById('bmDelay');
            let delayMs = parseInt(delayInput.value, 10);
            if (isNaN(delayMs) || delayMs < 0) {
                 console.warn(`Delay inválido (${delayInput.value}), usando ${MIN_DELAY}ms.`);
                 delayMs = MIN_DELAY;
                 delayInput.value = delayMs;
             }

            if (!text) {
                showCustomAlert('Área de texto do script está vazia!', 'error');
                return;
            }
            if (!activeEl || !document.body.contains(activeEl)) {
                showCustomAlert('Clique no campo da página onde deseja digitar antes de iniciar!', 'warning');
                return;
            }

            if (!(activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                 showCustomAlert('O elemento clicado não parece ser um campo de texto editável!', 'error');
                 return;
             }

            if (isCorrectionRunning) {
                showCustomAlert('Aguarde a correção automática terminar antes de digitar.', 'warning');
                return;
            }

            this.disabled = true;
            if (correctButton) correctButton.disabled = true;


            for (let n = 3; n >= 1; n--) {
                const cnt = document.createElement('div');
                cnt.className = 'bmCountdownNumber';
                cnt.textContent = n;
                if (uiWrapperElement && document.body.contains(uiWrapperElement)) {
                    uiWrapperElement.appendChild(cnt);
                } else { break; }
                await new Promise(r => setTimeout(r, 700));
                if (uiWrapperElement && uiWrapperElement.contains(cnt)) {
                    uiWrapperElement.removeChild(cnt);
                }
                await new Promise(r => setTimeout(r, 100));
            }

            let typingCompleted = true;
            console.log(`Iniciando digitação simulada com delay de ${delayMs}ms...`);
            try {
                const targetElementForTyping = activeEl;
                targetElementForTyping.focus({ preventScroll: true });

                for (let i = 0; i < text.length; i++) {
                    const char = text[i];

                    const success = sendChar(char, targetElementForTyping);
                    if (!success) {

                        console.warn(`Falha ao digitar caractere: "${char}"`);
                        // Não interrompe, mas registra
                    }
                    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
                }

                 // Verifica se o texto foi realmente digitado (comparação simples)
                 let finalValue = '';
                 if (targetElementForTyping.tagName === 'INPUT' || targetElementForTyping.tagName === 'TEXTAREA') {
                      finalValue = targetElementForTyping.value;
                 } else if (targetElementForTyping.isContentEditable) {
                      finalValue = targetElementForTyping.innerText || targetElementForTyping.textContent;
                 }
                 // Uma verificação simples, pode não ser perfeita para todos os casos
                 if (finalValue.includes(text.slice(-10))) { // Verifica se os últimos caracteres estão lá
                      showCustomAlert('Digitação simulada concluída!', 'success');
                 } else {
                      console.warn("A digitação parece ter falhado ou sido interrompida.");
                      showCustomAlert('Atenção: A digitação pode não ter sido concluída corretamente.', 'warning');
                 }


            } catch (error) {
                console.error("Erro na digitação simulada:", error);
                showCustomAlert(`Erro inesperado durante a digitação:\n${error.message}`, 'error');
            } finally {
                this.disabled = false;
                if (correctButton) correctButton.disabled = false;
            }
        };


        // --- Lógica Botão Corrigir Automaticamente ---
        correctButton.onclick = async function () {
             if (isCorrectionRunning) { showCustomAlert('Correção já em andamento.', 'warning'); return; }
             isCorrectionRunning = true;
             const btnCorrect = this; btnCorrect.disabled = true; if (startButton) startButton.disabled = true;
             console.log('Solicitando modo de correção...');
             let correctionMode = null;
             let targetTextarea = null;
             let correctionProcessRan = false;
             let finalMessage = "Nenhuma ação realizada.";
             let finalType = "info";
             let loadingUIData = null;

             // Limpa overlays anteriores por segurança
             removeOverlay('bmAIReviewSplash'); removeOverlay('bmAILoadingSplash'); hideAdvancedCorrectionSplash();

             try {
                 correctionMode = await showModeSelectionDialog();
                 removeOverlay('bmModeSelectionDialog');
                 if (correctionMode === 'basic') {
                     console.log('Modo Básico selecionado. Confirmando...');
                     const confirmBasic = await showBasicModeConfirmationDialog();
                      removeOverlay('bmBasicConfirmDialog');
                     if (!confirmBasic) { throw new Error("Modo Básico cancelado pelo usuário."); }
                     console.log('Modo Básico confirmado.');
                 } else if (correctionMode === 'advanced') {
                     console.log('Modo Avançado selecionado.');
                     showAdvancedCorrectionSplash(".");
                     await new Promise(r => setTimeout(r, 300));
                 } else {
                     throw new Error("Nenhum modo de correção selecionado.");
                 }

                 // Verificações Iniciais
                 let initialChecksOk = false;
                 try {
                      console.log("Procurando textarea alvo...");

                      targetTextarea = await waitForElement(TARGET_TEXTAREA_SELECTOR, 5000);
                      console.log('Textarea alvo encontrada.');
                      activeEl = targetTextarea; // Define como elemento ativo para digitação/correção

                      // Verifica botão "CORRIGIR ONLINE" / "Concluir"
                      let needsCorrectorClick = false;
                      const allButtons = document.querySelectorAll('button');
                      let foundCorrectorButton = null;
                      let foundWaitingButton = null;
                      let concludeButtonExists = false;

                      for (const button of allButtons) {
                          const buttonText = button.textContent.trim();
                          if (buttonText === "Concluir") {
                              concludeButtonExists = true;
                              console.log("Botão 'Concluir' encontrado. Correção já feita ou não necessária.");
                              break;
                          }
                          if (buttonText.includes("CORRIGIR ONLINE")) {
                               if (buttonText === "CORRIGIR ONLINE") {
                                   foundCorrectorButton = button;
                               } else {
                                   foundWaitingButton = button;
                                   break;
                               }
                          }
                      }

                      if (concludeButtonExists) {
                           // Não precisa clicar em nada
                      } else if (foundWaitingButton) {
                          throw new Error(`'Corrigir Online' está em processo de espera ("${foundWaitingButton.textContent}"). Tente novamente mais tarde.`);
                      } else if (foundCorrectorButton) {
                          console.log("Botão 'CORRIGIR ONLINE' encontrado e pronto.");
                          needsCorrectorClick = true;
                          if (correctionMode === 'advanced' && correctionSplashEl) {
                               showApplyingStateInSplash("Iniciando correção online...");
                          } else {
                               console.log("Clicando em 'CORRIGIR ONLINE'...");
                          }
                          foundCorrectorButton.click();
                          console.log("Esperando indicador de processamento desaparecer (se houver)...");

                          const processingSelector = 'div.sc-kAyceB.kEYIQb'; // Seletor do 'PROCESSANDO'
                          try {
                              await waitForElementToDisappear(processingSelector, 45000);
                              console.log("'PROCESSANDO' desapareceu ou não apareceu.");
                          } catch (timeoutError) {
                               console.warn("Timeout esperando 'PROCESSANDO' desaparecer (ignorado, pode não existir).");
                          }
                          await new Promise(r => setTimeout(r, 1000)); // Pausa extra após clique
                      } else {
                          console.log("Botão 'CORRIGIR ONLINE' ou 'Concluir' não encontrado como esperado. Continuando a verificação de erros...");
                      }

                      initialChecksOk = true;
                 } catch (error) {
                      console.error("Erro durante verificações iniciais:", error);
                      const errorMsg = error.message.includes('Timeout') ? `Timeout esperando elemento: ${error.message.split(': ')[1]}` : error.message.includes("'Corrigir Online'") ? error.message : error.message.includes('textarea') ? 'Textarea alvo não encontrada! Verifique o seletor.' : 'Erro inesperado nas verificações iniciais.';

                      throw new Error(errorMsg); // Relança o erro formatado
                 }


                 if (!initialChecksOk || !targetTextarea) { throw new Error("Não foi possível iniciar a correção (falha nas verificações)."); }
                 console.log("Procurando spans de erro...");
                 if (correctionMode === 'advanced' && correctionSplashEl) {
                      const h2 = correctionSplashEl.querySelector('h2'); if (h2) h2.textContent = 'Procurando erros...';
                      await new Promise(r => setTimeout(r, 100));
                 }

                 // Processamento dos Erros
                 const errorSpanSelector = 'span[style*="background-color: rgb"][style*="cursor: pointer"]';
                 let errorSpans = Array.from(document.querySelectorAll(errorSpanSelector));
                 let correctedCount = 0;
                 let skippedCount = 0;
                 let errorCount = 0;
                 let iteration = 0;
                 const MAX_ITERATIONS = errorSpans.length + 20; // Limite generoso

                 if (errorSpans.length === 0 && !concludeButtonExists) { // Verifica se não há spans E o botão concluir também não existe
                     console.log('Nenhum span de erro encontrado.');
                     finalMessage = "Nenhum erro encontrado para correção (baseado nos spans visíveis).";
                     finalType = "info";
                     correctionProcessRan = true;
                     if (correctionMode === 'advanced') hideAdvancedCorrectionSplash();
                 } else if (concludeButtonExists) {
                      console.log("Botão 'Concluir' presente, pulando busca por spans.");
                      finalMessage = "O texto já parece estar corrigido (botão 'Concluir' visível).";
                      finalType = "success";
                      correctionProcessRan = true;
                      if (correctionMode === 'advanced') hideAdvancedCorrectionSplash();
                 } else {
                     console.log(`Encontrados ${errorSpans.length} spans de erro iniciais.`);
                     correctionProcessRan = true;
                     if (correctionMode === 'advanced' && correctionSplashEl) {
                          const h2 = correctionSplashEl.querySelector('h2'); if (h2) h2.textContent = '.'; // Limpa título
                     }

                     // Loop principal de correção
                     while (iteration < MAX_ITERATIONS) {
                         iteration++;
                         errorSpans = Array.from(document.querySelectorAll(errorSpanSelector)); // Reavalia a cada iteração

                         if (errorSpans.length === 0) {
                             console.log("Todos os spans de erro foram processados ou desapareceram.");
                             break;
                         }

                         const errorSpan = errorSpans[0]; // Pega sempre o primeiro visível

                         if (!errorSpan || !document.body.contains(errorSpan) || errorSpan.offsetParent === null) {
                              console.log(`Span ${iteration} inválido, oculto ou já removido, pulando.`);
                              await new Promise(r => setTimeout(r, MIN_DELAY));
                              continue;
                         }

                         const errorTextForContext = errorSpan.textContent;
                         const errorTextTrimmed = errorTextForContext.trim();
                         let actionType = 'none';
                         let chosenCorrection = null;


                         if (!errorTextTrimmed) {
                              console.log(`Span ${iteration} contém apenas espaços ou está vazio, pulando.`);
                              // Poderia tentar remover/clicar para limpar? Por ora, apenas pula.
                              try { errorSpan.click(); await new Promise(r => setTimeout(r, 50)); document.body.click(); } catch(e){}
                              await new Promise(r => setTimeout(r, MIN_DELAY));
                              continue;
                         }

                         console.log(`--- Processando erro ${iteration} (Texto: "${errorTextTrimmed}") ---`);

                         try {
                              errorSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              await new Promise(r => setTimeout(r, SCROLL_DELAY + 100));


                              errorSpan.click();
                              console.log(`Clicou no span: "${errorTextTrimmed}"`);
                              await new Promise(r => setTimeout(r, 150)); // Espera o menu aparecer

                              let suggestions = [];
                              try {

                                   const suggestionMenuSelector = 'ul#menu-list-grow';
                                   const suggestionList = await waitForElement(suggestionMenuSelector, 1500);
                                   console.log("Menu de sugestão encontrado.");
                                   await new Promise(r => setTimeout(r, 100)); // Delay extra para renderizar itens

                                   const suggestionItems = suggestionList.querySelectorAll('li');

                                   suggestions = Array.from(suggestionItems)
                                        .slice(1) // Pula o primeiro item (geralmente o erro original)
                                        .map(li => li.textContent.trim())
                                        .filter(text => text.length > 0 && text.length < 50); // Filtra vazios ou muito longos

                                   if (suggestions.length === 0) { console.warn(`Menu encontrado, mas sem sugestões válidas para "${errorTextTrimmed}".`); }
                                   else { console.log(`Sugestões encontradas para "${errorTextTrimmed}":`, suggestions); }

                              } catch (e) {
                                   console.warn(`Não encontrou lista de sugestões para "${errorTextTrimmed}" após o clique. Menu pode não ter aparecido ou seletor mudou.`);
                                   document.body.click(); await new Promise(r => setTimeout(r, MIN_DELAY)); // Fecha qualquer menu fantasma
                                   if (correctionMode === 'advanced') {
                                        const fullText = targetTextarea.value;
                                        const context = getContextAroundError(fullText, errorTextForContext, ADV_CONTEXT_WORDS, ADV_CONTEXT_WORDS);
                                        const userAction = await updateAdvancedCorrectionSplash(context, []); // Mostra sem sugestões
                                        actionType = userAction.type;
                                        chosenCorrection = userAction.value;
                                   } else {
                                        console.log("Modo básico e sem sugestões, pulando erro.");
                                        actionType = 'skip';
                                   }
                              }


                              if (actionType === 'none') { // Se a ação não foi definida (ou seja, sugestões foram encontradas ou o modo avançado pegará a ação)
                                   if (suggestions.length === 0) {
                                        // Se ainda não tem sugestões e o modo é básico, pula
                                        if (correctionMode === 'basic') {
                                             console.log("Modo básico e sem sugestões, pulando erro.");
                                             actionType = 'skip';
                                        }
                                        // Se for avançado, a chamada anterior a updateAdvancedCorrectionSplash já tratou
                                   } else if (correctionMode === 'basic' || suggestions.length === 1) {
                                        // Modo básico ou apenas uma sugestão: usa a primeira
                                        chosenCorrection = suggestions[0];
                                        actionType = 'auto'; // Marcar como automático
                                        console.log(`Aplicando automaticamente: "${errorTextTrimmed}" -> "${chosenCorrection}" (Modo: ${correctionMode})`);
                                        if (correctionMode === 'advanced') {
                                             // No modo avançado, mesmo com 1 sugestão, mostra rapidamente o applying
                                             const fullText = targetTextarea.value;
                                             const context = getContextAroundError(fullText, errorTextForContext, ADV_CONTEXT_WORDS, ADV_CONTEXT_WORDS);
                                             showApplyingStateInSplash(`Aplicando: ${context.error} → ${chosenCorrection}`);
                                             await new Promise(r => setTimeout(r, 800));
                                        }
                                   } else { // Modo Avançado com múltiplas sugestões
                                        const fullText = targetTextarea.value;
                                        const context = getContextAroundError(fullText, errorTextForContext, ADV_CONTEXT_WORDS, ADV_CONTEXT_WORDS);
                                        const userAction = await updateAdvancedCorrectionSplash(context, suggestions);
                                        actionType = userAction.type;
                                        chosenCorrection = userAction.value;
                                        console.log(`Ação do usuário: ${actionType}, Valor: ${chosenCorrection}`);
                                   }
                              }


                              // Aplica a correção se necessário
                              if ((actionType === 'suggestion' || actionType === 'manual' || actionType === 'auto') && chosenCorrection !== null) {
                                  const originalErrorText = errorTextForContext; // Usa o texto original com espaços

                                  const currentTextValue = targetTextarea.value;
                                  const errorIndex = currentTextValue.indexOf(originalErrorText);

                                  if (errorIndex !== -1) {
                                      console.log(`Encontrado "${originalErrorText}" no índice ${errorIndex}. Substituindo por "${chosenCorrection}".`);
                                      try {
                                          targetTextarea.focus({ preventScroll: true });
                                          await new Promise(r => setTimeout(r, MIN_DELAY));

                                          // Forma mais robusta de substituir
                                          const newValue = currentTextValue.substring(0, errorIndex) + chosenCorrection + currentTextValue.substring(errorIndex + originalErrorText.length);

                                          // Tenta usar o setter do prototype (mais compatível com React/Vue)
                                          const prototype = Object.getPrototypeOf(targetTextarea);
                                          const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                                          if (valueSetter) {
                                              valueSetter.call(targetTextarea, newValue);
                                          } else {
                                              targetTextarea.value = newValue; // Fallback
                                          }

                                          // Dispara eventos para notificar frameworks
                                          targetTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                                          targetTextarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                                          // Atualiza cursor
                                          const newCursorPos = errorIndex + chosenCorrection.length;
                                          targetTextarea.selectionStart = newCursorPos;
                                          targetTextarea.selectionEnd = newCursorPos;

                                          correctedCount++;
                                          console.log(`Correção aplicada (${actionType}): "${originalErrorText}" -> "${chosenCorrection}"`);

                                          // Tenta remover visualmente o span (pode falhar se o DOM mudar muito rápido)
                                          if(errorSpan.parentNode) {
                                              try {
                                                  errorSpan.style.backgroundColor = 'transparent';
                                                  errorSpan.style.cursor = 'default';
                                                  // errorSpan.replaceWith(document.createTextNode(chosenCorrection)); // Mais agressivo
                                              } catch(e){}
                                          }
                                           await new Promise(r => setTimeout(r, 150)); // Pequena pausa pós-correção

                                      } catch (e) {
                                          console.error("Erro durante a substituição direta do valor:", e);
                                          errorCount++; actionType = 'error';
                                      }
                                  } else {
                                      console.warn(`Texto "${originalErrorText}" não foi encontrado na textarea para aplicar correção. Pode já ter sido alterado ou DOM mudou.`);
                                      skippedCount++; // Conta como pulado se não encontrou o texto
                                      actionType = 'skip';
                                  }
                              } else if (actionType === 'skip') {
                                  skippedCount++;
                                  console.log(`Erro "${errorTextTrimmed}" pulado.`);
                              } else if (actionType === 'error') { // Erro explícito ou falha na aplicação
                                 errorCount++;
                                  console.log(`Erro "${errorTextTrimmed}" não pôde ser corrigido (ou sem sugestões).`);
                              }


                              // Fecha o menu de sugestões clicando fora (se ainda existir)
                              document.body.click();
                              await new Promise(r => setTimeout(r, MIN_DELAY * 5)); // Espera eventos propagarem


                         } catch (error) {
                              console.error(`Erro geral ao processar span ${iteration} ("${errorTextTrimmed}"):`, error);
                              errorCount++;
                              try { document.body.click(); } catch (e) { } // Tenta fechar menus
                              await new Promise(r => setTimeout(r, MIN_DELAY));
                         }

                         // Pausa entre etapas
                         await new Promise(r => setTimeout(r, STEP_DELAY));

                     } // Fim do While

                     // Verifica se saiu por limite de iterações
                     if (iteration >= MAX_ITERATIONS) {
                         console.warn("Máximo de iterações de correção atingido. Interrompendo para evitar loop infinito.");
                         finalMessage = "Processo de correção interrompido (limite de iterações). Pode haver erros restantes.";
                         finalType = "warning";
                         errorCount++; // Conta como erro se atingiu o limite
                     } else {
                          // Processamento normal concluído
                          console.log('Processamento de spans concluído.');
                          const processedCount = correctedCount + skippedCount + errorCount;
                          if (processedCount === 0 && errorSpans.length === 0 && correctionProcessRan && !concludeButtonExists) {
                              finalMessage = "Foram encontrados spans de erro inicialmente, mas nenhum foi processado (possivelmente já corrigidos ou inválidos)."; finalType = "warning";
                          } else if (correctedCount > 0 && skippedCount === 0 && errorCount === 0) {
                              finalMessage = `Correção finalizada! ${correctedCount} erros processados com sucesso.`; finalType = "success";
                          } else if (correctedCount > 0 || skippedCount > 0 || errorCount > 0) {
                              finalMessage = `Correção concluída: ${correctedCount} corrigido(s), ${skippedCount} pulado(s), ${errorCount > 0 ? `<br><b>${errorCount} erro(s) durante o processo.</b>` : ''}`;
                              if (errorCount > 0) finalType = "warning";
                              else if (correctedCount > 0) finalType = "success";
                              else finalType = "info"; // Se só pulou
                          }
                           // Se saiu do loop e não há mais spans, E o botão concluir existe, mensagem de sucesso
                           else if (errorSpans.length === 0 && concludeButtonExists) {
                                finalMessage = "Correção verificada e/ou concluída com sucesso.";
                                finalType = "success";
                           }
                     }
                 } // Fim do Else (se havia spans iniciais)


                 // Oculta o splash avançado se estiver visível
                 if (correctionMode === 'advanced') { hideAdvancedCorrectionSplash(); await new Promise(r => setTimeout(r, 450)); }
                 else { console.log("Modo Básico: Finalizando."); await new Promise(r => setTimeout(r, 50)); }

                 // --- Revisão Final Opcional pela IA ---
                 if (correctionProcessRan && targetTextarea && document.body.contains(targetTextarea)) {
                      removeOverlay('bmAIReviewSplash'); removeOverlay('bmAILoadingSplash');
                      const wantAIReview = await showAIReviewOverlayStyled();
                      if (wantAIReview) {
                          console.log("Usuário optou pela revisão final da IA.");
                          const aiStatusMessages = [ "Revisando seu texto...", "Analisando detalhes...", "Aplicando ajustes finos...", "Quase pronto...", "Paraná Tools informa: 'Revisado!'" ];
                          let currentMessageIndex = 0;
                          loadingUIData = showAILoadingOverlayStyled(aiStatusMessages[0]);
                          updateAIProgressBar(loadingUIData.progressBarElement, 5);

                          // Limpa intervalo antigo se existir
                          if (aiStatusIntervalId) clearInterval(aiStatusIntervalId);
                          aiStatusIntervalId = setInterval(() => {
                               currentMessageIndex = (currentMessageIndex + 1) % (aiStatusMessages.length -1); // Não repete a última msg
                               if (loadingUIData?.statusTextElement) { loadingUIData.statusTextElement.textContent = aiStatusMessages[currentMessageIndex]; }
                               else { clearInterval(aiStatusIntervalId); aiStatusIntervalId = null; }
                          }, AI_STATUS_UPDATE_INTERVAL);

                          try {
                               const currentText = targetTextarea.value;
                               if (!currentText.trim()) { throw new Error("A caixa de texto está vazia, não há nada para revisar."); }
                               updateAIProgressBar(loadingUIData.progressBarElement, 20);

                               // Prompt para revisão mínima
                               const reviewPrompt = `Revise este texto e corrija os minimos detalhes ortográficos e gramaticais. Não é para mudar NADA do sentido original, apenas erros. Não adicione NADA, nem título, nem introdução, nem conclusão extra. Retorne APENAS o texto corrigido.\n\nTEXTO ORIGINAL:\n${currentText}`;

                               const aiCorrectedText = await callPuterAI(reviewPrompt);
                               console.log("IA retornou texto revisado.");
                               updateAIProgressBar(loadingUIData.progressBarElement, 70);
                               if (loadingUIData?.statusTextElement) loadingUIData.statusTextElement.textContent = "Aplicando revisão...";
                               if (aiStatusIntervalId) { clearInterval(aiStatusIntervalId); aiStatusIntervalId = null; } // Para o intervalo

                               const cleared = await clearTextareaSimulated(targetTextarea);
                                if (!cleared) throw new Error("Falha ao limpar textarea para aplicar revisão da IA.");
                               updateAIProgressBar(loadingUIData.progressBarElement, 90);
                               await typeTextFast(aiCorrectedText, targetTextarea); // Usa a digitação rápida
                               updateAIProgressBar(loadingUIData.progressBarElement, 100);
                               if (loadingUIData?.statusTextElement) loadingUIData.statusTextElement.textContent = aiStatusMessages[aiStatusMessages.length - 1]; // Mostra msg final
                               await new Promise(r => setTimeout(r, 1200)); // Tempo para ler msg final
                               removeOverlay(loadingUIData.overlayElement); loadingUIData = null;
                               finalMessage += "\nRevisão final da IA aplicada."; finalType = "success";
                          } catch (aiError) {
                               console.error("Erro durante o processo da IA de revisão:", aiError);
                               if (aiStatusIntervalId) { clearInterval(aiStatusIntervalId); aiStatusIntervalId = null; }
                               removeOverlay(loadingUIData?.overlayElement); loadingUIData = null;
                               await showCustomAlert(`Erro na revisão final da IA: ${aiError.message}`, 'error');
                               // Não sobrescreve a mensagem final da correção, apenas mostra o erro da IA
                          }
                      } else { console.log("Usuário pulou a revisão final da IA."); }
                 } else { console.log("Processo de correção não executado ou textarea sumiu, pulando revisão da IA."); }

                 // Mostra a mensagem final consolidada
                 showCustomAlert(finalMessage, finalType);

             } catch (e) {
                  console.error("Erro geral no fluxo de correção:", e);
                  // Evita mostrar alerta para cancelamentos explícitos do usuário
                  if (e.message !== "Modo Básico cancelado pelo usuário." && e.message !== "Nenhum modo de correção selecionado.") {
                       // Mostra alerta para outros erros
                       showCustomAlert(`Ocorreu um erro na correção: ${e.message}`, 'error');
                  }
                  hideAdvancedCorrectionSplash(); // Garante que o splash avançado suma em caso de erro
             } finally {
                  console.log("--- Correção Automática Finalizada (Bloco Finally) ---");
                  isCorrectionRunning = false;
                  btnCorrect.disabled = false;
                  if (startButton) startButton.disabled = false;
                  currentCorrectionResolver = null; // Limpa resolver pendente
                  if (aiStatusIntervalId) { clearInterval(aiStatusIntervalId); aiStatusIntervalId = null; } // Limpa intervalo da IA

                  // Limpa overlays que podem ter ficado abertos
                  removeOverlay(loadingUIData?.overlayElement);
                  removeOverlay('bmAIReviewSplash'); removeOverlay('bmAILoadingSplash');
                  removeOverlay('bmAdvCorrectionSplash'); removeOverlay('bmAlertOverlay');
                  removeOverlay('bmModeSelectionDialog'); removeOverlay('bmBasicConfirmDialog');
                  removeOverlay('bmManualCorrectionPrompt'); removeOverlay('bmOverwriteConfirmDialog');
             }
         }; // Fim do correctButton.onclick


        // Lógica do Botão Mais Opções (...) e Menu de Contexto
        const moreOptionsBtn = document.getElementById('bmMoreOptionsBtn');
        moreOptionsBtn.onclick = (e) => {
            e.stopPropagation(); // Impede que o clique feche o menu imediatamente

            // Se o menu já existe, remove-o
            if (contextMenuEl && document.body.contains(contextMenuEl)) {
                removeOverlay(contextMenuEl);
                contextMenuEl = null;
                return;
            }
            removeOverlay('bmContextMenu'); // Garante limpeza de menus antigos

            contextMenuEl = document.createElement('div');
            contextMenuEl.id = 'bmContextMenu';
            contextMenuEl.className = 'bmContextMenu';
            contextMenuEl.innerHTML = `
                <button class="bmContextMenuItem" id="bmGenerateAITextBtn">Gerar Texto com IA</button>
                `; // Adicione mais botões aqui se necessário

            const btnRect = moreOptionsBtn.getBoundingClientRect();
            contextMenuEl.style.position = 'fixed'; // Usar fixed para posicionar relativo à viewport
            // Posiciona abaixo e alinhado à esquerda do botão '...'
            contextMenuEl.style.top = `${btnRect.bottom + 5}px`;
            contextMenuEl.style.left = `${btnRect.left}px`;


            document.body.appendChild(contextMenuEl);

            // Força reflow para a animação funcionar
            void contextMenuEl.offsetWidth;
            contextMenuEl.classList.add('visible');

            // Adiciona listener para fechar o menu ao clicar fora
            const closeMenuHandler = (event) => {
                if (contextMenuEl && !contextMenuEl.contains(event.target) && event.target !== moreOptionsBtn) {
                    removeOverlay(contextMenuEl);
                    contextMenuEl = null;
                    document.removeEventListener('click', closeMenuHandler, true);
                }
            };
            // Adiciona o listener no próximo ciclo de eventos para não capturar o clique que abriu
            setTimeout(() => document.addEventListener('click', closeMenuHandler, true), 0);

            // Adiciona ação ao botão do menu
            document.getElementById('bmGenerateAITextBtn').onclick = () => handleAIGenerationRequest(false);
        };

    } // Fim da função setupUIInteractions


    // --- Ponto de Entrada Principal ---
    // Verifica se o DOM está pronto (embora em bookmarklets isso geralmente já esteja)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript);
    } else {
        initializeScript();
    }

})(); // Fim da IIFE (Immediately Invoked Function Expression)