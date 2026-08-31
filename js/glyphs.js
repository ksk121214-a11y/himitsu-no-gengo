/*
 * 「読み」(ローマ字)を、登録済みの母音・子音パーツから自作文字に変換する処理。
 * 文字パーツ自体は Store.getSoundGlyph() で SVG の <path> 断片として保存されている。
 */
const Glyphs = (() => {

  // 読みを「子音+母音」または「母音単独」の単位(音素)に分解する。
  // 例: "ramo" -> [{consonant:'r', vowel:'a', key:'ra'}, {consonant:'m', vowel:'o', key:'mo'}]
  function parseReading(reading) {
    const s = (reading || '').toLowerCase().replace(/[^a-z]/g, '');
    const vowelSet = new Set(Store.getVowels());
    const consonantsByLength = Store.getConsonants().slice().sort((a, b) => b.length - a.length);

    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (vowelSet.has(ch)) {
        tokens.push({ key: ch, consonant: null, vowel: ch });
        i += 1;
        continue;
      }
      const matched = consonantsByLength.find(c => s.startsWith(c, i));
      if (matched) {
        const next = s[i + matched.length];
        if (next && vowelSet.has(next)) {
          tokens.push({ key: matched + next, consonant: matched, vowel: next });
          i += matched.length + 1;
        } else {
          tokens.push({ key: matched, consonant: matched, vowel: null });
          i += matched.length;
        }
        continue;
      }
      tokens.push({ key: ch, consonant: null, vowel: null, unknown: true });
      i += 1;
    }
    return tokens;
  }

  function glyphSvg(glyph) {
    return `<svg viewBox="0 0 100 100" class="glyph-char">${glyph.svgPaths}</svg>`;
  }

  function missingGlyphMarkup(label) {
    return `<span class="glyph-char glyph-char-missing">${label}</span>`;
  }

  // 1音素分のマークアップ。文字が未登録の音は消さず、読みをそのまま添えた枠で示す(単語全体を隠さない)。
  function tokenMarkup(languageId, token) {
    if (token.unknown) return { markup: missingGlyphMarkup(token.key), hasGlyph: false };
    let hasGlyph = false;
    const pieces = [];
    if (token.consonant) {
      const g = Store.getSoundGlyph(languageId, token.consonant);
      if (g) { hasGlyph = true; pieces.push(glyphSvg(g)); }
      else pieces.push(missingGlyphMarkup(token.consonant));
    }
    if (token.vowel) {
      const g = Store.getSoundGlyph(languageId, token.vowel);
      if (g) { hasGlyph = true; pieces.push(glyphSvg(g)); }
      else pieces.push(missingGlyphMarkup(token.vowel));
    }
    return { markup: pieces.join(''), hasGlyph };
  }

  // 読みが、登録済みの数字の読み方と完全一致する場合、その数字の絵をそのまま使う
  function digitExactMatch(languageId, reading) {
    const target = (reading || '').trim().toLowerCase();
    if (!target) return null;
    for (const d of Store.getDigits()) {
      const g = Store.getSoundGlyph(languageId, d);
      if (g && g.reading && g.reading.trim().toLowerCase() === target) return g;
    }
    return null;
  }

  // 1単語分(スペースを含まない)の自作文字マークアップ
  function buildSingleWordGlyph(languageId, word) {
    const digitGlyph = digitExactMatch(languageId, word);
    if (digitGlyph) return { hasAny: true, markup: glyphSvg(digitGlyph) };

    const tokens = parseReading(word);
    if (tokens.length === 0) return { hasAny: false, markup: '' };
    let hasAny = false;
    const markups = tokens.map(token => {
      const result = tokenMarkup(languageId, token);
      if (result.hasGlyph) hasAny = true;
      return result.markup;
    });
    return { hasAny, markup: markups.join('') };
  }

  // 読み全体(スペース区切りの複数単語も可)を自作文字の並びとして組み立てる。
  // 未登録の音があっても欠けた部分だけ示し、単語全体は隠さない。単語ごとにグループ化し、
  // グループ内(文字同士)は詰め、グループ間(単語の切れ目)は広くとれるようにする。
  // hasAny: 1つでも実際の自作文字が使われたか(false ならプレースホルダーしか無いので表示自体しない)。
  function buildWordGlyph(languageId, reading) {
    const words = (reading || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return { hasAny: false, markup: '' };
    let hasAny = false;
    const groups = words.map(word => {
      const result = buildSingleWordGlyph(languageId, word);
      if (result.hasAny) hasAny = true;
      return `<span class="glyph-word-group">${result.markup}</span>`;
    });
    return { hasAny, markup: groups.join('') };
  }

  function hasAnyGlyph(languageId) {
    return Store.getSoundGlyphs(languageId).length > 0;
  }

  return { parseReading, buildWordGlyph, hasAnyGlyph };
})();
