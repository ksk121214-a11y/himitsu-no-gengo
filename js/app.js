/* ルーティングと画面の出し分け(ヘッダー・下部ナビ・＋ボタン)を担当 */
const Router = (() => {
  const viewRoot = document.getElementById('view-root');
  const headerTitle = document.getElementById('header-title');
  const backBtn = document.getElementById('back-btn');
  const bottomNav = document.getElementById('bottom-nav');
  const fab = document.getElementById('fab-add');

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = raw.split('?');
    const segments = pathPart.split('/').filter(Boolean);
    const query = new URLSearchParams(queryPart || '');
    return { segments, query };
  }

  function go(hash) {
    location.hash = hash;
  }

  function setQuery(q) {
    const { segments } = parseHash();
    const path = '/' + segments.join('/');
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    history.replaceState(null, '', location.pathname + location.search + '#' + path + qs);
    render();
  }

  function refresh(options) {
    render(options);
  }

  function setHeader(title, showBack) {
    headerTitle.textContent = title;
    backBtn.hidden = !showBack;
  }

  function setNav({ showNav, activeTab, showFab }) {
    bottomNav.hidden = !showNav;
    fab.hidden = !showFab;
    if (showNav) {
      [...bottomNav.children].forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === activeTab);
      });
    }
  }

  let currentContext = { type: 'home' };

  async function render(options) {
    const { segments, query } = parseHash();
    const preserveScroll = options && options.preserveScroll;
    viewRoot.innerHTML = '';
    if (!preserveScroll) viewRoot.scrollTop = 0;

    if (segments.length === 0) {
      currentContext = { type: 'home' };
      setHeader('秘密の言語', false);
      setNav({ showNav: false, showFab: true });
      Cloud.leaveLanguage();
      viewRoot.appendChild(Views.home());
      return;
    }

    if (segments[0] === 'lang' && segments[1]) {
      const langId = segments[1];
      const lang = Store.getLanguage(langId);
      if (!lang) {
        go('#/');
        return;
      }

      // まだクラウドから単語・ルール・文字・チャットを取得していなければ、取得を待つ間だけ読み込み表示を出す
      const alreadyLoaded = Cloud.isLanguageLoaded(langId);
      if (!alreadyLoaded) {
        viewRoot.appendChild(UI.el('p', { class: 'lead-text', text: '読み込み中…' }));
      }
      try {
        await Cloud.enterLanguage(langId);
      } catch (e) {
        console.error(e);
        UI.toast('データの取得に失敗しました。通信環境を確認してください。');
      }
      // 取得を待っている間に別の画面へ移動していたら、ここで描画を打ち切る
      const after = parseHash();
      if (after.segments.join('/') !== segments.join('/')) return;
      if (!alreadyLoaded) viewRoot.innerHTML = '';

      const tab = segments[2] || 'home';

      if (tab === 'home') {
        currentContext = { type: 'language', lang, tab: 'home' };
        setHeader(lang.name, true);
        setNav({ showNav: true, activeTab: 'home', showFab: true });
        viewRoot.appendChild(Views.languageHome(lang));
      } else if (tab === 'dictionary') {
        currentContext = { type: 'language', lang, tab: 'dictionary' };
        const sub = segments[3];
        if (sub === 'tags' && segments[4]) {
          const category = decodeURIComponent(segments[4]);
          setHeader(category, true);
          setNav({ showNav: true, activeTab: 'dictionary', showFab: true });
          viewRoot.appendChild(Views.dictionaryCategory(lang, category));
        } else if (sub === 'tags') {
          setHeader('タグから探す', true);
          setNav({ showNav: true, activeTab: 'dictionary', showFab: true });
          viewRoot.appendChild(Views.dictionaryTags(lang));
        } else {
          setHeader('辞書', true);
          setNav({ showNav: true, activeTab: 'dictionary', showFab: true });
          viewRoot.appendChild(Views.dictionaryIndex(lang, query.get('q') || ''));
        }
      } else if (tab === 'rules') {
        currentContext = { type: 'language', lang, tab: 'rules' };
        setHeader('ルール', true);
        setNav({ showNav: true, activeTab: 'rules', showFab: true });
        viewRoot.appendChild(Views.rules(lang));
      } else if (tab === 'chat') {
        currentContext = { type: 'language', lang, tab: 'chat' };
        setHeader('チャット', true);
        setNav({ showNav: true, activeTab: 'chat', showFab: false });
        viewRoot.appendChild(Views.chat(lang));
      } else if (tab === 'glyphs') {
        currentContext = { type: 'language', lang, tab: 'glyphs' };
        setHeader('文字', true);
        setNav({ showNav: false, showFab: false });
        viewRoot.appendChild(Views.glyphBoard(lang));
      } else if (tab === 'history') {
        currentContext = { type: 'language', lang, tab: 'history' };
        setHeader('変更履歴', true);
        setNav({ showNav: false, showFab: false });
        viewRoot.appendChild(UI.el('p', { class: 'lead-text', text: '読み込み中…' }));
        const entries = await Cloud.fetchEditHistory(lang.id);
        const afterHistory = parseHash();
        if (afterHistory.segments.join('/') !== segments.join('/')) return;
        viewRoot.innerHTML = '';
        viewRoot.appendChild(Views.historyList(lang, entries));
      } else {
        go(`#/lang/${langId}/home`);
      }
      return;
    }

    go('#/');
  }

  backBtn.addEventListener('click', () => {
    const { segments } = parseHash();
    if (segments.length >= 4) {
      go('#/' + segments.slice(0, segments.length - 1).join('/'));
    } else if (segments.length === 3 && segments[2] !== 'home') {
      go(`#/${segments[0]}/${segments[1]}/home`);
    } else {
      go('#/');
    }
  });

  bottomNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    const { segments } = parseHash();
    if (segments[0] === 'lang' && segments[1]) {
      go(`#/lang/${segments[1]}/${btn.dataset.tab}`);
    }
  });

  fab.addEventListener('click', () => {
    if (currentContext.type === 'home') {
      Views.newLanguageForm();
    } else if (currentContext.type === 'language' && currentContext.tab === 'dictionary') {
      Views.wordForm(currentContext.lang);
    } else if (currentContext.type === 'language' && currentContext.tab === 'rules') {
      Views.ruleForm(currentContext.lang);
    } else {
      Views.addMenu(currentContext);
    }
  });

  window.addEventListener('hashchange', render);

  return { go, refresh, setQuery, render, parseHash };
})();

// 起動時にSupabaseへ匿名でサインインし、参加済みの言語一覧を取得してから画面を描画する
(async () => {
  const bootEl = document.getElementById('boot-loading');
  try {
    await Cloud.boot();
  } catch (e) {
    console.error(e);
    UI.toast('通信環境を確認してください。オフラインのままでは同期できません。');
  }
  if (bootEl) bootEl.hidden = true;
  Router.render();
})();
