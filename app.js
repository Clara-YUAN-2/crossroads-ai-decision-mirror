(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const storageKey = 'crossroad-mirror-state-v2';

  const tarotCards = [
    { id: 0, roman: '0', name: '愚者', keywords: ['开始', '好奇', '轻装上路'], color: '#f6d85d' },
    { id: 1, roman: 'I', name: '魔术师', keywords: ['行动', '资源', '主动创造'], color: '#eaa58e' },
    { id: 2, roman: 'II', name: '女祭司', keywords: ['直觉', '安静', '尚未说出口'], color: '#9fcbd5' },
    { id: 3, roman: 'III', name: '皇后', keywords: ['滋养', '丰盛', '照顾需要'], color: '#b7cfaa' },
    { id: 4, roman: 'IV', name: '皇帝', keywords: ['边界', '秩序', '承担'], color: '#d99b86' },
    { id: 5, roman: 'V', name: '教皇', keywords: ['传统', '经验', '可信建议'], color: '#d8c39a' },
    { id: 6, roman: 'VI', name: '恋人', keywords: ['价值一致', '关系', '选择'], color: '#efb6b0' },
    { id: 7, roman: 'VII', name: '战车', keywords: ['方向', '意志', '向前'], color: '#93bdc8' },
    { id: 8, roman: 'VIII', name: '力量', keywords: ['温柔坚定', '耐心', '内在力量'], color: '#efc66b' },
    { id: 9, roman: 'IX', name: '隐者', keywords: ['独处', '内在声音', '留白'], color: '#b8c6bd' },
    { id: 10, roman: 'X', name: '命运之轮', keywords: ['变化', '周期', '接受流动'], color: '#a8c8d9' },
    { id: 11, roman: 'XI', name: '正义', keywords: ['权衡', '事实', '公平'], color: '#e6b39c' },
    { id: 12, roman: 'XII', name: '倒吊人', keywords: ['换个角度', '暂停', '松开执念'], color: '#b8d5ce' },
    { id: 13, roman: 'XIII', name: '死神', keywords: ['结束', '转变', '腾出空间'], color: '#aeb2ae' },
    { id: 14, roman: 'XIV', name: '节制', keywords: ['调和', '适量', '找到节奏'], color: '#a8d1c4' },
    { id: 15, roman: 'XV', name: '恶魔', keywords: ['惯性', '诱惑', '看见束缚'], color: '#c28f8a' },
    { id: 16, roman: 'XVI', name: '高塔', keywords: ['松动', '意外', '重建'], color: '#d4a373' },
    { id: 17, roman: 'XVII', name: '星星', keywords: ['希望', '坦诚', '慢慢恢复'], color: '#b7d7df' },
    { id: 18, roman: 'XVIII', name: '月亮', keywords: ['模糊', '情绪', '辨认担心'], color: '#aebbd5' },
    { id: 19, roman: 'XIX', name: '太阳', keywords: ['清晰', '活力', '真实快乐'], color: '#f5cc4f' },
    { id: 20, roman: 'XX', name: '审判', keywords: ['回望', '回应召唤', '重新选择'], color: '#dcb3a2' },
    { id: 21, roman: 'XXI', name: '世界', keywords: ['完整', '完成', '看见全局'], color: '#9fc8b1' },
  ];

  const initialState = () => ({
    step: 1,
    question: '',
    analysis: null,
    options: [],
    criteriaOptions: [],
    selectedCriteria: [],
    thirdRoute: null,
    thirdRouteAdopted: false,
    drawHistory: [],
    drawnCard: null,
    redrawUsed: false,
    tarotInsight: null,
    scenarios: null,
    scenarioMode: 'base',
    selectedChoice: '',
    records: [],
  });

  let state = initialState();
  let toastTimer;

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === 'object') state = { ...initialState(), ...saved };
      if (!Array.isArray(state.records)) state.records = [];
      if (!Array.isArray(state.options)) state.options = [];
    } catch (_) {
      state = initialState();
    }
  }

  function persistState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    const saveState = $('#saveState');
    if (saveState) {
      saveState.textContent = '正在保存…';
      setTimeout(() => { saveState.textContent = '草稿已保存'; }, 450);
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3000);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
    })[character]);
  }

  async function callAI(action, payload) {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'AI 暂时没有回应');
    return result.data;
  }

  async function checkAIHealth() {
    const label = $('#aiConnectionState');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const result = await response.json();
      if (!result.ok) throw new Error('missing key');
      label.textContent = `● ${result.model} READY`;
      label.classList.add('is-ready');
    } catch (_) {
      label.textContent = '● AI OFFLINE';
      label.classList.remove('is-ready');
    }
  }

  function setButtonLoading(button, loading, text) {
    if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    button.innerHTML = loading ? `<span class="button-spinner"></span>${text}` : button.dataset.originalText;
  }

  function localFallbackAnalysis(question) {
    let parts = question.split(/\s*(?:还是|或者|或是|\bvs\.?\b|\bor\b)\s*/i).map((item) => item.trim()).filter(Boolean);
    if (parts.length < 2) {
      const match = question.match(/^要不要(.+)$/);
      if (match) parts = [`去做${match[1]}`, `暂时不做${match[1]}`];
    }
    if (parts.length < 2) parts = [question, `暂时不决定，先补充信息`];
    const needsFor = (text) => {
      if (/奶茶/.test(text)) return ['甜味满足', '熟悉的慰藉', '更浓郁的口感'];
      if (/果茶/.test(text)) return ['清爽解腻', '果香体验', '相对轻盈'];
      if (/买|购/.test(text)) return ['立即拥有', '解决当下需要', '减少等待'];
      if (/等|不|暂时/.test(text)) return ['保留余地', '降低成本', '获得更多信息'];
      return ['当下需要', '情绪感受', '实际便利'];
    };
    return {
      risk_level: 'S1',
      question_summary: `你正在比较“${parts[0]}”和“${parts[1]}”`,
      options: parts.slice(0, 2).map((title) => ({ title, may_satisfy: needsFor(title) })),
      criteria: ['当下感受', '实际代价', '之后是否后悔'],
      third_route: { title: '先做一个小份尝试', description: '降低单次投入，先体验一小部分，再根据真实感受决定。' },
    };
  }

  function normalizeAnalysis(data, question) {
    const fallback = localFallbackAnalysis(question);
    const rawOptions = Array.isArray(data?.options) ? data.options : fallback.options;
    const options = rawOptions.slice(0, 2).map((option, index) => ({
      title: String(option?.title || fallback.options[index]?.title || `选项 ${index + 1}`).slice(0, 60),
      may_satisfy: (Array.isArray(option?.may_satisfy) ? option.may_satisfy : fallback.options[index]?.may_satisfy || []).slice(0, 3).map(String),
    }));
    while (options.length < 2) options.push(fallback.options[options.length]);
    const criteria = (Array.isArray(data?.criteria) ? data.criteria : fallback.criteria).slice(0, 4).map((item) => String(item).slice(0, 12));
    return {
      risk_level: data?.risk_level || 'S1',
      question_summary: String(data?.question_summary || fallback.question_summary).slice(0, 120),
      options,
      criteria,
      third_route: {
        title: String(data?.third_route?.title || fallback.third_route.title).slice(0, 40),
        description: String(data?.third_route?.description || fallback.third_route.description).slice(0, 160),
      },
    };
  }

  async function analyzeQuestion() {
    const input = $('#questionInput');
    const question = input.value.trim();
    if (question.length < 2) {
      showToast('写下两个字以上就可以开始。');
      input.focus();
      return;
    }
    state.question = question;
    const button = $('#beginButton');
    setButtonLoading(button, true, '正在听懂你的问题…');
    try {
      const result = await callAI('analyze', { question });
      if (result.risk_level === 'S3' || result.risk_level === 'S4') {
        renderSafetyResponse(result.safety_message);
        $('#mirror').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      applyAnalysis(normalizeAnalysis(result, question));
      showToast('DeepSeek 已根据你的问题重新整理了选项。');
    } catch (error) {
      applyAnalysis(normalizeAnalysis(localFallbackAnalysis(question), question));
      showToast(`AI 连接稍慢，已先用本地识别继续：${error.message}`);
    } finally {
      setButtonLoading(button, false);
    }
  }

  function renderSafetyResponse(message) {
    state.analysis = { risk_level: 'S3' };
    state.options = [];
    $('#step-one-title').textContent = '这个问题更适合交给专业支持。';
    $('#analysisSubtitle').textContent = message || '这里先不进入抽牌与情景推演。';
    $('#optionA').value = '';
    $('#optionB').value = '';
    $('#optionASatisfy').textContent = '已暂停趣味流程';
    $('#optionBSatisfy').textContent = '优先整理需要确认的专业问题';
    $('.next-step[data-next="2"]').disabled = true;
    persistState();
  }

  function applyAnalysis(analysis) {
    state.analysis = analysis;
    state.options = analysis.options;
    state.criteriaOptions = analysis.criteria;
    state.selectedCriteria = analysis.criteria.slice(0, 3);
    state.thirdRoute = analysis.third_route;
    state.drawHistory = [];
    state.drawnCard = null;
    state.redrawUsed = false;
    state.tarotInsight = null;
    state.scenarios = null;
    state.selectedChoice = '';
    renderAnalysis();
    setStep(1, false);
    $('.next-step[data-next="2"]').disabled = false;
    persistState();
    $('#mirror').scrollIntoView({ behavior: 'smooth' });
  }

  function renderAnalysis() {
    if (!state.analysis || state.options.length < 2) return;
    $('#step-one-title').textContent = `我听见的是：${state.analysis.question_summary}`;
    $('#analysisSubtitle').textContent = '看看是不是你的本意；所有内容都可以继续修改。';
    $('#optionA').value = state.options[0].title;
    $('#optionB').value = state.options[1].title;
    $('#optionASatisfy').textContent = `可能满足：${state.options[0].may_satisfy.join('、')}`;
    $('#optionBSatisfy').textContent = `可能满足：${state.options[1].may_satisfy.join('、')}`;
    $('#thirdRouteTitle').textContent = state.thirdRoute?.title || '也许还有第三条路';
    $('#thirdRouteDescription').textContent = state.thirdRoute?.description || '先补充一点信息，再决定。';
    renderCriteria();
    syncOptionNames(false);
  }

  function renderCriteria() {
    const container = $('#criteriaChips');
    container.innerHTML = state.criteriaOptions.map((criterion) => {
      const selected = state.selectedCriteria.includes(criterion) ? 'is-selected' : '';
      return `<button class="${selected}" type="button" data-criterion="${escapeHTML(criterion)}">${escapeHTML(criterion)}</button>`;
    }).join('') + '<button type="button" id="addCriterion">＋ 自定义</button>';
  }

  function syncOptionNames(shouldPersist = true) {
    if (state.options.length < 2) return;
    state.options[0].title = $('#optionA').value.trim() || '选项 A';
    state.options[1].title = $('#optionB').value.trim() || '选项 B';
    $('#routeAName').textContent = state.options[0].title;
    $('#routeBName').textContent = state.options[1].title;
    $('#choiceAName').textContent = state.options[0].title;
    $('#choiceBName').textContent = state.options[1].title;
    $('#choiceCName').textContent = state.thirdRoute?.title || '第三条路';
    $('#choiceCDetail').textContent = state.thirdRoute?.description || '先补信息再决定';
    if (shouldPersist) {
      state.scenarios = null;
      persistState();
    }
  }

  function setStep(step, shouldScroll = true) {
    state.step = Number(step);
    $$('.flow-step').forEach((section) => {
      const active = Number(section.dataset.step) === state.step;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    $('#completionCard').hidden = true;
    $$('.step-marker').forEach((marker) => {
      const markerStep = Number(marker.dataset.stepTarget);
      marker.classList.toggle('is-active', markerStep === state.step);
      marker.classList.toggle('is-complete', markerStep < state.step);
    });
    persistState();
    if (shouldScroll) $('.flow-window').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function shuffledDeck() {
    const list = [...tarotCards];
    let seed = hashText(state.question || '岔路牌');
    for (let i = list.length - 1; i > 0; i -= 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function backPattern(card) {
    const x1 = 28 + ((card.id * 17) % 70);
    const y1 = 38 + ((card.id * 23) % 90);
    const x2 = 116 - ((card.id * 11) % 58);
    const y2 = 178 - ((card.id * 13) % 72);
    return `<svg viewBox="0 0 140 220" aria-hidden="true"><rect x="6" y="6" width="128" height="208" rx="12"/><rect x="15" y="15" width="110" height="190" rx="8"/><circle cx="70" cy="110" r="37"/><path d="M70 64v92M24 110h92M43 83l54 54M43 137l54-54"/><circle cx="${x1}" cy="${y1}" r="3"/><circle cx="${x2}" cy="${y2}" r="2"/><path d="M${x1} ${y1}L${x2} ${y2}"/></svg>`;
  }

  function renderDeck() {
    if (state.drawnCard) {
      showDrawnCard();
      return;
    }
    $('#tarotDeckIntro').hidden = false;
    $('#tarotCarousel').hidden = false;
    $('#drawnResult').hidden = true;
    const deck = shuffledDeck();
    $('#tarotTrack').innerHTML = deck.map((card, index) => {
      const used = state.drawHistory.includes(card.id);
      return `<button class="tarot-pick-card ${used ? 'is-used' : ''}" type="button" data-card-id="${card.id}" style="--deck-index:${index};--card-accent:${card.color}" ${used ? 'disabled' : ''} aria-label="抽取第 ${index + 1} 张牌">${backPattern(card)}<span>${used ? '已抽过' : String(index + 1).padStart(2, '0')}</span></button>`;
    }).join('');
    requestAnimationFrame(() => { $('#tarotCarousel').scrollLeft = Math.max(0, ($('#tarotTrack').scrollWidth - $('#tarotCarousel').clientWidth) / 2); });
  }

  function cardArt(card) {
    const arts = [
      '<path d="M42 196c22-70 46-112 77-131M92 66l27-1-5 26M66 111c15 2 25 12 29 28M45 200c34-19 70-17 106 0"/><circle cx="74" cy="85" r="13"/><path d="M62 87l-15 13M82 96l19 28"/>',
      '<path d="M36 199h128M100 51v117M100 52l-12 23h24l-12-23ZM54 91h92M59 166c12-31 29-47 41-47s29 16 41 47"/><circle cx="52" cy="67" r="7"/><circle cx="148" cy="67" r="7"/>',
      '<path d="M51 196c7-45 9-91 4-137M149 196c-7-45-9-91-4-137M55 76c25-19 55-19 90 0M76 135c17 14 32 14 49 0"/><circle cx="100" cy="105" r="25"/><path d="M88 104c7 6 16 6 24 0"/>',
      '<path d="M43 197c27-44 47-77 57-123 10 46 30 79 57 123M68 130c-21-11-34-28-37-52 25 2 43 13 55 33M132 130c21-11 34-28 37-52-25 2-43 13-55 33"/><circle cx="100" cy="55" r="16"/>',
      '<path d="M45 197h110M60 197V84h80v113M60 84l18-28 22 28 22-28 18 28M76 116h48M76 145h48"/><circle cx="100" cy="50" r="5"/>',
      '<path d="M45 196h110M62 196V83M138 196V83M50 83h100M76 83c0-22 48-22 48 0M78 118h44M78 145h44"/><path d="M100 42v21M90 52h20"/>',
      '<path d="M100 200c-12-32-58-49-58-88 0-35 43-46 58-14 15-32 58-21 58 14 0 39-46 56-58 88Z"/><path d="M65 63l35 35 35-35M100 40v58"/>',
      '<path d="M44 190h112M60 190l12-83h56l12 83M72 107l28-34 28 34M84 140h32M100 73V42"/><circle cx="100" cy="37" r="5"/>',
      '<path d="M42 187c24-15 43-41 58-77 15 36 34 62 58 77M64 115c-9-25 7-49 36-49s45 24 36 49M78 87c8 11 36 11 44 0"/><circle cx="100" cy="46" r="12"/>',
      '<path d="M100 42v139M100 60c-23 8-35 25-35 51s13 43 35 51M100 60c23 8 35 25 35 51s-13 43-35 51M70 181h60"/><path d="M100 42l-14 25h28l-14-25Z"/>',
      '<circle cx="100" cy="119" r="62"/><circle cx="100" cy="119" r="38"/><path d="M100 57v124M38 119h124M56 75l88 88M56 163l88-88"/><circle cx="100" cy="119" r="8"/>',
      '<path d="M100 48v132M54 79h92M66 79l-25 57h50L66 79ZM134 79l-25 57h50l-25-57ZM72 180h56"/>',
      '<path d="M61 195h78M100 195V69M100 69c-23 7-38 21-43 42M100 69c23 7 38 21 43 42M73 48h54M100 48v21"/><circle cx="57" cy="119" r="9"/><circle cx="143" cy="119" r="9"/>',
      '<path d="M44 191c37-12 75-12 112 0M68 169c5-32 16-57 32-76 16 19 27 44 32 76M100 93V45M83 61l17-16 17 16"/><path d="M62 121c-16-4-27-14-32-30M138 121c16-4 27-14 32-30"/>',
      '<path d="M49 188h102M62 188c9-29 22-48 38-59 16 11 29 30 38 59M76 119l-18-42h84l-18 42M80 77c0-26 40-26 40 0"/><path d="M91 48h18M100 39v18"/>',
      '<path d="M52 193c11-31 27-56 48-75 21 19 37 44 48 75M67 92c8 19 19 28 33 28s25-9 33-28M70 92c11-45 49-45 60 0"/><path d="M100 43v35M84 60h32"/>',
      '<path d="M54 192h92M66 192V79h68v113M66 79l19-24 15 24 15-24 19 24M76 109l48 48M124 109l-48 48"/><path d="M43 55l23 24M157 55l-23 24"/>',
      '<path d="M100 42l12 39 41 1-33 23 12 39-32-23-32 23 12-39-33-23 41-1 12-39Z"/><path d="M55 187c29-18 59-18 90 0M72 151c10 14 19 21 28 21s18-7 28-21"/><circle cx="47" cy="145" r="5"/><circle cx="153" cy="145" r="5"/>',
      '<path d="M142 112c-9 23-29 38-53 38-32 0-58-26-58-58s26-58 58-58c24 0 44 15 53 38-31-9-51 9-51 20s20 29 51 20Z"/><path d="M57 179c25-12 50-12 76 0"/><circle cx="70" cy="82" r="4"/>',
      '<circle cx="100" cy="99" r="48"/><path d="M100 31v-17M100 184v-17M32 99H15M185 99h-17M52 51 40 39M148 51l12-12M52 147l-12 12M148 147l12 12"/><path d="M63 187c24-17 49-17 74 0"/>',
      '<path d="M44 174c20-13 39-36 56-69 17 33 36 56 56 69M61 174h78M72 98c6-24 15-39 28-45 13 6 22 21 28 45"/><path d="M100 31v22M85 38l15 15 15-15"/>',
      '<circle cx="100" cy="112" r="66"/><path d="M100 46c-19 20-28 42-28 66s9 46 28 66M100 46c19 20 28 42 28 66s-9 46-28 66M34 112h132M47 76h106M47 148h106"/><circle cx="100" cy="112" r="10"/>',
    ];
    return `<svg viewBox="0 0 200 230"><rect x="4" y="4" width="192" height="222" rx="10"/>${arts[card.id]}</svg>`;
  }

  async function selectTarotCard(cardId) {
    const card = tarotCards.find((item) => item.id === Number(cardId));
    if (!card || state.drawHistory.includes(card.id)) return;
    const orientation = (hashText(`${state.question}-${card.id}-${state.drawHistory.length}`) % 4 === 0) ? '逆位' : '正位';
    state.drawnCard = { id: card.id, orientation };
    state.drawHistory.push(card.id);
    state.tarotInsight = null;
    persistState();
    showDrawnCard();
    $('#toScenarios').disabled = true;
    try {
      const insight = await callAI('tarot', { question: state.question, options: state.options, card: { name: card.name, orientation, keywords: card.keywords } });
      state.tarotInsight = {
        message: String(insight.message || '').slice(0, 240),
        reflection_questions: (Array.isArray(insight.reflection_questions) ? insight.reflection_questions : []).slice(0, 2).map(String),
      };
    } catch (_) {
      state.tarotInsight = {
        message: `${card.name}没有替你选答案，它只是提醒你留意“${card.keywords[0]}”：在“${state.options[0]?.title}”与“${state.options[1]?.title}”之间，你真正不想失去的是什么？`,
        reflection_questions: [`如果先放下“应该”，你现在更靠近哪一种需要？`, `哪个选项最能回应你此刻在意的“${card.keywords[1]}”？`],
      };
    }
    persistState();
    showDrawnCard();
    $('#toScenarios').disabled = false;
  }

  function showDrawnCard() {
    if (!state.drawnCard) return renderDeck();
    const card = tarotCards.find((item) => item.id === state.drawnCard.id);
    $('#tarotDeckIntro').hidden = true;
    $('#tarotCarousel').hidden = true;
    $('#drawnResult').hidden = false;
    $('#cardNumber').textContent = card.roman;
    $('#cardName').textContent = `${card.name} · ${state.drawnCard.orientation}`;
    $('#cardKeywords').textContent = card.keywords.join(' · ');
    $('#tarotCardFront').style.background = card.color;
    $('#tarotCardArt').innerHTML = cardArt(card);
    if (!state.tarotInsight) {
      $('#tarotMessage').textContent = '正在结合你的问题，听听这张牌带来的角度…';
      $('#reflectionQuestions').innerHTML = '<span class="thinking-line"></span><span class="thinking-line short"></span>';
    } else {
      $('#tarotMessage').textContent = state.tarotInsight.message;
      $('#reflectionQuestions').innerHTML = state.tarotInsight.reflection_questions.map((question) => `<blockquote>“${escapeHTML(question)}”</blockquote>`).join('');
    }
    const redraw = $('#redrawButton');
    redraw.disabled = state.redrawUsed;
    redraw.textContent = state.redrawUsed ? '已使用重抽机会，两张牌都会保留' : '不来电？回到牌组再抽一次（仅 1 次）';
  }

  function normalizeScenarios(data) {
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    return {
      routes: state.options.map((option, index) => {
        const source = routes[index] || {};
        const modes = {};
        ['base', 'bright', 'risk'].forEach((mode) => {
          const item = source.scenarios?.[mode] || {};
          modes[mode] = {
            summary: String(item.summary || '等待你补充更多信息。'),
            premise: String(item.premise || '当前信息能够成立。'),
            gain: String(item.gain || '可能满足一部分当前需要。'),
            cost: String(item.cost || '仍有需要承担的取舍。'),
            action: String(item.action || '先做一个低成本的小验证。'),
            reversibility: String(item.reversibility || '可以根据实际情况调整。'),
          };
        });
        return { option: option.title, scenarios: modes };
      }),
      unknowns: (Array.isArray(data?.unknowns) ? data.unknowns : ['还缺少哪些事实信息？', '哪个代价最难接受？', '这次决定最晚何时需要做出？']).slice(0, 4).map(String),
    };
  }

  async function loadScenarios() {
    setStep(3);
    syncOptionNames(false);
    $('#step-three-title').textContent = '正在排出三版可能剧本…';
    $('.route-grid').classList.add('is-loading');
    $('#scenarioCriteriaText').textContent = `共同标准：${state.selectedCriteria.join('、') || '等待补充'}`;
    if (!state.scenarios) {
      try {
        const result = await callAI('scenarios', { question: state.question, options: state.options, criteria: state.selectedCriteria });
        state.scenarios = normalizeScenarios(result);
      } catch (error) {
        state.scenarios = normalizeScenarios(null);
        showToast(`情景生成暂时失败，已保留可编辑草稿：${error.message}`);
      }
    }
    $('#step-three-title').textContent = '不是预言，是三版可以修改的可能剧本。';
    $('.route-grid').classList.remove('is-loading');
    renderScenario(state.scenarioMode || 'base');
    persistState();
  }

  const scenarioFields = ['Summary', 'Premise', 'Gain', 'Cost', 'Action', 'Reversibility'];
  function renderScenario(mode) {
    if (!state.scenarios?.routes?.length) return;
    state.scenarioMode = mode;
    const routeA = state.scenarios.routes[0].scenarios[mode];
    const routeB = state.scenarios.routes[1].scenarios[mode];
    scenarioFields.forEach((suffix) => {
      const field = suffix.toLowerCase();
      const a = $(`#routeA${suffix}`);
      const b = $(`#routeB${suffix}`);
      a.textContent = routeA[field];
      b.textContent = routeB[field];
      a.contentEditable = 'true';
      b.contentEditable = 'true';
      a.dataset.route = '0'; a.dataset.field = field;
      b.dataset.route = '1'; b.dataset.field = field;
      a.classList.add('editable-copy'); b.classList.add('editable-copy');
    });
    $('#routeAName').textContent = state.options[0].title;
    $('#routeBName').textContent = state.options[1].title;
    $('#unknownsList').innerHTML = state.scenarios.unknowns.map((item) => `<li contenteditable="true">${escapeHTML(item)}</li>`).join('');
    $$('.scenario-tabs button').forEach((button) => {
      const active = button.dataset.scenario === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function initScenarioEditing() {
    $('.route-grid').addEventListener('input', (event) => {
      const node = event.target.closest('[data-route][data-field]');
      if (!node || !state.scenarios) return;
      state.scenarios.routes[Number(node.dataset.route)].scenarios[state.scenarioMode][node.dataset.field] = node.textContent.trim();
      persistState();
    });
    $('#unknownsList').addEventListener('input', () => {
      if (!state.scenarios) return;
      state.scenarios.unknowns = $$('#unknownsList li').map((item) => item.textContent.trim()).filter(Boolean);
      persistState();
    });
  }

  function initQuestion() {
    const input = $('#questionInput');
    input.value = state.question || '';
    $('#charCount').textContent = input.value.length;
    input.addEventListener('input', () => {
      $('#charCount').textContent = input.value.length;
      state.question = input.value;
      persistState();
    });
    $$('.prompt-chip').forEach((chip) => chip.addEventListener('click', () => {
      input.value = chip.textContent.includes('聚会') ? '去聚会还是在家休息' : '现在买下它还是再等等';
      input.dispatchEvent(new Event('input'));
      input.focus();
    }));
    $('#beginButton').addEventListener('click', analyzeQuestion);
  }

  function initCriteria() {
    $('#criteriaChips').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.id === 'addCriterion') {
        $('#customCriterion').hidden = false;
        $('#customCriterionInput').focus();
        return;
      }
      const criterion = button.dataset.criterion;
      if (!criterion) return;
      if (state.selectedCriteria.includes(criterion)) state.selectedCriteria = state.selectedCriteria.filter((item) => item !== criterion);
      else if (state.selectedCriteria.length < 3) state.selectedCriteria.push(criterion);
      else return showToast('一次保留 1–3 个重点就够啦。');
      renderCriteria();
      state.scenarios = null;
      persistState();
    });
    $('#confirmCriterion').addEventListener('click', () => {
      const input = $('#customCriterionInput');
      const criterion = input.value.trim();
      if (!criterion) return input.focus();
      if (!state.criteriaOptions.includes(criterion)) state.criteriaOptions.push(criterion);
      if (state.selectedCriteria.length < 3 && !state.selectedCriteria.includes(criterion)) state.selectedCriteria.push(criterion);
      input.value = '';
      $('#customCriterion').hidden = true;
      renderCriteria();
      state.scenarios = null;
      persistState();
    });
    $('#cancelCriterion').addEventListener('click', () => { $('#customCriterion').hidden = true; });
    $('#customCriterionInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#confirmCriterion').click(); });
    $('#useThirdRoute').addEventListener('click', (event) => {
      state.thirdRouteAdopted = !state.thirdRouteAdopted;
      event.currentTarget.textContent = state.thirdRouteAdopted ? '已采用 ✓' : '采用';
      event.currentTarget.closest('.third-route').classList.toggle('is-adopted', state.thirdRouteAdopted);
      persistState();
    });
  }

  function initTarot() {
    $('#tarotTrack').addEventListener('click', (event) => {
      const card = event.target.closest('.tarot-pick-card');
      if (card) selectTarotCard(card.dataset.cardId);
    });
    const carousel = $('#tarotCarousel');
    let dragging = false; let startX = 0; let startScroll = 0; let moved = false; let pressedCard = null;
    carousel.addEventListener('pointerdown', (event) => {
      dragging = true; moved = false; pressedCard = event.target.closest('.tarot-pick-card'); startX = event.clientX; startScroll = carousel.scrollLeft;
      carousel.setPointerCapture(event.pointerId);
    });
    carousel.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const distance = event.clientX - startX;
      if (Math.abs(distance) > 5) moved = true;
      carousel.scrollLeft = startScroll - distance;
    });
    carousel.addEventListener('pointerup', (event) => {
      dragging = false;
      if (!moved) {
        if (pressedCard) selectTarotCard(pressedCard.dataset.cardId);
      } else {
        event.preventDefault();
        const blocker = (clickEvent) => { clickEvent.preventDefault(); clickEvent.stopPropagation(); };
        carousel.addEventListener('click', blocker, { once: true, capture: true });
      }
      pressedCard = null;
    });
    $('#redrawButton').addEventListener('click', () => {
      if (state.redrawUsed) return;
      state.redrawUsed = true;
      state.drawnCard = null;
      state.tarotInsight = null;
      state.scenarios = null;
      $('#toScenarios').disabled = true;
      persistState();
      renderDeck();
      showToast('再选一张吧，两次牌面都会保留在这次记录里。');
    });
  }

  function initNavigation() {
    $$('.next-step').forEach((button) => button.addEventListener('click', async () => {
      const next = Number(button.dataset.next);
      if (!state.analysis || state.options.length < 2) return showToast('先在上面写下问题并完成分析。');
      syncOptionNames();
      if (next === 2) { setStep(2); renderDeck(); }
      else if (next === 3) {
        if (!state.drawnCard) return showToast('先从 22 张牌里选一张。');
        await loadScenarios();
      } else setStep(next);
    }));
    $$('.previous-step').forEach((button) => button.addEventListener('click', () => {
      const previous = Number(button.dataset.prev);
      setStep(previous);
      if (previous === 2) showDrawnCard();
    }));
    $$('.step-marker').forEach((marker) => marker.addEventListener('click', async () => {
      const target = Number(marker.dataset.stepTarget);
      if (!state.analysis && target > 1) return showToast('先完成问题分析。');
      if (!state.drawnCard && target > 2) return showToast('先从牌组里抽一张牌。');
      if (target === 3) await loadScenarios();
      else { setStep(target); if (target === 2) renderDeck(); }
    }));
    ['optionA', 'optionB'].forEach((id) => $(`#${id}`).addEventListener('input', () => syncOptionNames()));
    $$('.scenario-tabs button').forEach((button) => button.addEventListener('click', () => renderScenario(button.dataset.scenario)));
    $$('.feedback-button').forEach((button) => button.addEventListener('click', () => {
      button.classList.toggle('is-marked');
      button.textContent = button.classList.contains('is-marked') ? '已标记，感谢告诉我 ✓' : '这条不符合实际';
    }));

    const menuButton = $('#mobileMenuButton');
    const menu = $('#mobileMenu');
    menuButton.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      menuButton.setAttribute('aria-expanded', String(open));
    });
    $$('#mobileMenu a').forEach((link) => link.addEventListener('click', () => { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }));
    $('#toneToggle').addEventListener('click', (event) => {
      const calm = document.body.classList.toggle('calm-mode');
      event.currentTarget.setAttribute('aria-pressed', String(calm));
      $('#toneLabel').textContent = calm ? '克制模式' : '轻松模式';
    });
  }

  function initDecision() {
    $$('.choice-button').forEach((button) => button.addEventListener('click', () => {
      state.selectedChoice = button.dataset.choice;
      $$('.choice-button').forEach((item) => item.classList.toggle('is-selected', item === button));
      $('#saveDecisionButton').disabled = false;
      persistState();
    }));
    [['confidenceRange', 'confidenceOutput'], ['satisfactionRange', 'satisfactionOutput']].forEach(([rangeId, outputId]) => {
      const range = $(`#${rangeId}`);
      range.addEventListener('input', () => { $(`#${outputId}`).textContent = `${range.value} / 5`; });
    });
    const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
    const dateValue = new Date(nextWeek.getTime() - nextWeek.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('#followupDate').value = dateValue;
    $('#calendarDay').textContent = String(nextWeek.getDate()).padStart(2, '0');
    $('#followupDate').addEventListener('change', (event) => {
      const date = new Date(`${event.target.value}T00:00:00`);
      if (!Number.isNaN(date.getTime())) $('#calendarDay').textContent = String(date.getDate()).padStart(2, '0');
    });
    $('#saveDecisionButton').addEventListener('click', saveDecision);
    $('#newDecisionButton').addEventListener('click', resetCurrentDecision);
  }

  function saveDecision() {
    const choice = state.selectedChoice === 'A' ? state.options[0]?.title : state.selectedChoice === 'B' ? state.options[1]?.title : state.thirdRoute?.title;
    const record = {
      id: `decision-${Date.now()}`,
      question: state.question,
      choice: choice || '尚未填写',
      confidence: Number($('#confidenceRange').value),
      expectedSatisfaction: Number($('#satisfactionRange').value),
      reason: $('#reasonInput').value.trim(),
      followupDate: $('#followupDate').value,
      createdAt: new Date().toISOString(),
      card: state.drawnCard ? `${tarotCards[state.drawnCard.id].name} · ${state.drawnCard.orientation}` : '',
    };
    state.records.unshift(record);
    persistState();
    $$('.flow-step').forEach((section) => { section.hidden = true; });
    $('#completionCard').hidden = false;
    $('#completionCopy').textContent = `你选择了“${record.choice}”。我们会在 ${record.followupDate}，轻轻问一次后来怎么样。`;
    renderMemory();
    showToast('决定已保存在这台设备上。');
  }

  function resetCurrentDecision() {
    const records = state.records;
    state = initialState();
    state.records = records;
    persistState();
    $('#questionInput').value = '';
    $('#charCount').textContent = '0';
    $('#step-one-title').textContent = '等待你在上面写下一个问题。';
    $('#analysisSubtitle').textContent = '分析完成后，你可以继续修改每一个选项。';
    $('#optionA').value = ''; $('#optionB').value = '';
    $('#optionASatisfy').textContent = '可能满足：等待你的问题开启';
    $('#optionBSatisfy').textContent = '可能满足：等待你的问题开启';
    $('#criteriaChips').innerHTML = '<button type="button" id="addCriterion">＋ 自定义</button>';
    setStep(1, false);
    $('#top').scrollIntoView({ behavior: 'smooth' });
  }

  function renderMemory() {
    const hasRecords = state.records.length > 0;
    $('#memoryEmpty').hidden = hasRecords;
    $('#memoryPopulated').hidden = !hasRecords;
    $('#recordCount').textContent = hasRecords ? `${state.records.length} 条记录 · 等待回访` : '0 条记录 · 等待开启';
    if (!hasRecords) return;
    $('#insightCard').hidden = state.records.length < 3;
    $('#miniReport').hidden = state.records.length < 5;
    const timeline = $('#memoryTimeline');
    timeline.innerHTML = state.records.map((record) => {
      const date = new Date(record.createdAt);
      const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      return `<div class="timeline-item editable-record" data-record-id="${record.id}"><span>${stamp}</span><div><small>${escapeHTML(record.card || '等待回访')}</small><input class="record-question" value="${escapeHTML(record.question)}" readonly/><input class="record-choice" value="${escapeHTML(record.choice)}" readonly/><p>${record.followupDate ? `预计 ${escapeHTML(record.followupDate)} 回来看看` : '未设置回访'}</p></div><div class="record-actions"><button type="button" data-edit-record>编辑</button><button type="button" data-delete-record>删除</button></div></div>`;
    }).join('');
  }

  function initMemory() {
    $('#memoryTimeline').addEventListener('click', (event) => {
      const row = event.target.closest('[data-record-id]');
      if (!row) return;
      const record = state.records.find((item) => item.id === row.dataset.recordId);
      if (!record) return;
      if (event.target.closest('[data-delete-record]')) {
        state.records = state.records.filter((item) => item.id !== record.id);
        persistState(); renderMemory(); showToast('这条记录已删除。'); return;
      }
      const edit = event.target.closest('[data-edit-record]');
      if (edit) {
        const inputs = $$('input', row);
        const editing = edit.textContent === '保存';
        if (editing) {
          record.question = $('.record-question', row).value.trim();
          record.choice = $('.record-choice', row).value.trim();
          inputs.forEach((input) => { input.readOnly = true; });
          edit.textContent = '编辑';
          persistState(); showToast('记录已更新。');
        } else {
          inputs.forEach((input) => { input.readOnly = false; });
          edit.textContent = '保存';
          inputs[0].focus();
        }
      }
    });
    $$('.view-switch button').forEach((button) => button.addEventListener('click', () => {
      $$('.view-switch button').forEach((item) => item.classList.toggle('is-active', item === button));
    }));
  }

  function restoreUI() {
    if (state.analysis && state.options.length >= 2) renderAnalysis();
    if (state.drawnCard) showDrawnCard(); else renderDeck();
    if (state.scenarios) renderScenario(state.scenarioMode || 'base');
    if (state.selectedChoice) {
      const selected = $(`.choice-button[data-choice="${state.selectedChoice}"]`);
      if (selected) selected.classList.add('is-selected');
      $('#saveDecisionButton').disabled = false;
    }
    renderMemory();
    const validStep = !state.analysis ? 1 : (!state.drawnCard ? Math.min(state.step, 2) : Math.min(state.step, 4));
    setStep(validStep || 1, false);
  }

  restoreState();
  initQuestion();
  initCriteria();
  initTarot();
  initScenarioEditing();
  initNavigation();
  initDecision();
  initMemory();
  restoreUI();
  checkAIHealth();
})();
