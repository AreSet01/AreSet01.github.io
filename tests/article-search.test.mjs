import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeRegex,
  buildSearchPattern,
  findMatchesInText,
  mapMatchToTextNodes,
  extractSnippet,
  normalizeLanguage,
  formatSourceTag,
} from '../src/utils/articleSearchEngine.ts';

test('escapeRegex correctly escapes all regex special characters', () => {
  const specials = '.*+?^${}()|[]\\';
  const escaped = escapeRegex(specials);
  assert.strictEqual(escaped, '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');

  const regex = new RegExp(escaped);
  assert.strictEqual(regex.test(specials), true);
});

test('buildSearchPattern returns null for empty or whitespace query', () => {
  assert.strictEqual(buildSearchPattern('', { caseSensitive: false, wholeWord: false }), null);
  assert.strictEqual(buildSearchPattern('   ', { caseSensitive: false, wholeWord: false }), null);
});

test('buildSearchPattern case sensitivity', () => {
  const caseInsensitive = buildSearchPattern('UE5', { caseSensitive: false, wholeWord: false });
  assert.strictEqual(caseInsensitive?.test('ue5'), true);
  caseInsensitive.lastIndex = 0;
  assert.strictEqual(caseInsensitive?.test('UE5'), true);

  const caseSensitive = buildSearchPattern('UE5', { caseSensitive: true, wholeWord: false });
  assert.strictEqual(caseSensitive?.test('ue5'), false);
  caseSensitive.lastIndex = 0;
  assert.strictEqual(caseSensitive?.test('UE5'), true);
});

test('buildSearchPattern whole word matching', () => {
  const wholeWord = buildSearchPattern('cat', { caseSensitive: false, wholeWord: true });
  assert.strictEqual(wholeWord?.test('the cat sits'), true);
  assert.strictEqual(wholeWord?.test('category'), false);
  assert.strictEqual(wholeWord?.test('bobcat'), false);
  assert.strictEqual(wholeWord?.test('cat.'), true);
  assert.strictEqual(wholeWord?.test('cat_1'), false);
});

test('findMatchesInText finds all instances with correct spans', () => {
  const text = 'UObject reflection in UE5 with UObject CDO';
  const pattern = buildSearchPattern('UObject', { caseSensitive: true, wholeWord: false });
  assert.ok(pattern);
  const matches = findMatchesInText(text, pattern);

  assert.strictEqual(matches.length, 2);
  assert.deepStrictEqual(matches[0], { start: 0, end: 7, text: 'UObject' });
  assert.deepStrictEqual(matches[1], { start: 31, end: 38, text: 'UObject' });
});

test('mapMatchToTextNodes maps cross-node match accurately', () => {
  // Simulating 3 text nodes: "Hello ", "beautiful ", "world!"
  const mockNode1 = { textContent: 'Hello ' };
  const mockNode2 = { textContent: 'beautiful ' };
  const mockNode3 = { textContent: 'world!' };

  const entries = [
    { node: mockNode1, start: 0, end: 6, length: 6 },
    { node: mockNode2, start: 6, end: 16, length: 10 },
    { node: mockNode3, start: 16, end: 22, length: 6 },
  ];

  // Match: "lo beautiful wo" (start 3, end 18)
  const ranges = mapMatchToTextNodes(3, 18, 1, entries);

  assert.strictEqual(ranges.length, 3);
  // Node 1: "lo " -> local 3 to 6
  assert.strictEqual(ranges[0].textNode, mockNode1);
  assert.strictEqual(ranges[0].localStart, 3);
  assert.strictEqual(ranges[0].localEnd, 6);

  // Node 2: "beautiful " -> local 0 to 10
  assert.strictEqual(ranges[1].textNode, mockNode2);
  assert.strictEqual(ranges[1].localStart, 0);
  assert.strictEqual(ranges[1].localEnd, 10);

  // Node 3: "wo" -> local 0 to 2
  assert.strictEqual(ranges[2].textNode, mockNode3);
  assert.strictEqual(ranges[2].localStart, 0);
  assert.strictEqual(ranges[2].localEnd, 2);
});

test('handles complex C++ code queries without throwing regex syntax error', () => {
  const code = 'UFUNCTION(BlueprintCallable, Category="Game") void TakeDamage(float Amount);';
  const query = 'UFUNCTION(BlueprintCallable, Category="Game")';
  const pattern = buildSearchPattern(query, { caseSensitive: true, wholeWord: false });
  assert.ok(pattern);
  const matches = findMatchesInText(code, pattern);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].start, 0);
  assert.strictEqual(matches[0].text, query);
});

test('handles Chinese and mixed English-Chinese text matching', () => {
  const text = '虚幻引擎 5 (UE5) 运行时反射体系与 UObject 垃圾回收机制深入剖析';
  const pattern = buildSearchPattern('垃圾回收', { caseSensitive: false, wholeWord: false });
  assert.ok(pattern);
  const matches = findMatchesInText(text, pattern);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].text, '垃圾回收');

  const ue5Pattern = buildSearchPattern('UE5', { caseSensitive: false, wholeWord: true });
  assert.ok(ue5Pattern);
  const ue5Matches = findMatchesInText(text, ue5Pattern);
  assert.strictEqual(ue5Matches.length, 1);
  assert.strictEqual(ue5Matches[0].text, 'UE5');
});

test('handles multiple matches in a single text string', () => {
  const text = 'Tick Tick Tick Boom';
  const pattern = buildSearchPattern('Tick', { caseSensitive: true, wholeWord: true });
  assert.ok(pattern);
  const matches = findMatchesInText(text, pattern);
  assert.strictEqual(matches.length, 3);
  assert.strictEqual(matches[0].start, 0);
  assert.strictEqual(matches[1].start, 5);
  assert.strictEqual(matches[2].start, 10);
});

test('preserves intentional query spaces when query contains non-whitespace content', () => {
  const text = 'void Process(); avoid AvoidProcess(); void  Other();';
  // Literal search for "void ":
  // 1. "void Process()" -> "void " at 0
  // 2. "avoid AvoidProcess()" -> "avoid " contains "void " at 16
  // 3. "void  Other()" -> "void  " starts with "void " at 38
  const pattern = buildSearchPattern('void ', { caseSensitive: true, wholeWord: false });
  assert.ok(pattern);
  const matches = findMatchesInText(text, pattern);
  assert.strictEqual(matches.length, 3);
  assert.strictEqual(matches[0].start, 0);
  assert.strictEqual(matches[1].start, 17);
  assert.strictEqual(matches[2].start, 38);

  // Whole word search for "void" (without trailing space):
  const wholePattern = buildSearchPattern('void', { caseSensitive: true, wholeWord: true });
  assert.ok(wholePattern);
  const wholeMatches = findMatchesInText(text, wholePattern);
  // Matches "void Process" (0) and "void  Other" (38), but NOT "avoid"
  assert.strictEqual(wholeMatches.length, 2);
  assert.strictEqual(wholeMatches[0].start, 0);
  assert.strictEqual(wholeMatches[1].start, 38);
});

test('handles complex C++ template and scope queries with special characters', () => {
  const code = 'TArray<TSharedPtr<FProperty>> Props = MyClass::StaticClass()->GetProperties();';
  const query = 'TArray<TSharedPtr<FProperty>>';
  const pattern = buildSearchPattern(query, { caseSensitive: true, wholeWord: false });
  assert.ok(pattern);
  const matches = findMatchesInText(code, pattern);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].text, query);

  const scopeQuery = 'MyClass::StaticClass()->GetProperties()';
  const scopePattern = buildSearchPattern(scopeQuery, { caseSensitive: true, wholeWord: false });
  assert.ok(scopePattern);
  const scopeMatches = findMatchesInText(code, scopePattern);
  assert.strictEqual(scopeMatches.length, 1);
  assert.strictEqual(scopeMatches[0].text, scopeQuery);
});

test('handles Unicode case insensitivity across non-ASCII characters', () => {
  const text = 'Résumé of René François';
  const pattern = buildSearchPattern('résumé', { caseSensitive: false, wholeWord: false });
  assert.ok(pattern);
  const matches = findMatchesInText(text, pattern);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].text, 'Résumé');
});

test('extractSnippet extracts bounded context around match with ellipses and whitespace collapsing', () => {
  const text = '深入剖析虚幻引擎 5 (UE5) 垃圾回收系统：追踪式标记-清除算法、RootSet 根集识别、FGCReferenceTokenStream 字节码扫描';
  const matchStart = text.indexOf('RootSet');
  const matchEnd = matchStart + 'RootSet'.length;

  const snippet = extractSnippet(text, matchStart, matchEnd, 15);
  assert.strictEqual(snippet.matchedText, 'RootSet');
  assert.ok(snippet.prefix.startsWith('…'), 'Prefix should have ellipsis when start > radius');
  assert.ok(snippet.suffix.endsWith('…'), 'Suffix should have ellipsis when end + radius < length');
  assert.ok(snippet.prefix.includes('清除算法、'));
  assert.ok(snippet.suffix.includes('根集识别'));

  // Edge case: match at the very beginning
  const startSnippet = extractSnippet('RootSet is the starting point', 0, 7, 10);
  assert.strictEqual(startSnippet.prefix, '');
  assert.strictEqual(startSnippet.matchedText, 'RootSet');
  assert.strictEqual(startSnippet.suffix, ' is the st…');

  // Edge case: match at the very end
  const endText = 'Object graph ends at RootSet';
  const endStart = endText.indexOf('RootSet');
  const endSnippet = extractSnippet(endText, endStart, endStart + 7, 10);
  assert.strictEqual(endSnippet.matchedText, 'RootSet');
  assert.strictEqual(endSnippet.suffix, '');
  assert.strictEqual(endSnippet.prefix, '…h ends at ');

  // Edge case: empty text
  const emptySnippet = extractSnippet('', 0, 0);
  assert.deepStrictEqual(emptySnippet, { prefix: '', matchedText: '', suffix: '' });
});

test('normalizeLanguage converts various lang codes into clean display labels', () => {
  assert.strictEqual(normalizeLanguage('cpp'), 'C++');
  assert.strictEqual(normalizeLanguage('c++'), 'C++');
  assert.strictEqual(normalizeLanguage('cs'), 'C#');
  assert.strictEqual(normalizeLanguage('c#'), 'C#');
  assert.strictEqual(normalizeLanguage('ts'), 'TS');
  assert.strictEqual(normalizeLanguage('typescript'), 'TS');
  assert.strictEqual(normalizeLanguage('js'), 'JS');
  assert.strictEqual(normalizeLanguage('javascript'), 'JS');
  assert.strictEqual(normalizeLanguage('py'), 'Python');
  assert.strictEqual(normalizeLanguage('python'), 'Python');
  assert.strictEqual(normalizeLanguage('rust'), 'Rust');
  assert.strictEqual(normalizeLanguage('sh'), 'Bash');
  assert.strictEqual(normalizeLanguage(''), 'CODE');
  assert.strictEqual(normalizeLanguage(null), 'CODE');
  assert.strictEqual(normalizeLanguage('glsl'), 'GLSL');
});

test('formatSourceTag formats headings and code block contexts correctly', () => {
  // Code block with title
  const codeWithTitle = formatSourceTag(null, { title: 'Reflection.cpp', language: 'cpp' });
  assert.strictEqual(codeWithTitle, '[C++] Reflection.cpp');

  // Code block without title
  const codeNoTitle = formatSourceTag(null, { language: 'cpp' });
  assert.strictEqual(codeNoTitle, '[C++] 代码片段');

  // Markdown heading
  const heading = formatSourceTag('## 二、第一阶段：谁是根集？（RootSet 与可达性识别）');
  assert.strictEqual(heading, '§ 二、第一阶段：谁是根集？（RootSet 与可达性识别）');

  // Markdown heading already starting with §
  const headingSection = formatSourceTag('§ 2.1 垃圾回收标记');
  assert.strictEqual(headingSection, '§ 2.1 垃圾回收标记');

  // Empty fallback
  const fallback = formatSourceTag(null);
  assert.strictEqual(fallback, '§ 导言 / 正文');
});

test('extractSnippet with default radius 36 captures longer C++ statements and function signatures comfortably', () => {
  const code = 'virtual void ProcessReferenceTokenStream(const FGCReferenceTokenStream& TokenStream, UObject* Object) override;';
  const start = code.indexOf('FGCReferenceTokenStream');
  const end = start + 'FGCReferenceTokenStream'.length;

  const snippet = extractSnippet(code, start, end);
  assert.strictEqual(snippet.matchedText, 'FGCReferenceTokenStream');
  // With radius 36, prefix includes full method identifier "ProcessReferenceTokenStream(const "
  assert.ok(snippet.prefix.includes('ProcessReferenceTokenStream(const '));
  // Suffix includes full parameter and override specifier "& TokenStream, UObject* Object) override;"
  assert.ok(snippet.suffix.includes('& TokenStream, UObject* Object)'));
});

