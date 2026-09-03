/* 画面(view)とモーダルフォームの組み立て担当 */
const { el } = UI;

const Views = (() => {

  function empty(message) {
    return el('p', { class: 'empty-message', text: message });
  }

  // ---------- ホーム(言語一覧) ----------
  function home() {
    const languages = Store.getLanguages();
    const root = el('div', { class: 'view view-home' });

    root.appendChild(el('p', { class: 'lead-text' },
      '友達だけに伝わる言語を作れます。'));

    root.appendChild(el('button', { class: 'ghost-btn', onclick: () => joinLanguageForm() }, '合言葉で参加する'));

    if (languages.length === 0) {
      root.appendChild(empty('まだ秘密の言語がありません。右下の「＋」から最初の言語を作るか、友達から合言葉をもらって参加しましょう。'));
    } else {
      const list = el('div', { class: 'card-list' });
      languages.forEach(lang => {
        const wordCount = Store.getWords(lang.id).length;
        const ruleCount = Store.getRules(lang.id).length;
        list.appendChild(
          el('button', { class: 'lang-card', onclick: () => Router.go(`#/lang/${lang.id}/home`) }, [
            el('div', { class: 'lang-card-title', text: lang.name }),
            el('div', { class: 'lang-card-meta', text: `単語 ${wordCount} ・ ルール ${ruleCount} ・ メンバー ${lang.members.length}人` })
          ])
        );
      });
      root.appendChild(list);
    }
    return root;
  }

  // ---------- 言語ホーム ----------
  function languageHome(lang) {
    const root = el('div', { class: 'view view-language-home' });
    const wordCount = Store.getWords(lang.id).length;
    const ruleCount = Store.getRules(lang.id).length;
    const msgCount = Store.getMessages(lang.id).length;

    root.appendChild(el('div', { class: 'lang-hero' }, [
      el('h2', { text: lang.name }),
      el('p', { class: 'lang-hero-meta', text: `メンバー: ${lang.members.join('、')}` })
    ]));

    const glyphCount = Store.getSoundGlyphs(lang.id).length;
    const totalSounds = Store.getVowels().length + Store.getConsonants().length + Store.getDigits().length;
    const stats = el('div', { class: 'stat-grid' }, [
      statTile('辞書の単語', wordCount, () => Router.go(`#/lang/${lang.id}/dictionary`)),
      statTile('ルール', ruleCount, () => Router.go(`#/lang/${lang.id}/rules`)),
      statTile('チャット', msgCount, () => Router.go(`#/lang/${lang.id}/chat`)),
      statTile('文字', `${glyphCount}/${totalSounds}`, () => Router.go(`#/lang/${lang.id}/glyphs`))
    ]);
    root.appendChild(stats);

    root.appendChild(el('button', {
      class: 'ghost-btn',
      onclick: () => showInviteCode(lang)
    }, '友達を招待する'));

    if (lang.myRole === 'admin') {
      root.appendChild(el('button', {
        class: 'ghost-btn',
        onclick: () => confirmRegenerateInviteCode(lang)
      }, '招待コードを再発行する'));
    }

    root.appendChild(el('button', {
      class: 'ghost-btn',
      onclick: () => Router.go(`#/lang/${lang.id}/history`)
    }, '変更履歴を見る'));

    root.appendChild(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'secondary-btn', onclick: () => exportLanguageFile(lang) }, '辞書を書き出す'),
      el('button', { class: 'secondary-btn', onclick: () => importLanguageFile(lang) }, '辞書を読み込む')
    ]));

    root.appendChild(el('button', {
      class: 'ghost-btn danger',
      onclick: () => confirmDeleteLanguage(lang)
    }, 'この言語を削除する'));

    return root;
  }

  // 辞書(単語・カテゴリ・ルール・文字)を JSON ファイルとして書き出す
  function exportLanguageFile(lang) {
    const data = Store.exportLanguageData(lang.id);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lang.name}-辞書.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('辞書を書き出しました');
  }

  // 書き出した JSON ファイルを選んで読み込み、今の言語に追加する
  function importLanguageFile(lang) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const result = Store.importLanguageData(lang.id, data);
          Router.refresh();
          UI.toast(`単語${result.wordsAdded}件・ルール${result.rulesAdded}件・文字${result.soundsAdded}件を読み込みました`);
        } catch (e) {
          UI.toast('ファイルの読み込みに失敗しました');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function statTile(label, value, onclick) {
    return el('button', { class: 'stat-tile', onclick }, [
      el('div', { class: 'stat-value', text: String(value) }),
      el('div', { class: 'stat-label', text: label })
    ]);
  }

  function confirmDeleteLanguage(lang) {
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: `「${lang.name}」を削除しますか？` }),
      el('p', { text: '辞書・ルール・チャットもすべて削除されます。この操作は取り消せません。' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: UI.closeModal }, 'キャンセル'),
        el('button', {
          class: 'danger-btn',
          onclick: () => {
            Store.deleteLanguage(lang.id);
            UI.closeModal();
            Router.go('#/');
          }
        }, '削除する')
      ])
    ]);
    UI.openModal(content);
  }

  // ---------- 変更履歴 ----------
  function formatRelativeTime(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}時間前`;
    const day = Math.floor(hour / 24);
    if (day < 7) return `${day}日前`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const HISTORY_TARGET_LABELS = { word: '単語', rule: 'ルール', sound_glyph: '文字', example: '例文' };
  const HISTORY_ACTION_LABELS = { create: '追加', update: '編集', delete: '削除', restore: '復元' };
  const HISTORY_FIELD_LABELS = {
    word: [['reading', '読み'], ['meaning', '意味'], ['pos', '品詞'], ['pronunciation', '発音メモ'], ['description', '説明'], ['example', '例文'], ['memo', 'メモ']],
    rule: [['category', 'カテゴリ'], ['title', 'タイトル'], ['content', '内容']],
    sound_glyph: [['sound', '音'], ['reading', '読み方']],
    example: [['text', '文章'], ['translation', '日本語訳'], ['title', 'タイトル'], ['note', 'メモ']]
  };

  function historyTargetName(entry) {
    const data = entry.afterData || entry.beforeData || {};
    if (entry.targetType === 'word') return data.reading || '(不明)';
    if (entry.targetType === 'rule') return data.title || '(不明)';
    if (entry.targetType === 'sound_glyph') return data.sound || '(不明)';
    if (entry.targetType === 'example') return data.title || data.text || '(不明)';
    return '(不明)';
  }

  function historyDiffLines(entry) {
    if (entry.action === 'create' || entry.action === 'delete') return [];
    const before = entry.beforeData || {};
    const after = entry.afterData || {};
    const lines = [];
    const fields = HISTORY_FIELD_LABELS[entry.targetType] || [];
    fields.forEach(([key, label]) => {
      const b = before[key] || '';
      const a = after[key] || '';
      if (b !== a) lines.push(`${label}：${b || '(なし)'} → ${a || '(なし)'}`);
    });
    if (entry.targetType === 'word') {
      const bc = (before.categories || []).join('・');
      const ac = (after.categories || []).join('・');
      if (bc !== ac) lines.push(`カテゴリ：${bc || '(なし)'} → ${ac || '(なし)'}`);
      if (JSON.stringify(before.forms || []) !== JSON.stringify(after.forms || [])) lines.push('活用形が変更されました');
    }
    if (entry.targetType === 'rule') {
      if (JSON.stringify(before.pattern || null) !== JSON.stringify(after.pattern || null)) lines.push('活用パターンが変更されました');
      if (!!before.is_conjugation !== !!after.is_conjugation) {
        lines.push(`動詞への自動反映：${before.is_conjugation ? 'オン' : 'オフ'} → ${after.is_conjugation ? 'オン' : 'オフ'}`);
      }
    }
    if (entry.targetType === 'sound_glyph') {
      if (before.svg_paths !== after.svg_paths) lines.push('文字の形が変更されました');
    }
    return lines;
  }

  function historyList(lang, entries) {
    const root = el('div', { class: 'view view-history' });
    if (!entries || entries.length === 0) {
      root.appendChild(empty('まだ変更履歴がありません。単語やルール、文字を編集すると、ここに記録されます。'));
      return root;
    }
    const list = el('div', { class: 'card-list' });
    entries.forEach(entry => list.appendChild(historyCard(lang, entry)));
    root.appendChild(list);
    return root;
  }

  function historyCard(lang, entry) {
    const title = `${entry.actorName}が${HISTORY_TARGET_LABELS[entry.targetType] || entry.targetType}『${historyTargetName(entry)}』を${HISTORY_ACTION_LABELS[entry.action] || entry.action}しました`;
    const diffLines = historyDiffLines(entry);
    const children = [
      el('div', { class: 'rule-title', text: title }),
      ...diffLines.map(line => el('div', { class: 'rule-content', text: line })),
      el('div', { class: 'lang-card-meta', text: formatRelativeTime(entry.createdAt) })
    ];
    if ((entry.action === 'update' || entry.action === 'delete') && entry.beforeData) {
      children.push(el('button', {
        class: 'link-btn', type: 'button',
        onclick: () => confirmRestore(lang, entry)
      }, 'この状態に戻す'));
    }
    return el('div', { class: 'rule-card' }, children);
  }

  function confirmRestore(lang, entry) {
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: 'この状態に戻しますか？' }),
      el('p', { text: '今の内容が、この時点の内容に置き換わります。この操作も新しい履歴として記録されます。' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: UI.closeModal }, 'キャンセル'),
        el('button', {
          class: 'primary-btn',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              await Cloud.restoreEditHistory(entry.id);
              UI.closeModal();
              UI.toast('元に戻しました');
              Router.refresh();
            } catch (err) {
              console.error(err);
              UI.toast('復元に失敗しました');
              e.target.disabled = false;
            }
          }
        }, '元に戻す')
      ])
    ]);
    UI.openModal(content);
  }

  // ---------- 辞書(あいうえお順の一覧・検索) ----------
  function dictionaryIndex(lang, query) {
    const root = el('div', { class: 'view view-dictionary' });

    const searchBox = el('input', {
      class: 'search-input', type: 'search', placeholder: '意味や読みで検索(例: 走る / hasiru)',
      value: query || ''
    });
    searchBox.addEventListener('input', () => {
      Router.setQuery(searchBox.value);
    });
    root.appendChild(searchBox);

    root.appendChild(el('button', {
      class: 'ghost-btn',
      onclick: () => Router.go(`#/lang/${lang.id}/dictionary/tags`)
    }, 'タグから探す(食べ物・あいさつ など)'));

    const isSearching = query && query.trim();
    const words = Store.getWords(lang.id, isSearching ? { query } : {})
      .slice()
      .sort((a, b) => a.meaning.localeCompare(b.meaning, 'ja'));

    root.appendChild(el('div', {
      class: 'section-label',
      text: isSearching ? `検索結果 ${words.length}件` : `すべての単語(あいうえお順) ${words.length}件`
    }));

    if (words.length === 0) {
      root.appendChild(empty(isSearching ? '見つかりませんでした。' : 'まだ単語がありません。右下の「＋」から追加できます。'));
    } else {
      root.appendChild(wordList(lang, words));
    }
    return root;
  }

  // ---------- 辞書(タグ一覧) ----------
  function dictionaryTags(lang) {
    const root = el('div', { class: 'view view-dictionary-tags' });
    const categories = Store.getWordCategories(lang.id);
    const grid = el('div', { class: 'category-grid' });
    categories.forEach(cat => {
      const count = Store.getWords(lang.id, { category: cat }).length;
      grid.appendChild(
        el('button', {
          class: 'category-tile',
          onclick: () => Router.go(`#/lang/${lang.id}/dictionary/tags/${encodeURIComponent(cat)}`)
        }, [
          el('div', { class: 'category-name', text: `#${cat}` }),
          el('div', { class: 'category-count', text: `${count}件` })
        ])
      );
    });
    root.appendChild(grid);
    return root;
  }

  function dictionaryCategory(lang, category) {
    const root = el('div', { class: 'view view-dictionary-category' });
    root.appendChild(el('div', { class: 'section-label', text: `#${category}` }));
    const words = Store.getWords(lang.id, { category })
      .slice()
      .sort((a, b) => a.meaning.localeCompare(b.meaning, 'ja'));
    if (words.length === 0) {
      root.appendChild(empty('このタグの単語はまだありません。右下の「＋」から追加できます。'));
    } else {
      root.appendChild(wordList(lang, words));
    }
    return root;
  }

  function wordList(lang, words) {
    const list = el('div', { class: 'dict-entry-list' });
    words.forEach(word => {
      const formsRows = (word.forms || []).map(f =>
        el('div', { class: 'dict-entry-form-row' }, [
          glyphDisplay(lang, f.reading),
          el('span', { class: 'dict-entry-form-label', text: f.label }),
          el('span', { class: 'dict-entry-form-reading', text: f.reading }),
          f.meaning ? el('span', { class: 'dict-entry-form-meaning', text: f.meaning }) : null
        ])
      );
      const isVerb = (word.categories || []).includes('動詞');
      list.appendChild(
        el('button', { class: 'dict-entry', onclick: () => openWordDetail(lang, word) }, [
          el('div', { class: 'dict-entry-head' }, [
            glyphDisplay(lang, word.reading),
            isVerb ? el('span', { class: 'dict-entry-form-label', text: '原形' }) : null,
            el('span', { class: 'dict-entry-reading', text: word.reading })
          ]),
          el('div', { class: 'dict-entry-meaning', text: word.meaning }),
          word.example ? el('div', { class: 'dict-entry-example', text: `例: ${word.example}` }) : null,
          hashtagRow(word.categories),
          formsRows.length ? el('div', { class: 'dict-entry-forms' }, formsRows) : null
        ])
      );
    });
    return list;
  }

  function hashtagRow(categories) {
    if (!categories || categories.length === 0) return null;
    return el('div', { class: 'hashtag-row' },
      categories.map(cat => el('span', { class: 'hashtag', text: `#${cat}` }))
    );
  }

  function openWordDetail(lang, word) {
    const rows = [
      ['意味', word.meaning],
      ['読み', word.reading],
      ['品詞', word.pos],
      ['発音メモ', word.pronunciation],
      ['説明', word.description],
      ['例文', word.example],
      ['メモ', word.memo]
    ].filter(([, v]) => v);

    const formsBlock = (word.forms && word.forms.length)
      ? el('div', { class: 'word-forms-list' }, [
          el('div', { class: 'section-label', text: '活用形' }),
          ...word.forms.map(f => el('div', { class: 'form-row' }, [
            glyphDisplay(lang, f.reading),
            el('div', { class: 'form-row-text' }, [
              el('div', { class: 'form-row-label', text: f.label }),
              el('div', { class: 'form-row-reading', text: f.reading }),
              f.meaning ? el('div', { class: 'form-row-meaning', text: f.meaning }) : null
            ])
          ]))
        ])
      : null;

    const isVerb = (word.categories || []).includes('動詞');
    const headerRow = el('div', { class: 'detail-header-row' }, [
      glyphDisplay(lang, word.reading),
      isVerb ? el('span', { class: 'dict-entry-form-label', text: '原形' }) : null,
      el('h3', { text: word.reading })
    ]);

    const content = el('div', { class: 'modal-form' }, [
      headerRow,
      hashtagRow(word.categories),
      el('div', { class: 'detail-rows' },
        rows.map(([label, value]) => el('div', { class: 'detail-row' }, [
          el('div', { class: 'detail-label', text: label }),
          el('div', { class: 'detail-value', text: value })
        ]))
      ),
      formsBlock,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: () => { UI.closeModal(); wordForm(lang, word); } }, '編集する'),
        el('button', {
          class: 'danger-btn',
          onclick: () => {
            Store.deleteWord(word.id);
            UI.closeModal();
            Router.refresh();
          }
        }, '削除する')
      ])
    ]);
    UI.openModal(content);
  }

  // ---------- 単語フォーム(新規/編集) ----------
  function wordForm(lang, existing) {
    const isEdit = !!existing;

    const meaningInput = el('input', { type: 'text', placeholder: '例: 走る', value: existing ? existing.meaning : '' });
    const readingInput = el('input', { type: 'text', placeholder: '例: hasiru', value: existing ? existing.reading : '' });

    // ---- カテゴリ(複数選択・ハッシュタグ風) ----
    let selectedCategories = new Set(existing ? (existing.categories || []) : []);
    const tagWrap = el('div', { class: 'tag-select-wrap' });
    function renderTags() {
      tagWrap.innerHTML = '';
      Store.getWordCategories(lang.id).forEach(cat => {
        const tag = el('button', {
          type: 'button',
          class: 'tag-option' + (selectedCategories.has(cat) ? ' selected' : ''),
          text: `#${cat}`,
          onclick: () => {
            const wasSelected = selectedCategories.has(cat);
            if (wasSelected) selectedCategories.delete(cat);
            else selectedCategories.add(cat);
            renderTags();
            if (!wasSelected && cat === '動詞') autoApplyVerbPatterns();
          }
        });
        tagWrap.appendChild(tag);
      });
    }
    renderTags();

    const newCategoryInput = el('input', { type: 'text', placeholder: '新しいカテゴリ名' });
    const addCategoryBtn = el('button', {
      type: 'button', class: 'link-btn', text: '＋ このカテゴリを追加する',
      onclick: () => {
        const name = newCategoryInput.value.trim();
        if (!name) { UI.toast('カテゴリ名を入力してください'); return; }
        Store.createWordCategory(lang.id, name);
        selectedCategories.add(name);
        newCategoryInput.value = '';
        renderTags();
      }
    });

    // ---- 活用形(タップで編集もできる) ----
    let forms = existing ? (existing.forms || []).map(f => ({ ...f })) : [];
    let editingFormIndex = null;

    const formLabelInput = el('input', { type: 'text', placeholder: '活用形(例: 過去形)' });
    const formReadingInput = el('input', { type: 'text', placeholder: '読み方(例: hasitta)' });
    const formMeaningInput = el('input', { type: 'text', placeholder: '意味(例: 走った)' });
    const addFormBtn = el('button', { type: 'button', class: 'secondary-btn', text: '活用形を追加' });
    const formsListBox = el('div', { class: 'forms-list' });

    function resetFormInputs() {
      editingFormIndex = null;
      formLabelInput.value = '';
      formReadingInput.value = '';
      formMeaningInput.value = '';
      addFormBtn.textContent = '活用形を追加';
    }

    function renderForms() {
      formsListBox.innerHTML = '';
      if (forms.length === 0) {
        formsListBox.appendChild(el('p', { class: 'lead-text', text: 'まだ活用形はありません。' }));
        return;
      }
      forms.forEach((f, idx) => {
        const text = f.meaning ? `${f.label}: ${f.reading}(${f.meaning})` : `${f.label}: ${f.reading}`;
        formsListBox.appendChild(
          el('div', { class: 'form-chip' + (editingFormIndex === idx ? ' editing' : '') }, [
            el('button', {
              type: 'button', class: 'form-chip-text-btn', text,
              onclick: () => {
                editingFormIndex = idx;
                formLabelInput.value = f.label;
                formReadingInput.value = f.reading;
                formMeaningInput.value = f.meaning || '';
                addFormBtn.textContent = '活用形を更新';
                renderForms();
              }
            }),
            el('button', {
              type: 'button', class: 'form-chip-remove', text: '×',
              onclick: () => {
                forms.splice(idx, 1);
                if (editingFormIndex === idx) resetFormInputs();
                renderForms();
              }
            })
          ])
        );
      });
    }
    renderForms();

    addFormBtn.addEventListener('click', () => {
      const label = formLabelInput.value.trim();
      const reading = formReadingInput.value.trim();
      const meaning = formMeaningInput.value.trim();
      if (!label || !reading) { UI.toast('活用形の名前と読みを入力してください'); return; }
      if (editingFormIndex !== null) {
        forms[editingFormIndex] = { ...forms[editingFormIndex], label, reading, meaning };
        UI.toast('活用形を更新しました');
      } else {
        forms.push({ id: 'f-' + Date.now() + '-' + Math.random().toString(16).slice(2), label, reading, meaning });
      }
      resetFormInputs();
      renderForms();
    });

    // 「動詞」タグを付けたら、この言語に登録済みの活用パターン(過去形・否定形など)を
    // 読みに対して自動で全部試し、作れるものはまとめて活用形に追加する。
    // 読みをまだ入力していない状態でタグを付けた場合に備え、読み欄からフォーカスが外れた
    // タイミングでも(動詞タグが付いていれば)静かに再チェックする。
    function autoApplyVerbPatterns(options) {
      const silent = options && options.silent;
      const reading = readingInput.value.trim();
      if (!reading) {
        if (!silent) UI.toast('先に読みを入力すると、動詞の活用形を自動で作れます');
        return;
      }
      const patternRules = Store.getRules(lang.id).filter(r => r.pattern && r.isConjugation);
      let addedCount = 0;
      patternRules.forEach(r => {
        if (forms.some(f => f.sourceRuleId === r.id)) return;
        const result = Store.applyRulePattern(r.pattern, reading);
        if (!result) return;
        forms.push({ id: 'f-' + Date.now() + '-' + Math.random().toString(16).slice(2), label: r.category, reading: result, meaning: '', sourceRuleId: r.id });
        addedCount++;
      });
      renderForms();
      if (addedCount > 0) UI.toast(`活用形を${addedCount}件、自動で追加しました`);
    }

    readingInput.addEventListener('blur', () => {
      if (selectedCategories.has('動詞')) autoApplyVerbPatterns({ silent: true });
    });

    const relevantRuleCats = ['動詞', '過去', '未来', '複数', '否定', '疑問', '単語の作り方'];
    const referenceRules = relevantRuleCats
      .flatMap(cat => Store.getRules(lang.id, { category: cat }))
      .slice(0, 8);
    const rulesHint = referenceRules.length
      ? el('div', { class: 'rules-hint' }, [
          el('div', { class: 'section-label', text: '登録済みのルール(パターン付きはタップで読みをセットできます)' }),
          ...referenceRules.map(r => {
            if (r.pattern) {
              return el('button', {
                type: 'button', class: 'rule-apply-btn',
                onclick: () => {
                  const reading = readingInput.value.trim();
                  if (!reading) { UI.toast('先に読みを入力してください'); return; }
                  const result = Store.applyRulePattern(r.pattern, reading);
                  if (!result) { UI.toast(`「${r.title}」はこの読みには使えませんでした`); return; }
                  editingFormIndex = null;
                  formLabelInput.value = r.category;
                  formReadingInput.value = result;
                  formMeaningInput.value = '';
                  addFormBtn.textContent = '活用形を追加';
                  renderForms();
                  formMeaningInput.focus();
                  UI.toast(`「${r.title}」の読みをセットしました。意味を入れて追加してください`);
                }
              }, [
                el('strong', { text: r.title }),
                el('span', { class: 'rule-apply-hint', text: `(${patternSummaryText(r.pattern)})` })
              ]);
            }
            return el('div', { class: 'rules-hint-item' }, [
              el('strong', { text: r.title }),
              r.content ? el('span', { text: ` — ${r.content}` }) : null
            ]);
          })
        ])
      : el('p', { class: 'lead-text', text: 'ルールタブでこの言語の活用ルールを決めておくと、ここで参考にしながら活用形を作れます。' });

    const formsSection = el('div', { class: 'forms-section' }, [
      el('div', { class: 'section-label', text: '活用形(過去形・命令形など)' }),
      formsListBox,
      el('div', { class: 'form-add-row' }, [formLabelInput, formReadingInput, formMeaningInput, addFormBtn]),
      rulesHint
    ]);

    let advancedOpen = false;
    const posInput = el('input', { type: 'text', placeholder: '例: 名詞', value: existing ? existing.pos : '' });
    const pronInput = el('input', { type: 'text', placeholder: '例: らーもー', value: existing ? existing.pronunciation : '' });
    const descInput = el('textarea', { placeholder: '説明' }, existing ? existing.description : '');
    const exampleInput = el('textarea', { placeholder: '例文' }, existing ? existing.example : '');
    const memoInput = el('textarea', { placeholder: 'メモ' }, existing ? existing.memo : '');

    const advancedBox = el('div', { class: 'advanced-box', hidden: !advancedOpen }, [
      field('品詞', posInput),
      field('発音メモ', pronInput),
      field('説明', descInput),
      field('例文', exampleInput),
      field('メモ', memoInput)
    ]);

    const toggleBtn = el('button', { class: 'link-btn', type: 'button', text: '詳しい項目を追加する' });
    toggleBtn.addEventListener('click', () => {
      advancedOpen = !advancedOpen;
      advancedBox.hidden = !advancedOpen;
      toggleBtn.textContent = advancedOpen ? '詳しい項目を閉じる' : '詳しい項目を追加する';
    });

    const form = el('div', { class: 'modal-form' }, [
      el('h3', { text: isEdit ? '単語を編集する' : '単語を登録する' }),
      field('意味', meaningInput),
      field('読み', readingInput),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'カテゴリ(いくつでも選べます)' }),
        tagWrap,
        el('div', { class: 'new-category-row' }, [newCategoryInput, addCategoryBtn])
      ]),
      formsSection,
      toggleBtn,
      advancedBox,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', type: 'button', onclick: UI.closeModal }, 'キャンセル'),
        el('button', {
          class: 'primary-btn', type: 'button',
          onclick: () => {
            if (!meaningInput.value.trim() || !readingInput.value.trim()) {
              UI.toast('意味と読みを入力してください');
              return;
            }
            const data = {
              meaning: meaningInput.value.trim(),
              reading: readingInput.value.trim(),
              categories: Array.from(selectedCategories),
              forms,
              pos: posInput.value.trim(),
              pronunciation: pronInput.value.trim(),
              description: descInput.value.trim(),
              example: exampleInput.value.trim(),
              memo: memoInput.value.trim()
            };
            if (isEdit) Store.updateWord(existing.id, data);
            else Store.createWord(lang.id, data);
            UI.closeModal();
            Router.refresh();
            UI.toast(isEdit ? '更新しました' : '登録しました');
          }
        }, isEdit ? '更新する' : '登録する')
      ])
    ]);
    UI.openModal(form);
  }

  function field(label, inputNode) {
    return el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: label }),
      inputNode
    ]);
  }

  // ---------- ルール ----------
  function rules(lang) {
    const root = el('div', { class: 'view view-rules' });
    const hasPatternRules = Store.getRules(lang.id).some(r => r.pattern && r.isConjugation);
    if (hasPatternRules) {
      root.appendChild(el('button', {
        class: 'ghost-btn',
        onclick: () => {
          const result = Store.applyPatternsToAllVerbs(lang.id);
          if (result.formsAdded > 0) {
            UI.toast(`動詞${result.wordsUpdated}件に活用形${result.formsAdded}件を反映しました`);
          } else {
            UI.toast('反映できる新しい活用形はありませんでした');
          }
          Router.refresh();
        }
      }, '動詞の活用形を今すぐ更新する'));
    }
    // カテゴリを「活用形(過去・未来・否定・疑問)」と「それ以外(語順・複数など)」の
    // 2つの大きなグループに分けて表示する。
    const conjugationCats = Store.getConjugationRuleCategories();
    const otherCats = Store.getRuleCategories().filter(c => !conjugationCats.includes(c));

    function renderCategoryGroup(groupTitle, cats) {
      const nodes = [];
      let anyInGroup = false;
      cats.forEach(cat => {
        const list = Store.getRules(lang.id, { category: cat });
        if (list.length === 0) return;
        anyInGroup = true;
        nodes.push(el('div', { class: 'section-label', text: cat }));
        const cardList = el('div', { class: 'card-list' });
        list.forEach(rule => {
          cardList.appendChild(
            el('button', { class: 'rule-card', onclick: () => openRuleDetail(lang, rule) }, [
              el('div', { class: 'rule-title', text: rule.title }),
              el('div', { class: 'rule-content', text: rule.content })
            ])
          );
        });
        nodes.push(cardList);
      });
      if (!anyInGroup) return false;
      root.appendChild(el('div', { class: 'rule-group-title', text: groupTitle }));
      nodes.forEach(n => root.appendChild(n));
      return true;
    }

    const hasConjugationRules = renderCategoryGroup('活用形のルール', conjugationCats);
    const hasOtherRules = renderCategoryGroup('それ以外のルール', otherCats);
    const any = hasConjugationRules || hasOtherRules;
    if (!any) {
      root.appendChild(empty('まだルールがありません。右下の「＋」から、自分たちの言語のルールを追加してみましょう。'));
    }
    return root;
  }

  function patternSummaryText(pattern) {
    const pt = Store.getPatternTypes().find(p => p.id === pattern.type);
    const label = pt ? pt.label : pattern.type;
    if (pattern.type === 'suffix-replace') {
      const pairs = pattern.pairs && pattern.pairs.length ? pattern.pairs : (pattern.from ? [{ from: pattern.from, to: pattern.to }] : []);
      return `${label}(${pairs.map(p => `${p.from}→${p.to}`).join('、')})`;
    }
    return `${label}(${pattern.to})`;
  }

  function openRuleDetail(lang, rule) {
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: rule.title }),
      el('p', { class: 'rule-detail-category', text: rule.category }),
      el('p', { class: 'rule-detail-content', text: rule.content }),
      rule.pattern ? el('p', { class: 'lead-text', text: `活用パターン: ${patternSummaryText(rule.pattern)}` }) : null,
      rule.pattern
        ? el('p', { class: 'lead-text', text: rule.isConjugation ? '「動詞」タグの単語に自動で反映されます。' : '活用形ではないので「動詞」タグには自動反映されません。' })
        : null,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: () => { UI.closeModal(); ruleForm(lang, rule); } }, '編集する'),
        el('button', {
          class: 'danger-btn',
          onclick: () => {
            Store.deleteRule(rule.id);
            UI.closeModal();
            Router.refresh();
          }
        }, '削除する')
      ])
    ]);
    UI.openModal(content);
  }

  function ruleForm(lang, existing) {
    const isEdit = !!existing;
    const conjugationCats = Store.getConjugationRuleCategories();
    const otherCats = Store.getRuleCategories().filter(c => !conjugationCats.includes(c));
    const categorySelect = el('select', {}, [
      el('optgroup', { label: '活用形(過去・未来・否定・疑問)' },
        conjugationCats.map(cat => el('option', { value: cat, text: cat, selected: existing && existing.category === cat }))),
      el('optgroup', { label: 'それ以外のルール' },
        otherCats.map(cat => el('option', { value: cat, text: cat, selected: existing && existing.category === cat })))
    ]);
    const titleInput = el('input', { type: 'text', placeholder: '例: 動詞は a で終わる', value: existing ? existing.title : '' });
    const contentInput = el('textarea', { placeholder: '例: nara(行く) → nari(行った) のように a を i に変える' }, existing ? existing.content : '');

    // ---- 活用パターン(任意。設定すると単語登録画面でワンタップ適用できる) ----
    let selectedPatternType = existing && existing.pattern ? existing.pattern.type : null;

    // 語尾を置きかえる: 「語尾がこの文字ならこう変える」の組をいくつでも登録できる
    // (否定形などは語尾が a/i/u とまちまちなことがあるため、1組だけでは対応できない)
    let pairs = (existing && existing.pattern && existing.pattern.type === 'suffix-replace')
      ? (existing.pattern.pairs && existing.pattern.pairs.length
          ? existing.pattern.pairs
          : (existing.pattern.from ? [{ from: existing.pattern.from, to: existing.pattern.to }] : [])
        ).map(p => ({ ...p }))
      : [];
    const pairsListBox = el('div', { class: 'forms-list' });
    function renderPairs() {
      pairsListBox.innerHTML = '';
      if (pairs.length === 0) {
        pairsListBox.appendChild(el('p', { class: 'lead-text', text: 'まだ組がありません。' }));
        return;
      }
      pairs.forEach((p, idx) => {
        pairsListBox.appendChild(
          el('div', { class: 'form-chip' }, [
            el('span', { class: 'form-chip-text', text: `${p.from} → ${p.to}` }),
            el('button', {
              type: 'button', class: 'form-chip-remove', text: '×',
              onclick: () => { pairs.splice(idx, 1); renderPairs(); }
            })
          ])
        );
      });
    }
    renderPairs();

    const pairFromInput = el('input', { type: 'text', placeholder: '語尾がこの文字なら(例: a)' });
    const pairToInput = el('input', { type: 'text', placeholder: 'こう変える(例: anai)' });
    const addPairBtn = el('button', {
      type: 'button', class: 'secondary-btn',
      onclick: () => {
        const from = pairFromInput.value.trim();
        const to = pairToInput.value.trim();
        if (!from || !to) { UI.toast('語尾の文字と、変えた後の文字を入力してください'); return; }
        pairs.push({ from, to });
        pairFromInput.value = '';
        pairToInput.value = '';
        renderPairs();
      }
    }, '組を追加');

    const suffixReplaceBox = el('div', { class: 'forms-section' }, [
      el('div', { class: 'section-label', text: '語尾ごとの組(いくつでも追加できます)' }),
      pairsListBox,
      el('div', { class: 'form-add-row' }, [pairFromInput, pairToInput, addPairBtn])
    ]);

    // 語尾に付け足す / 語頭に付け足す / 母音をすべて置きかえる: かえた後(付け足す)の文字だけでよい
    const initialTo = existing && existing.pattern && existing.pattern.type !== 'suffix-replace' ? (existing.pattern.to || '') : '';
    const toInput = el('input', { type: 'text', placeholder: '例: i', value: initialTo });
    const toField = field('かえた後・付け足す文字', toInput);
    const singleBox = el('div', { class: 'forms-section' }, [toField]);

    function updatePatternFieldsVisibility() {
      suffixReplaceBox.hidden = selectedPatternType !== 'suffix-replace';
      const showSingle = selectedPatternType === 'suffix-add' || selectedPatternType === 'prefix-add' || selectedPatternType === 'vowel-shift';
      singleBox.hidden = !showSingle;
      conjugationRow.hidden = !selectedPatternType;
    }

    const patternTypeWrap = el('div', { class: 'tag-select-wrap' });
    function renderPatternTypes() {
      patternTypeWrap.innerHTML = '';
      Store.getPatternTypes().forEach(pt => {
        patternTypeWrap.appendChild(el('button', {
          type: 'button',
          class: 'tag-option' + (selectedPatternType === pt.id ? ' selected' : ''),
          title: pt.hint,
          text: pt.label,
          onclick: () => {
            selectedPatternType = selectedPatternType === pt.id ? null : pt.id;
            renderPatternTypes();
            updatePatternFieldsVisibility();
          }
        }));
      });
    }
    renderPatternTypes();

    // 「語順」や「複数」のように、動詞の活用形とは言えないルールまで
    // 「動詞」タグに自動で流れ込まないよう、活用形かどうかを明示的に選べるようにする。
    let isConjugation = existing ? !!existing.isConjugation : conjugationCats.includes(categorySelect.value);
    const conjugationCheckbox = el('input', { type: 'checkbox' });
    conjugationCheckbox.checked = isConjugation;
    conjugationCheckbox.addEventListener('change', () => { isConjugation = conjugationCheckbox.checked; });
    const conjugationRow = el('label', { class: 'checkbox-row' }, [
      conjugationCheckbox,
      el('span', { text: 'これは動詞の活用形です(過去形・否定形など)。チェックすると「動詞」タグの単語に自動で反映されます。' })
    ]);
    categorySelect.addEventListener('change', () => {
      isConjugation = conjugationCats.includes(categorySelect.value);
      conjugationCheckbox.checked = isConjugation;
    });

    const patternBox = el('div', { class: 'forms-section' }, [
      el('div', { class: 'section-label', text: '活用パターン(任意)' }),
      el('p', { class: 'lead-text', text: '決めておくと、単語登録のときにワンタップで活用形を作れます。' }),
      patternTypeWrap,
      suffixReplaceBox,
      singleBox,
      conjugationRow
    ]);
    updatePatternFieldsVisibility();

    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: isEdit ? 'ルールを編集する' : 'ルールを追加する' }),
      field('カテゴリ', categorySelect),
      field('タイトル', titleInput),
      field('内容', contentInput),
      patternBox,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: UI.closeModal }, 'キャンセル'),
        el('button', {
          class: 'primary-btn',
          onclick: () => {
            if (!titleInput.value.trim()) { UI.toast('タイトルを入力してください'); return; }
            let pattern = null;
            if (selectedPatternType === 'suffix-replace') {
              if (pairs.length === 0) { UI.toast('語尾の組を1つ以上追加してください'); return; }
              pattern = { type: 'suffix-replace', pairs: pairs.slice() };
            } else if (selectedPatternType) {
              if (!toInput.value.trim()) { UI.toast('「かえた後・付け足す文字」を入力してください'); return; }
              pattern = { type: selectedPatternType, to: toInput.value.trim() };
            }
            const data = {
              category: categorySelect.value,
              title: titleInput.value.trim(),
              content: contentInput.value.trim(),
              pattern,
              isConjugation: pattern ? isConjugation : false
            };
            if (isEdit) Store.updateRule(existing.id, data);
            else Store.createRule(lang.id, data);
            UI.closeModal();
            Router.refresh();
            if (pattern && isConjugation) {
              const result = Store.applyPatternsToAllVerbs(lang.id);
              if (result.formsAdded > 0) {
                UI.toast(`ルールを${isEdit ? '更新' : '追加'}し、動詞${result.wordsUpdated}件に活用形${result.formsAdded}件を反映しました`);
              } else {
                UI.toast(isEdit ? 'ルールを更新しました' : 'ルールを追加しました');
              }
            } else {
              UI.toast(isEdit ? 'ルールを更新しました' : 'ルールを追加しました');
            }
          }
        }, isEdit ? '更新する' : '追加する')
      ])
    ]);
    UI.openModal(content);
  }

  // ---------- チャット ----------
  function chat(lang) {
    const root = el('div', { class: 'view view-chat' });
    const messages = Store.getMessages(lang.id);
    const me = Store.getCurrentUserName();

    const list = el('div', { class: 'chat-list', id: 'chat-list' });
    if (messages.length === 0) {
      list.appendChild(empty('まだメッセージがありません。自分たちの言語で話しかけてみましょう。'));
    } else {
      messages.forEach(m => {
        const mine = m.sender === me;
        list.appendChild(
          el('div', { class: `chat-bubble-row ${mine ? 'mine' : ''}` }, [
            !mine ? el('div', { class: 'chat-sender', text: m.sender }) : null,
            el('button', { class: 'chat-bubble', onclick: () => openMessageMeaning(lang, m.text) }, [
              glyphDisplay(lang, m.text),
              el('div', { class: 'chat-bubble-text', text: m.text })
            ])
          ])
        );
      });
    }
    root.appendChild(list);

    const inputRow = el('div', { class: 'chat-input-row' });
    const keyboardToggleBtn = el('button', { class: 'chat-dict-btn', text: '文字', onclick: () => toggleKeyboard() });
    const searchBtn = el('button', { class: 'chat-dict-btn', text: '検索', onclick: () => openChatDictSearch(lang, textInput) });
    const textInput = el('input', { type: 'text', placeholder: '自分たちの言語で入力…', class: 'chat-text-input' });
    const sendBtn = el('button', { class: 'send-btn', text: '送信' });

    const scrollToBottom = () => {
      const root = document.getElementById('view-root');
      if (root) root.scrollTop = root.scrollHeight;
    };

    const doSend = () => {
      const value = textInput.value.trim();
      if (!value) return;
      Store.sendMessage(lang.id, value);
      textInput.value = '';
      Router.refresh({ preserveScroll: true });
      requestAnimationFrame(scrollToBottom);
    };
    sendBtn.addEventListener('click', doSend);
    textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });

    // ---- 自作文字キーボード(登録済みの母音・子音・数字をタップして入力できる) ----
    const keyboardPanel = el('div', { class: 'glyph-keyboard', hidden: true });
    function renderKeyboardPanel() {
      keyboardPanel.innerHTML = '';
      const allSounds = [...Store.getVowels(), ...Store.getConsonants(), ...Store.getDigits()];
      allSounds.forEach(sound => {
        const glyph = Store.getSoundGlyph(lang.id, sound);
        if (!glyph) return;
        const insertValue = Store.getDigits().includes(sound) ? (glyph.reading || sound) : sound;
        keyboardPanel.appendChild(
          el('button', {
            type: 'button', class: 'glyph-key',
            onclick: () => { textInput.value += insertValue; textInput.focus(); }
          }, el('span', { class: 'sound-preview', html: `<svg viewBox="0 0 100 100">${Glyphs.sanitizeSvgPaths(glyph.svgPaths)}</svg>` }))
        );
      });
      if (keyboardPanel.children.length === 0) {
        keyboardPanel.appendChild(el('p', { class: 'lead-text', text: 'まだ文字が登録されていません。「文字」タブで作ってみましょう。' }));
      }
      keyboardPanel.appendChild(el('button', { type: 'button', class: 'glyph-key glyph-key-wide', text: 'スペース', onclick: () => { textInput.value += ' '; textInput.focus(); } }));
      keyboardPanel.appendChild(el('button', { type: 'button', class: 'glyph-key glyph-key-wide', text: '⌫ 消す', onclick: () => { textInput.value = textInput.value.slice(0, -1); textInput.focus(); } }));
    }
    renderKeyboardPanel();

    function toggleKeyboard() {
      const showing = keyboardPanel.hidden;
      keyboardPanel.hidden = !showing;
      keyboardToggleBtn.classList.toggle('active', showing);
      if (showing) textInput.focus();
    }

    inputRow.appendChild(keyboardToggleBtn);
    inputRow.appendChild(searchBtn);
    inputRow.appendChild(textInput);
    inputRow.appendChild(sendBtn);

    const inputArea = el('div', { class: 'chat-input-area' }, [inputRow, keyboardPanel]);
    root.appendChild(inputArea);

    requestAnimationFrame(scrollToBottom);
    return root;
  }

  function openMessageMeaning(lang, reading) {
    const words = reading.trim().split(/\s+/).filter(Boolean);

    // 1語だけなら、これまで通り詳しく(語形・意味・タグ)表示する
    if (words.length <= 1) {
      const entry = Store.findEntryByReading(lang.id, reading);
      const content = el('div', { class: 'modal-form' }, [
        el('h3', { text: reading }),
        entry
          ? el('div', { class: 'detail-rows' }, [
              entry.label ? el('div', { class: 'detail-row chat-meaning-row' }, [el('div', { class: 'detail-label', text: '語形' }), el('div', { class: 'detail-value', text: `${entry.word.reading} の${entry.label}` })]) : null,
              el('div', { class: 'detail-row chat-meaning-row' }, [el('div', { class: 'detail-label', text: '意味' }), el('div', { class: 'detail-value', text: entry.meaning })]),
              hashtagRow(entry.word.categories)
            ])
          : el('p', { text: '辞書に登録されていない言葉です。' })
      ]);
      UI.openModal(content);
      return;
    }

    // 複数語(スペース区切り)なら、単語の並び順のまま、読みとその意味を1組にして横に並べる
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: reading }),
      el('div', { class: 'chat-meaning-cols' },
        words.map(word => {
          const entry = Store.findEntryByReading(lang.id, word);
          const label = entry && entry.label ? `${word}(${entry.label})` : word;
          return el('div', { class: 'chat-meaning-col' }, [
            el('div', { class: 'detail-label', text: label }),
            el('div', { class: 'detail-value', text: entry ? entry.meaning : '辞書に登録されていません' })
          ]);
        })
      )
    ]);
    UI.openModal(content);
  }

  // 単語+活用形をフラットな候補一覧にする(チャット内辞書検索用)
  function flattenEntries(lang, query) {
    const words = Store.getWords(lang.id, query ? { query } : {});
    const entries = [];
    words.forEach(w => {
      entries.push({ reading: w.reading, meaning: w.meaning, label: null });
      (w.forms || []).forEach(f => entries.push({ reading: f.reading, meaning: f.meaning || w.meaning, label: f.label }));
    });
    return entries;
  }

  function openChatDictSearch(lang, textInput) {
    const searchBox = el('input', { type: 'search', placeholder: '意味や読みで検索(例: 走る)', class: 'search-input' });
    const resultBox = el('div', { class: 'card-list', id: 'chat-search-results' });

    const renderResults = (q) => {
      resultBox.innerHTML = '';
      if (!q.trim()) {
        resultBox.appendChild(empty('言葉を入力すると辞書から候補を探します。'));
        return;
      }
      const entries = flattenEntries(lang, q).slice(0, 30);
      entries.forEach(entry => {
        resultBox.appendChild(
          el('button', {
            class: 'word-card', onclick: () => {
              textInput.value = (textInput.value ? textInput.value + ' ' : '') + entry.reading;
              UI.closeModal();
              textInput.focus();
            }
          }, [
            el('div', { class: 'word-reading', text: entry.reading }),
            el('div', { class: 'word-meaning', text: entry.label ? `${entry.meaning}(${entry.label})` : entry.meaning })
          ])
        );
      });
      if (entries.length === 0) resultBox.appendChild(empty('見つかりませんでした。'));
    };

    searchBox.addEventListener('input', () => renderResults(searchBox.value));

    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: '辞書から探して入力する' }),
      searchBox,
      resultBox
    ]);
    UI.openModal(content);
    renderResults('');
  }

  // ---------- 言語作成 ----------
  function newLanguageForm() {
    const savedName = Store.getCurrentUserName();
    const nameInput = el('input', { type: 'text', placeholder: '例: NAMIKA' });
    const myNameInput = el('input', { type: 'text', placeholder: 'あなたの表示名(例: たろう)', value: savedName && savedName !== 'わたし' ? savedName : '' });
    const passcodeInput = el('input', { type: 'text', inputmode: 'numeric', placeholder: '部屋を作れる人だけが知っている番号' });
    const submitBtn = el('button', { class: 'primary-btn' }, '作る');
    submitBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const myName = myNameInput.value.trim();
      const passcode = passcodeInput.value.trim();
      if (!name) { UI.toast('言語の名前を入力してください'); return; }
      if (!myName) { UI.toast('あなたの表示名を入力してください'); return; }
      if (!passcode) { UI.toast('暗証番号を入力してください'); return; }
      submitBtn.disabled = true;
      try {
        const lang = await Cloud.createLanguage(name, myName, passcode);
        UI.closeModal();
        Router.go(`#/lang/${lang.id}/home`);
        showInviteCode(lang);
      } catch (err) {
        console.error(err);
        UI.toast(err && err.message ? err.message : '作成に失敗しました。通信環境を確認してください。');
        submitBtn.disabled = false;
      }
    });
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: '新しい言語を作る' }),
      field('言語の名前', nameInput),
      field('あなたの表示名', myNameInput),
      field('部屋作成の暗証番号', passcodeInput),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: UI.closeModal }, 'キャンセル'),
        submitBtn
      ])
    ]);
    UI.openModal(content);
  }

  // 合言葉(招待コード)を、友達に共有できる形で見せるモーダル
  async function copyToClipboard(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      UI.toast(`${label}をコピーしました`);
    } catch (e) {
      UI.toast('コピーできませんでした。手動で選択してコピーしてください。');
    }
  }

  function inviteLinkFor(code) {
    return `${location.origin}${location.pathname}#/join?code=${encodeURIComponent(code)}`;
  }

  function showInviteCode(lang) {
    const linkInput = el('input', { type: 'text', readonly: true, value: inviteLinkFor(lang.inviteCode) });
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: `「${lang.name}」の合言葉` }),
      el('p', { text: 'この合言葉を友達に伝えてください。友達は「合言葉で参加する」からこの言語に参加できます。' }),
      el('div', { class: 'invite-code-box', text: lang.inviteCode || '' }),
      el('button', { class: 'secondary-btn', type: 'button', onclick: () => copyToClipboard(lang.inviteCode, '合言葉') }, '合言葉をコピー'),
      field('招待リンク(開くと合言葉が自動で入力されます)', linkInput),
      el('button', { class: 'secondary-btn', type: 'button', onclick: () => copyToClipboard(inviteLinkFor(lang.inviteCode), 'リンク') }, 'リンクをコピー'),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'primary-btn', onclick: UI.closeModal }, 'わかった')
      ])
    ]);
    UI.openModal(content);
  }

  // 管理者だけが実行できる、招待コードの再発行(実行前に確認する)
  function confirmRegenerateInviteCode(lang) {
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: '招待コードを再発行しますか？' }),
      el('p', { text: '今の合言葉はすぐに使えなくなります。すでに参加しているメンバーはそのまま残ります。' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: UI.closeModal }, 'キャンセル'),
        el('button', {
          class: 'danger-btn',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const newCode = await Cloud.regenerateInviteCode(lang.id);
              UI.closeModal();
              UI.toast('新しい合言葉を発行しました');
              showInviteCode(Object.assign({}, lang, { inviteCode: newCode }));
            } catch (err) {
              console.error(err);
              UI.toast(err && err.message ? err.message : '再発行に失敗しました');
              e.target.disabled = false;
            }
          }
        }, '再発行する')
      ])
    ]);
    UI.openModal(content);
  }

  // 友達から受け取った合言葉で、既存の言語に参加する。prefillCode があれば入力欄に自動で入れる。
  function joinLanguageForm(prefillCode) {
    const savedName = Store.getCurrentUserName();
    const codeInput = el('input', { type: 'text', placeholder: '例: AB7K8', value: prefillCode || '' });
    const myNameInput = el('input', { type: 'text', placeholder: 'あなたの表示名(例: たろう)', value: savedName && savedName !== 'わたし' ? savedName : '' });
    const submitBtn = el('button', { class: 'primary-btn' }, '参加する');
    submitBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim();
      const myName = myNameInput.value.trim();
      if (!code) { UI.toast('合言葉を入力してください'); return; }
      if (!myName) { UI.toast('あなたの表示名を入力してください'); return; }
      submitBtn.disabled = true;
      try {
        const lang = await Cloud.joinLanguage(code, myName);
        UI.closeModal();
        Router.go(`#/lang/${lang.id}/home`);
      } catch (err) {
        console.error(err);
        UI.toast('合言葉が正しくないか、参加に失敗しました');
        submitBtn.disabled = false;
      }
    });
    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: '合言葉で参加する' }),
      field('合言葉', codeInput),
      field('あなたの表示名', myNameInput),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', onclick: UI.closeModal }, 'キャンセル'),
        submitBtn
      ])
    ]);
    UI.openModal(content);
  }

  // ---------- ＋ボタンのメニュー ----------
  // 言語ホーム画面用のメニュー(辞書タブ・ルールタブは＋を押すと直接フォームが開くので、
  // ここは「単語かルールか選択肢が複数ある」言語ホームでのみ使う)。
  function addMenu(context) {
    const lang = context.lang;
    const items = [
      { label: '単語を追加する', onClick: () => { UI.closeModal(); wordForm(lang); } },
      { label: 'ルールを追加する', onClick: () => { UI.closeModal(); ruleForm(lang); } }
    ];
    const content = el('div', { class: 'modal-form add-menu' }, [
      el('h3', { text: '作る' }),
      ...items.map(item => el('button', { class: 'menu-btn', onclick: item.onClick }, item.label))
    ]);
    UI.openModal(content);
  }

  // ---------- 文字(オリジナル文字) ----------
  function glyphBoard(lang) {
    const root = el('div', { class: 'view view-glyphs' });
    root.appendChild(el('p', { class: 'lead-text' },
      '母音と子音の文字パーツを作ると、辞書やチャットの言葉が自動で自作文字に変換されます。'));

    root.appendChild(el('div', { class: 'section-label', text: '母音' }));
    root.appendChild(el('div', { class: 'sound-grid' }, Store.getVowels().map(s => soundTile(lang, s))));

    root.appendChild(el('div', { class: 'section-label', text: '子音' }));
    root.appendChild(el('div', { class: 'sound-grid' }, Store.getConsonants().map(s => soundTile(lang, s))));

    root.appendChild(el('div', { class: 'section-label', text: '数字' }));
    root.appendChild(el('p', { class: 'lead-text', text: '数字ごとに文字と、自分たちの言語での読み方を決められます。' }));
    root.appendChild(el('div', { class: 'sound-grid' }, Store.getDigits().map(s => soundTile(lang, s))));

    return root;
  }

  function soundTile(lang, sound) {
    const glyph = Store.getSoundGlyph(lang.id, sound);
    return el('button', {
      class: 'sound-tile' + (glyph ? ' has-glyph' : ''),
      onclick: () => drawingModal(lang, sound)
    }, [
      glyph
        ? el('div', { class: 'sound-preview', html: `<svg viewBox="0 0 100 100">${Glyphs.sanitizeSvgPaths(glyph.svgPaths)}</svg>` })
        : el('div', { class: 'sound-preview empty', text: '＋' }),
      el('div', { class: 'sound-label', text: sound }),
      glyph && glyph.reading ? el('div', { class: 'sound-reading', text: glyph.reading }) : null
    ]);
  }

  const DRAW_TOOLS = [
    { id: 'pen', label: 'ペン', icon: '∿' },
    { id: 'line', label: '直線', icon: '╱' },
    { id: 'dot', label: '点', icon: '●' },
    { id: 'circle', label: '丸', icon: '○' },
    { id: 'rect', label: '四角', icon: '□' },
    { id: 'triangle', label: '三角', icon: '△' },
    { id: 'eraser', label: '消しゴム', icon: '⌫' }
  ];
  const ERASE_RADIUS = 16;

  function drawingModal(lang, sound) {
    const existing = Store.getSoundGlyph(lang.id, sound);
    const isDigit = Store.getDigits().includes(sound);
    const readingInput = isDigit
      ? el('input', { type: 'text', placeholder: '例: 0なら ze', value: existing ? (existing.reading || '') : '' })
      : null;
    const size = 260;

    const canvas = el('canvas', { width: size, height: size, class: 'glyph-canvas' });
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1c1b17';
    ctx.fillStyle = '#1c1b17';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let currentTool = 'pen';
    const shapes = []; // {type:'stroke',points}|{type:'line'|'circle'|'rect'|'triangle',x1,y1,x2,y2}|{type:'dot',x,y,r}
    let currentStroke = null; // ペン描画中の点配列
    let dragStart = null; // 直線・図形の始点
    let erasing = false;

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function drawShape(shape) {
      ctx.beginPath();
      if (shape.type === 'stroke') {
        if (shape.points.length < 2) return;
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
        ctx.stroke();
      } else if (shape.type === 'line') {
        ctx.moveTo(shape.x1, shape.y1);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
      } else if (shape.type === 'dot') {
        ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape.type === 'circle') {
        const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2;
        const rx = Math.abs(shape.x2 - shape.x1) / 2, ry = Math.abs(shape.y2 - shape.y1) / 2;
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape.type === 'rect') {
        ctx.rect(Math.min(shape.x1, shape.x2), Math.min(shape.y1, shape.y2), Math.abs(shape.x2 - shape.x1), Math.abs(shape.y2 - shape.y1));
        ctx.stroke();
      } else if (shape.type === 'triangle') {
        const topX = (shape.x1 + shape.x2) / 2, topY = Math.min(shape.y1, shape.y2);
        const bottomY = Math.max(shape.y1, shape.y2);
        ctx.moveTo(topX, topY);
        ctx.lineTo(shape.x1, bottomY);
        ctx.lineTo(shape.x2, bottomY);
        ctx.closePath();
        ctx.stroke();
      }
    }

    function redraw() {
      ctx.clearRect(0, 0, size, size);
      shapes.forEach(drawShape);
    }

    function buildShape(type, start, end) {
      if (type === 'line') return { type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      return { type, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }

    // 確定した図形の輪郭を、消しゴムでなぞって部分消去できるよう密な点列(=ペンの線と同じ形式)に変換する
    function sampleSegment(a, b, spacing) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(1, Math.ceil(dist / spacing));
      const pts = [];
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      return pts;
    }

    function shapeToStrokePoints(type, start, end) {
      const spacing = 8;
      if (type === 'line') return sampleSegment(start, end, spacing);
      const x1 = start.x, y1 = start.y, x2 = end.x, y2 = end.y;
      if (type === 'rect') {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY }];
        let pts = [];
        for (let i = 0; i < 4; i++) pts = pts.concat(sampleSegment(corners[i], corners[i + 1], spacing).slice(0, -1));
        pts.push(corners[4]);
        return pts;
      }
      if (type === 'triangle') {
        const topX = (x1 + x2) / 2, topY = Math.min(y1, y2);
        const bottomY = Math.max(y1, y2);
        const verts = [{ x: topX, y: topY }, { x: x1, y: bottomY }, { x: x2, y: bottomY }, { x: topX, y: topY }];
        let pts = [];
        for (let i = 0; i < 3; i++) pts = pts.concat(sampleSegment(verts[i], verts[i + 1], spacing).slice(0, -1));
        pts.push(verts[3]);
        return pts;
      }
      if (type === 'circle') {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
        const circumference = 2 * Math.PI * Math.max(rx, ry, 1);
        const n = Math.max(12, Math.ceil(circumference / spacing));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * Math.PI * 2;
          pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
        }
        return pts;
      }
      return [];
    }

    // 消しゴム: フリーハンドの線・確定済みの図形(すべて点列化されている)はなぞった部分だけ消え、
    // 点(dot)だけは小さすぎて部分消去に意味がないので触れたら丸ごと消える
    function eraseNear(pos) {
      let changed = false;
      const next = [];
      shapes.forEach(shape => {
        if (shape.type === 'stroke') {
          const segments = [];
          let current = [];
          shape.points.forEach(pt => {
            if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= ERASE_RADIUS) {
              if (current.length > 1) segments.push(current);
              current = [];
              changed = true;
            } else {
              current.push(pt);
            }
          });
          if (current.length > 1) segments.push(current);
          segments.forEach(points => next.push({ type: 'stroke', points }));
        } else if (shape.type === 'dot') {
          if (Math.hypot(shape.x - pos.x, shape.y - pos.y) > ERASE_RADIUS) next.push(shape);
          else changed = true;
        } else {
          next.push(shape);
        }
      });
      if (changed) {
        shapes.length = 0;
        shapes.push(...next);
      }
    }

    canvas.addEventListener('pointerdown', (e) => {
      const pos = pointerPos(e);
      canvas.setPointerCapture(e.pointerId);
      if (currentTool === 'pen') {
        currentStroke = [pos];
        shapes.push({ type: 'stroke', points: currentStroke });
      } else if (currentTool === 'dot') {
        shapes.push({ type: 'dot', x: pos.x, y: pos.y, r: 6 });
        redraw();
      } else if (currentTool === 'eraser') {
        erasing = true;
        eraseNear(pos);
        redraw();
      } else {
        dragStart = pos;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const pos = pointerPos(e);
      if (currentTool === 'pen' && currentStroke) {
        const prev = currentStroke[currentStroke.length - 1];
        currentStroke.push(pos);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (dragStart) {
        redraw();
        drawShape(buildShape(currentTool, dragStart, pos));
      } else if (currentTool === 'eraser' && erasing) {
        eraseNear(pos);
        redraw();
      }
    });
    function endStroke(e) {
      const pos = pointerPos(e);
      if (currentTool === 'pen') {
        currentStroke = null;
      } else if (dragStart) {
        const points = shapeToStrokePoints(currentTool, dragStart, pos);
        if (points.length > 1) shapes.push({ type: 'stroke', points });
        dragStart = null;
        redraw();
      }
      erasing = false;
    }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointerleave', () => { currentStroke = null; dragStart = null; erasing = false; });

    const toolBar = el('div', { class: 'tool-bar' });
    function renderToolBar() {
      toolBar.innerHTML = '';
      DRAW_TOOLS.forEach(t => {
        toolBar.appendChild(
          el('button', {
            type: 'button',
            class: 'tool-btn' + (currentTool === t.id ? ' active' : ''),
            onclick: () => { currentTool = t.id; renderToolBar(); }
          }, [
            el('span', { class: 'tool-icon', text: t.icon }),
            el('span', { class: 'tool-label', text: t.label })
          ])
        );
      });
    }
    renderToolBar();

    const undoBtn = el('button', { class: 'secondary-btn', type: 'button', text: '一つ戻す' });
    undoBtn.addEventListener('click', () => { shapes.pop(); redraw(); });
    const clearBtn = el('button', { class: 'secondary-btn', type: 'button', text: '全部消す' });
    clearBtn.addEventListener('click', () => { shapes.length = 0; redraw(); });

    const previewNote = existing
      ? el('div', { class: 'glyph-preview-note' }, [
          el('span', { text: '今の文字: ' }),
          el('span', { class: 'sound-preview', html: `<svg viewBox="0 0 100 100">${Glyphs.sanitizeSvgPaths(existing.svgPaths)}</svg>` })
        ])
      : null;

    const content = el('div', { class: 'modal-form' }, [
      el('h3', { text: `「${sound}」の文字を描く` }),
      previewNote,
      isDigit ? field('読み方(自分たちの言語でどう読むか)', readingInput) : null,
      el('p', { class: 'lead-text', text: 'ペンや図形ツールで描けます。消しゴムはなぞった線だけ、または触れた図形ごと消えます。' }),
      toolBar,
      el('div', { class: 'canvas-wrap' }, canvas),
      el('div', { class: 'modal-actions' }, [undoBtn, clearBtn]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'secondary-btn', type: 'button', onclick: UI.closeModal }, 'キャンセル'),
        el('button', {
          class: 'primary-btn', type: 'button',
          onclick: () => {
            if (shapes.length === 0) { UI.toast('文字を描いてください'); return; }
            const svgPaths = shapesToSvgPaths(shapes, size);
            Store.saveSoundGlyph(lang.id, sound, svgPaths, isDigit ? readingInput.value.trim() : undefined);
            UI.closeModal();
            Router.refresh();
            UI.toast('文字を保存しました');
          }
        }, '保存する')
      ])
    ]);
    UI.openModal(content);
  }

  function shapesToSvgPaths(shapes, canvasSize) {
    const scale = 100 / canvasSize;
    const s = (n) => (n * scale).toFixed(1);
    return shapes.map(shape => {
      if (shape.type === 'stroke') {
        if (shape.points.length < 2) return '';
        const d = shape.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${s(p.x)} ${s(p.y)}`).join(' ');
        return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`;
      }
      if (shape.type === 'dot') {
        return `<circle cx="${s(shape.x)}" cy="${s(shape.y)}" r="${s(shape.r)}" fill="currentColor" />`;
      }
      return '';
    }).join('');
  }

  // 単語カードなどで使う、読みの上に自作文字を添えて表示するブロック。
  // 未登録の音があっても、1つでも自作文字が使えていれば表示する(欠けた音だけプレースホルダーになる)。
  function glyphDisplay(lang, reading) {
    const result = Glyphs.buildWordGlyph(lang.id, reading);
    if (!result.hasAny) return null;
    return el('div', { class: 'glyph-word', html: result.markup });
  }

  return {
    home, languageHome, dictionaryIndex, dictionaryTags, dictionaryCategory, rules, chat,
    newLanguageForm, joinLanguageForm, wordForm, ruleForm, addMenu,
    glyphBoard, glyphDisplay, historyList
  };
})();
