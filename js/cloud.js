/*
 * Supabase 連携レイヤー。
 * - 匿名認証(名前だけで参加できる、合言葉方式)
 * - 単語・ルール・文字・チャットの取得と、Store への反映(hydrate)
 * - Store の create/update/delete に反応して裏側で Supabase にも書き込む(cloudHooks)
 * - リアルタイム購読(友達の変更が自分の画面にも即座に反映される)
 */
const Cloud = (() => {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let userId = null;
  let channels = [];
  let subscribedLanguageId = null;
  const loadedLanguageIds = new Set();

  // 単語3つ+4桁の数字(組み合わせは2000万通り以上)にして、総当たりで当てられにくくする。
  // 言いやすさ・書き取りやすさを保つため、あえてランダム文字列ではなく単語の組み合わせにしている。
  const INVITE_WORDS = ['sora', 'umi', 'hoshi', 'kaze', 'tsuki', 'yama', 'hana', 'mori', 'yuki', 'nami', 'asa', 'yoru', 'kumo', 'niji'];
  function genInviteCode() {
    const pick = () => INVITE_WORDS[Math.floor(Math.random() * INVITE_WORDS.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${pick()}-${pick()}-${pick()}-${num}`;
  }

  // ---------- DB行 -> アプリ内の形へ変換 ----------
  function mapWordFromDb(row) {
    return {
      id: row.id, languageId: row.language_id,
      meaning: row.meaning || '', reading: row.reading || '',
      categories: row.categories || [],
      pos: row.pos || '', pronunciation: row.pronunciation || '', description: row.description || '',
      example: row.example || '', memo: row.memo || '',
      forms: row.forms || [],
      createdAt: new Date(row.created_at).getTime()
    };
  }
  function mapRuleFromDb(row) {
    return {
      id: row.id, languageId: row.language_id,
      category: row.category, title: row.title || '', content: row.content || '',
      pattern: row.pattern || null, isConjugation: !!row.is_conjugation,
      createdAt: new Date(row.created_at).getTime()
    };
  }
  function mapGlyphFromDb(row) {
    return {
      languageId: row.language_id, sound: row.sound,
      svgPaths: row.svg_paths, reading: row.reading || '',
      updatedAt: new Date(row.created_at).getTime()
    };
  }
  function mapMessageFromDb(row) {
    return {
      id: row.id, languageId: row.language_id,
      sender: row.sender_name, text: row.text,
      createdAt: new Date(row.created_at).getTime()
    };
  }

  // ---------- 認証 & 起動 ----------
  async function boot() {
    const { data: sessionData } = await client.auth.getSession();
    let session = sessionData && sessionData.session;
    if (!session) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    userId = session.user.id;
    registerHooks();
    await fetchMyLanguages();
    return { userId };
  }

  async function fetchMyLanguages() {
    const { data, error } = await client
      .from('language_members')
      .select('display_name, languages(id, name, invite_code, created_at)')
      .eq('user_id', userId);
    if (error) { console.error('言語一覧の取得に失敗', error); return; }

    const langIds = (data || []).map(r => r.languages && r.languages.id).filter(Boolean);
    let membersByLang = {};
    if (langIds.length) {
      const { data: memberRows } = await client
        .from('language_members')
        .select('language_id, display_name')
        .in('language_id', langIds);
      (memberRows || []).forEach(r => {
        if (!membersByLang[r.language_id]) membersByLang[r.language_id] = [];
        membersByLang[r.language_id].push(r.display_name);
      });
    }

    const langs = (data || [])
      .filter(r => r.languages)
      .map(r => ({
        id: r.languages.id,
        name: r.languages.name,
        inviteCode: r.languages.invite_code,
        createdAt: new Date(r.languages.created_at).getTime(),
        members: membersByLang[r.languages.id] || [r.display_name]
      }));
    Store.replaceLanguages(langs);
  }

  async function createLanguage(name, displayName, passcode) {
    Store.setCurrentUserName(displayName);
    const inviteCode = genInviteCode();
    const { data, error } = await client.rpc('create_language_with_passcode', {
      lang_name: name, display_name: displayName, invite_code: inviteCode, creation_passcode: passcode
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('作成に失敗しました');
    const id = row.result_language_id;
    const lang = { id, name, inviteCode, createdAt: Date.now(), members: [displayName] };
    Store.upsertLanguageLocal(lang);
    loadedLanguageIds.add(id); // 作ったばかりなので中身は空、取得しにいく必要はない
    Store.replaceWordsForLanguage(id, []);
    Store.replaceRulesForLanguage(id, []);
    Store.replaceGlyphsForLanguage(id, []);
    Store.replaceMessagesForLanguage(id, []);
    return lang;
  }

  async function joinLanguage(code, displayName) {
    Store.setCurrentUserName(displayName);
    const { data, error } = await client.rpc('join_language_by_code', { code, name: displayName });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('参加に失敗しました');
    await fetchMyLanguages();
    return Store.getLanguage(row.result_language_id);
  }

  // ---------- 言語データの取得 ----------
  async function loadLanguageData(languageId) {
    const [wordsRes, rulesRes, glyphsRes, messagesRes] = await Promise.all([
      client.from('words').select('*').eq('language_id', languageId),
      client.from('rules').select('*').eq('language_id', languageId),
      client.from('sound_glyphs').select('*').eq('language_id', languageId),
      client.from('messages').select('*').eq('language_id', languageId).order('created_at', { ascending: true })
    ]);
    if (wordsRes.error) console.error(wordsRes.error);
    if (rulesRes.error) console.error(rulesRes.error);
    if (glyphsRes.error) console.error(glyphsRes.error);
    if (messagesRes.error) console.error(messagesRes.error);

    Store.replaceWordsForLanguage(languageId, (wordsRes.data || []).map(mapWordFromDb));
    Store.replaceRulesForLanguage(languageId, (rulesRes.data || []).map(mapRuleFromDb));
    Store.replaceGlyphsForLanguage(languageId, (glyphsRes.data || []).map(mapGlyphFromDb));
    Store.replaceMessagesForLanguage(languageId, (messagesRes.data || []).map(mapMessageFromDb));
  }

  function isLanguageLoaded(languageId) {
    return loadedLanguageIds.has(languageId);
  }

  // 言語画面に入る: 未取得ならデータを取得し、リアルタイム購読を切り替える
  async function enterLanguage(languageId) {
    if (!loadedLanguageIds.has(languageId)) {
      await loadLanguageData(languageId);
      loadedLanguageIds.add(languageId);
    }
    if (subscribedLanguageId !== languageId) {
      unsubscribeAll();
      subscribeLanguage(languageId);
      subscribedLanguageId = languageId;
    }
  }

  function leaveLanguage() {
    unsubscribeAll();
    subscribedLanguageId = null;
  }

  // ---------- リアルタイム購読 ----------
  function notifyChange() {
    // Router は const で宣言されているため window.Router にはならない(グローバルスコープの識別子としては参照できる)。
    if (typeof Router !== 'undefined' && Router.refresh) Router.refresh({ preserveScroll: true });
  }

  function subscribeLanguage(languageId) {
    const channel = client.channel(`lang-${languageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'words', filter: `language_id=eq.${languageId}` }, (payload) => {
        if (payload.eventType === 'DELETE') Store.removeWordLocal(payload.old.id);
        else Store.upsertWordLocal(mapWordFromDb(payload.new));
        notifyChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rules', filter: `language_id=eq.${languageId}` }, (payload) => {
        if (payload.eventType === 'DELETE') Store.removeRuleLocal(payload.old.id);
        else Store.upsertRuleLocal(mapRuleFromDb(payload.new));
        notifyChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sound_glyphs', filter: `language_id=eq.${languageId}` }, (payload) => {
        if (payload.eventType === 'DELETE') Store.removeGlyphLocal(payload.old.language_id, payload.old.sound);
        else Store.upsertGlyphLocal(mapGlyphFromDb(payload.new));
        notifyChange();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `language_id=eq.${languageId}` }, (payload) => {
        if (payload.eventType !== 'DELETE') Store.upsertMessageLocal(mapMessageFromDb(payload.new));
        notifyChange();
      })
      .subscribe();
    channels.push(channel);
  }

  function unsubscribeAll() {
    channels.forEach(ch => client.removeChannel(ch));
    channels = [];
  }

  // ---------- Store -> Supabase への書き込み(fire-and-forget) ----------
  function registerHooks() {
    Store.setCloudHooks({
      onCreateWord: (word) => pushWord(word),
      onUpdateWord: (word) => pushWord(word),
      onDeleteWord: (id) => pushWordDelete(id),
      onCreateRule: (rule) => pushRule(rule),
      onUpdateRule: (rule) => pushRule(rule),
      onDeleteRule: (id) => pushRuleDelete(id),
      onSaveGlyph: (glyph) => pushGlyph(glyph),
      onDeleteGlyph: (languageId, sound) => pushGlyphDelete(languageId, sound),
      onSendMessage: (message) => pushMessage(message)
    });
  }

  async function pushWord(word) {
    try {
      const { error } = await client.from('words').upsert({
        id: word.id, language_id: word.languageId, reading: word.reading, meaning: word.meaning,
        categories: word.categories || [], forms: word.forms || [],
        pos: word.pos || '', pronunciation: word.pronunciation || '', description: word.description || '',
        example: word.example || '', memo: word.memo || '',
        created_by: userId, updated_at: new Date().toISOString()
      });
      if (error) throw error;
    } catch (e) { console.error('単語の同期に失敗', e); }
  }
  async function pushWordDelete(id) {
    try { await client.from('words').delete().eq('id', id); }
    catch (e) { console.error('単語の削除同期に失敗', e); }
  }

  async function pushRule(rule) {
    try {
      const { error } = await client.from('rules').upsert({
        id: rule.id, language_id: rule.languageId, category: rule.category, title: rule.title,
        content: rule.content || '', pattern: rule.pattern || null, is_conjugation: !!rule.isConjugation,
        created_by: userId, updated_at: new Date().toISOString()
      });
      if (error) throw error;
    } catch (e) { console.error('ルールの同期に失敗', e); }
  }
  async function pushRuleDelete(id) {
    try { await client.from('rules').delete().eq('id', id); }
    catch (e) { console.error('ルールの削除同期に失敗', e); }
  }

  async function pushGlyph(glyph) {
    try {
      const { error } = await client.from('sound_glyphs').upsert({
        language_id: glyph.languageId, sound: glyph.sound, svg_paths: glyph.svgPaths,
        reading: glyph.reading || '', created_by: userId
      }, { onConflict: 'language_id,sound' });
      if (error) throw error;
    } catch (e) { console.error('文字の同期に失敗', e); }
  }
  async function pushGlyphDelete(languageId, sound) {
    try { await client.from('sound_glyphs').delete().eq('language_id', languageId).eq('sound', sound); }
    catch (e) { console.error('文字の削除同期に失敗', e); }
  }

  async function pushMessage(message) {
    try {
      const { error } = await client.from('messages').insert({
        id: message.id, language_id: message.languageId, sender_user_id: userId,
        sender_name: message.sender, text: message.text
      });
      if (error) throw error;
    } catch (e) { console.error('メッセージの同期に失敗', e); }
  }

  return {
    boot, createLanguage, joinLanguage,
    enterLanguage, leaveLanguage, isLanguageLoaded
  };
})();
