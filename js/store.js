/*
 * データの保存・読み込みを担当するレイヤー。
 * 今はブラウザの localStorage に保存しているだけだが、
 * 呼び出し側は Store.xxx() という関数だけを使うようにしておくことで、
 * 将来 Supabase 連携に差し替えるときもここだけ変更すれば済むようにしている。
 */
const Store = (() => {
  const STORAGE_KEY = 'kotobazukuri_v1';

  const DEFAULT_WORD_CATEGORIES = [
    '人・呼び方', '感情', '食べ物', '日用品', '天気・自然',
    '時間', '動詞', '場所', '状態・性質', 'あいさつ・会話', '数・量', 'その他'
  ];

  const RULE_CATEGORIES = [
    '単語の作り方', '動詞', '名詞', '形容詞', '過去', '未来',
    '複数', '否定', '疑問', '語順', '発音', '文字', 'その他'
  ];
  // 動詞の語形変化(活用形)とみなすカテゴリ。これ以外(語順・複数など)は
  // パターンを設定しても「動詞」タグの単語には自動反映されない。
  const CONJUGATION_RULE_CATEGORIES = ['過去', '未来', '否定', '疑問'];

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // Supabase連携用のフック。cloud.js が起動時に登録し、単語・ルール・文字・
  // メッセージが作成/更新/削除されるたびに呼ばれて、裏側でクラウドにも書き込む。
  // 何も登録されていなければ(オフライン時など)何もしない。
  let cloudHooks = {};
  function setCloudHooks(hooks) {
    cloudHooks = hooks || {};
  }

  // ローマ字表記のゆれ(si/shi, tu/tsu など)を吸収するため、比較用に一つの表記へ寄せる
  const ROMAJI_NORMALIZE_RULES = [
    [/sya/g, 'sha'], [/syu/g, 'shu'], [/syo/g, 'sho'],
    [/tya/g, 'cha'], [/tyu/g, 'chu'], [/tyo/g, 'cho'],
    [/zya/g, 'ja'], [/zyu/g, 'ju'], [/zyo/g, 'jo'],
    [/si/g, 'shi'], [/ti/g, 'chi'], [/tu/g, 'tsu'],
    [/hu/g, 'fu'], [/zi/g, 'ji'], [/di/g, 'ji']
  ];
  function normalizeRomaji(str) {
    let s = (str || '').toLowerCase();
    ROMAJI_NORMALIZE_RULES.forEach(([pattern, replacement]) => { s = s.replace(pattern, replacement); });
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      return Object.assign(emptyState(), data);
    } catch (e) {
      console.error('データの読み込みに失敗しました', e);
      return emptyState();
    }
  }

  function emptyState() {
    return {
      languages: {},
      words: {},
      categories: {},
      rules: {},
      messages: {},
      sounds: {},
      currentUserName: 'わたし'
    };
  }

  let state = load();

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- 言語 ----------
  function getLanguages() {
    return Object.values(state.languages).sort((a, b) => b.createdAt - a.createdAt);
  }

  function getLanguage(id) {
    return state.languages[id] || null;
  }

  function createLanguage(name) {
    const id = uid();
    state.languages[id] = {
      id, name, createdAt: Date.now(),
      members: [state.currentUserName]
    };
    save();
    return state.languages[id];
  }

  function deleteLanguage(id) {
    delete state.languages[id];
    Object.values(state.words).filter(w => w.languageId === id).forEach(w => delete state.words[w.id]);
    Object.values(state.categories).filter(c => c.languageId === id).forEach(c => delete state.categories[c.id]);
    Object.values(state.rules).filter(r => r.languageId === id).forEach(r => delete state.rules[r.id]);
    Object.values(state.messages).filter(m => m.languageId === id).forEach(m => delete state.messages[m.id]);
    save();
  }

  // ---------- クラウドから取得したデータをローカルの状態に反映する(hydrate)関数群 ----------
  // cloud.js から呼ばれる。ここではクラウドへの書き込みフックは呼ばない(取得したものをそのまま反映するだけ)。
  function replaceLanguages(list) {
    state.languages = {};
    list.forEach(lang => { state.languages[lang.id] = lang; });
    save();
  }

  function upsertLanguageLocal(lang) {
    state.languages[lang.id] = lang;
    save();
  }

  function replaceWordsForLanguage(languageId, list) {
    Object.values(state.words).filter(w => w.languageId === languageId).forEach(w => delete state.words[w.id]);
    list.forEach(w => { state.words[w.id] = w; });
    save();
  }

  function upsertWordLocal(word) {
    state.words[word.id] = word;
    save();
  }

  function removeWordLocal(id) {
    delete state.words[id];
    save();
  }

  function replaceRulesForLanguage(languageId, list) {
    Object.values(state.rules).filter(r => r.languageId === languageId).forEach(r => delete state.rules[r.id]);
    list.forEach(r => { state.rules[r.id] = r; });
    save();
  }

  function upsertRuleLocal(rule) {
    state.rules[rule.id] = rule;
    save();
  }

  function removeRuleLocal(id) {
    delete state.rules[id];
    save();
  }

  function replaceMessagesForLanguage(languageId, list) {
    Object.values(state.messages).filter(m => m.languageId === languageId).forEach(m => delete state.messages[m.id]);
    list.forEach(m => { state.messages[m.id] = m; });
    save();
  }

  function upsertMessageLocal(message) {
    state.messages[message.id] = message;
    save();
  }

  function replaceGlyphsForLanguage(languageId, list) {
    Object.keys(state.sounds).forEach(k => { if (state.sounds[k].languageId === languageId) delete state.sounds[k]; });
    list.forEach(g => upsertGlyphLocal(g));
    save();
  }

  function upsertGlyphLocal(g) {
    const key = soundKey(g.languageId, g.sound);
    state.sounds[key] = {
      languageId: g.languageId, sound: g.sound, type: soundType(g.sound),
      svgPaths: g.svgPaths, reading: g.reading || '', updatedAt: g.updatedAt || Date.now()
    };
    save();
  }

  function removeGlyphLocal(languageId, sound) {
    delete state.sounds[soundKey(languageId, sound)];
    save();
  }

  // ---------- 辞書カテゴリ ----------
  function getWordCategories(languageId) {
    const custom = Object.values(state.categories)
      .filter(c => c.languageId === languageId)
      .map(c => c.name);
    return [...DEFAULT_WORD_CATEGORIES.filter(c => c !== 'その他'), ...custom, 'その他'];
  }

  function createWordCategory(languageId, name) {
    const id = uid();
    state.categories[id] = { id, languageId, name };
    save();
    return state.categories[id];
  }

  // ---------- 単語 ----------
  function getWords(languageId, { category, query } = {}) {
    let list = Object.values(state.words).filter(w => w.languageId === languageId);
    if (category) list = list.filter(w => (w.categories || []).includes(category));
    if (query) {
      const q = query.trim().toLowerCase();
      const qNorm = normalizeRomaji(q);
      if (q) {
        list = list.filter(w =>
          w.meaning.toLowerCase().includes(q) ||
          normalizeRomaji(w.reading).includes(qNorm) ||
          (w.forms || []).some(f =>
            normalizeRomaji(f.reading).includes(qNorm) || f.label.toLowerCase().includes(q)
          )
        );
      }
    }
    return list.sort((a, b) => a.reading.localeCompare(b.reading, 'ja'));
  }

  function getWord(id) {
    return state.words[id] || null;
  }

  function createWord(languageId, data) {
    const id = uid();
    state.words[id] = {
      id, languageId,
      meaning: data.meaning || '',
      reading: data.reading || '',
      categories: data.categories && data.categories.length ? data.categories : ['その他'],
      pos: data.pos || '',
      pronunciation: data.pronunciation || '',
      description: data.description || '',
      example: data.example || '',
      memo: data.memo || '',
      forms: data.forms || [],
      createdAt: Date.now()
    };
    save();
    if (cloudHooks.onCreateWord) cloudHooks.onCreateWord(state.words[id]);
    return state.words[id];
  }

  function updateWord(id, data) {
    if (!state.words[id]) return null;
    Object.assign(state.words[id], data);
    save();
    if (cloudHooks.onUpdateWord) cloudHooks.onUpdateWord(state.words[id]);
    return state.words[id];
  }

  function deleteWord(id) {
    delete state.words[id];
    save();
    if (cloudHooks.onDeleteWord) cloudHooks.onDeleteWord(id);
  }

  // 読み(見出し語そのもの、または活用形の読み)から、辞書に登録された言葉を探す
  function findEntryByReading(languageId, reading) {
    const words = getWords(languageId);
    for (const w of words) {
      if (w.reading === reading) return { word: w, label: null, meaning: w.meaning };
      const form = (w.forms || []).find(f => f.reading === reading);
      if (form) return { word: w, label: form.label, meaning: form.meaning || w.meaning };
    }
    return null;
  }

  // ---------- ルール ----------
  function getRuleCategories() {
    return RULE_CATEGORIES;
  }

  function getConjugationRuleCategories() {
    return CONJUGATION_RULE_CATEGORIES;
  }

  function getRules(languageId, { category } = {}) {
    let list = Object.values(state.rules).filter(r => r.languageId === languageId);
    if (category) list = list.filter(r => r.category === category);
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }

  function createRule(languageId, data) {
    const id = uid();
    state.rules[id] = {
      id, languageId,
      category: data.category || 'その他',
      title: data.title || '',
      content: data.content || '',
      pattern: data.pattern || null,
      isConjugation: !!data.isConjugation,
      createdAt: Date.now()
    };
    save();
    if (cloudHooks.onCreateRule) cloudHooks.onCreateRule(state.rules[id]);
    return state.rules[id];
  }

  function updateRule(id, data) {
    if (!state.rules[id]) return null;
    Object.assign(state.rules[id], data);
    save();
    if (cloudHooks.onUpdateRule) cloudHooks.onUpdateRule(state.rules[id]);
    return state.rules[id];
  }

  function deleteRule(id) {
    delete state.rules[id];
    save();
    if (cloudHooks.onDeleteRule) cloudHooks.onDeleteRule(id);
  }

  // ---------- 語形変化パターン(軽量なルールテンプレート) ----------
  const PATTERN_TYPES = [
    { id: 'suffix-replace', label: '語尾を置きかえる', hint: '例: 語尾が a なら anai に、i なら inai にする(いくつでも組を追加可)' },
    { id: 'suffix-add', label: '語尾に付け足す', hint: '例: 語尾に ta を付け足す' },
    { id: 'prefix-add', label: '語頭に付け足す', hint: '例: 語頭に un を付け足す' },
    { id: 'vowel-shift', label: '語尾の母音を置きかえる', hint: '例: 語尾が a でも i でも u でも、その母音を o にかえる' }
  ];
  function getPatternTypes() { return PATTERN_TYPES; }

  // ルールのパターンを読みに適用する。適用できなければ null を返す。
  // suffix-replace は「語尾がこの文字ならこう変える」の組を複数持てる(否定形などで語尾がまちまちな場合に対応)。
  function applyRulePattern(pattern, reading) {
    if (!pattern || !pattern.type || !reading) return null;
    if (pattern.type === 'suffix-replace') {
      const pairs = (pattern.pairs && pattern.pairs.length ? pattern.pairs : (pattern.from ? [{ from: pattern.from, to: pattern.to }] : []))
        .slice()
        .sort((a, b) => (b.from || '').length - (a.from || '').length);
      for (const pair of pairs) {
        if (pair.from && reading.endsWith(pair.from)) {
          return reading.slice(0, -pair.from.length) + (pair.to || '');
        }
      }
      return null;
    }
    const to = pattern.to || '';
    if (pattern.type === 'suffix-add') return reading + to;
    if (pattern.type === 'prefix-add') return to + reading;
    if (pattern.type === 'vowel-shift') {
      if (!to) return null;
      const lastChar = reading.slice(-1);
      if (!VOWELS.includes(lastChar)) return null;
      return reading.slice(0, -1) + to;
    }
    return null;
  }

  // 「動詞」タグが付いている単語すべてに、登録済みの活用パターンをまとめて反映する。
  // 新しいルールを追加したときや、前から動詞タグが付いている単語に後から反映したいときに使う。
  // すでに同じ名前の活用形がある単語はスキップするので、何度実行しても重複しない。
  function applyPatternsToAllVerbs(languageId) {
    const patternRules = getRules(languageId).filter(r => r.pattern && r.isConjugation);
    if (patternRules.length === 0) return { wordsUpdated: 0, formsAdded: 0 };
    const verbs = getWords(languageId).filter(w => (w.categories || []).includes('動詞'));
    let wordsUpdated = 0;
    let formsAdded = 0;
    verbs.forEach(w => {
      const forms = (w.forms || []).slice();
      let changed = false;
      patternRules.forEach(r => {
        if (forms.some(f => f.sourceRuleId === r.id)) return;
        const result = applyRulePattern(r.pattern, w.reading);
        if (!result) return;
        forms.push({ id: uid(), label: r.category, reading: result, meaning: '', sourceRuleId: r.id });
        formsAdded++;
        changed = true;
      });
      if (changed) {
        updateWord(w.id, { forms });
        wordsUpdated++;
      }
    });
    return { wordsUpdated, formsAdded };
  }

  // ---------- チャット ----------
  function getMessages(languageId) {
    return Object.values(state.messages)
      .filter(m => m.languageId === languageId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function sendMessage(languageId, text) {
    const id = uid();
    state.messages[id] = {
      id, languageId,
      sender: state.currentUserName,
      text,
      createdAt: Date.now()
    };
    save();
    if (cloudHooks.onSendMessage) cloudHooks.onSendMessage(state.messages[id]);
    return state.messages[id];
  }

  function getCurrentUserName() {
    return state.currentUserName;
  }

  function setCurrentUserName(name) {
    state.currentUserName = name || 'わたし';
    save();
  }

  // ---------- 文字(母音・子音・数字の手描きパーツ) ----------
  const VOWELS = ['a', 'i', 'u', 'e', 'o'];
  // アルファベットの子音(b,c,d,f,g,h,j,k,l,m,n,p,q,r,s,t,v,w,x,y,z)を一通り揃え、
  // 日本語のローマ字表記でよく使う2文字の組み合わせ(ch/sh/ts)も加えている。
  const CONSONANTS = ['k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w', 'g', 'z', 'd', 'b', 'p', 'f', 'j', 'c', 'l', 'q', 'v', 'x', 'ch', 'sh', 'ts'];
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function getVowels() { return VOWELS; }
  function getConsonants() { return CONSONANTS; }
  function getDigits() { return DIGITS; }

  function soundKey(languageId, sound) {
    return `${languageId}__${sound}`;
  }

  function getSoundGlyph(languageId, sound) {
    return state.sounds[soundKey(languageId, sound)] || null;
  }

  function getSoundGlyphs(languageId) {
    return Object.values(state.sounds).filter(s => s.languageId === languageId);
  }

  function soundType(sound) {
    if (VOWELS.includes(sound)) return 'vowel';
    if (DIGITS.includes(sound)) return 'digit';
    return 'consonant';
  }

  // reading は数字専用(その言語での読み方、例: "0" -> "ze")。母音・子音では省略する。
  function saveSoundGlyph(languageId, sound, svgPaths, reading) {
    const type = soundType(sound);
    const key = soundKey(languageId, sound);
    state.sounds[key] = { languageId, sound, type, svgPaths, reading: reading || '', updatedAt: Date.now() };
    save();
    if (cloudHooks.onSaveGlyph) cloudHooks.onSaveGlyph(state.sounds[key]);
    return state.sounds[key];
  }

  function deleteSoundGlyph(languageId, sound) {
    delete state.sounds[soundKey(languageId, sound)];
    save();
    if (cloudHooks.onDeleteGlyph) cloudHooks.onDeleteGlyph(languageId, sound);
  }

  // ---------- エクスポート / インポート(localStorage 喪失に備えたバックアップ) ----------
  function exportLanguageData(languageId) {
    const lang = getLanguage(languageId);
    if (!lang) return null;
    return {
      exportedAt: new Date().toISOString(),
      appVersion: 'kotobazukuri_v1',
      language: { name: lang.name },
      words: Object.values(state.words).filter(w => w.languageId === languageId),
      categories: Object.values(state.categories).filter(c => c.languageId === languageId).map(c => c.name),
      rules: Object.values(state.rules).filter(r => r.languageId === languageId),
      sounds: Object.values(state.sounds).filter(s => s.languageId === languageId)
    };
  }

  function importLanguageData(languageId, data) {
    const result = { wordsAdded: 0, categoriesAdded: 0, rulesAdded: 0, soundsAdded: 0 };
    if (!data || typeof data !== 'object') return result;

    (data.categories || []).forEach(name => {
      if (typeof name !== 'string' || !name.trim()) return;
      if (!getWordCategories(languageId).includes(name)) {
        createWordCategory(languageId, name);
        result.categoriesAdded++;
      }
    });

    (data.words || []).forEach(w => {
      if (!w || !w.reading) return;
      createWord(languageId, {
        meaning: w.meaning, reading: w.reading, categories: w.categories,
        pos: w.pos, pronunciation: w.pronunciation, description: w.description,
        example: w.example, memo: w.memo, forms: w.forms
      });
      result.wordsAdded++;
    });

    (data.rules || []).forEach(r => {
      if (!r || !r.title) return;
      createRule(languageId, { category: r.category, title: r.title, content: r.content, pattern: r.pattern });
      result.rulesAdded++;
    });

    (data.sounds || []).forEach(s => {
      if (!s || !s.sound || !s.svgPaths) return;
      saveSoundGlyph(languageId, s.sound, s.svgPaths, s.reading);
      result.soundsAdded++;
    });

    return result;
  }

  return {
    uid, setCloudHooks,
    getLanguages, getLanguage, createLanguage, deleteLanguage,
    getWordCategories, createWordCategory,
    getWords, getWord, createWord, updateWord, deleteWord, findEntryByReading,
    getRuleCategories, getConjugationRuleCategories, getRules, createRule, updateRule, deleteRule,
    getPatternTypes, applyRulePattern, applyPatternsToAllVerbs,
    getMessages, sendMessage,
    getCurrentUserName, setCurrentUserName,
    getVowels, getConsonants, getDigits, getSoundGlyph, getSoundGlyphs, saveSoundGlyph, deleteSoundGlyph,
    exportLanguageData, importLanguageData,
    // クラウド同期(cloud.js)用のhydrate関数
    replaceLanguages, upsertLanguageLocal,
    replaceWordsForLanguage, upsertWordLocal, removeWordLocal,
    replaceRulesForLanguage, upsertRuleLocal, removeRuleLocal,
    replaceMessagesForLanguage, upsertMessageLocal,
    replaceGlyphsForLanguage, upsertGlyphLocal, removeGlyphLocal
  };
})();
