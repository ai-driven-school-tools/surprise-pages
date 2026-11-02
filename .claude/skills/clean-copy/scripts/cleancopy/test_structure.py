"""Semantic regressions for manuscript cues; python -m unittest cleancopy.test_structure."""
import unittest
import json
import re
import tempfile
from unittest.mock import patch
from pathlib import Path
from html.parser import HTMLParser

from .bundle import build, load_manifest
from .convert import build_page, convert_text
from .fix import fix_text
from .source import find_fences, find_headings, find_tables, split_lines
from .validate import validate_text


MANUSCRIPT = '''# 講義

> ### スライド
>
> | 比較 | 結果 |
> | --- | --- |
> | 入力 | 12円 |
>
> ```text
>   入力
>     > 出力
> ```
>
> - 一つ目
> - 二つ目
>
> > ## 内側
> > 内側の説明

\\> 引用ではない
<!-- 指示 -->
## 次の説明
本文
'''


class Tree(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.in_quote = []
        self.ids = []

    def handle_starttag(self, tag, attrs):
        if 'blockquote' in self.stack:
            self.in_quote.append(tag)
        if dict(attrs).get('id'):
            self.ids.append(dict(attrs)['id'])
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            self.stack = self.stack[:len(self.stack) - 1 - self.stack[::-1].index(tag)]


class StructureTests(unittest.TestCase):
    def test_nested_semantics(self):
        result = convert_text(MANUSCRIPT, layout='manuscript', heading_prefix='doc-03')
        tree = Tree()
        tree.feed(result['body'])
        for tag in ('h3', 'table', 'pre', 'code', 'ul', 'li', 'h2', 'blockquote'):
            self.assertIn(tag, tree.in_quote)
        self.assertIn('  入力\n    &gt; 出力', result['body'])
        self.assertIn('&gt; 引用ではない', result['body'])
        self.assertIn('doc-03-次の説明', tree.ids)
        self.assertEqual(result, convert_text(MANUSCRIPT, layout='manuscript', heading_prefix='doc-03'))

    def test_scanners_agree(self):
        lines = split_lines(MANUSCRIPT)
        self.assertEqual(find_fences(lines)[0].lines, ['  入力', '    > 出力'])
        self.assertEqual(len(find_tables(lines)), 1)
        self.assertEqual(len(find_headings(lines)), 4)
        self.assertEqual(validate_text(MANUSCRIPT)['counts']['headings'], 4)

    def test_quoted_mermaid(self):
        result = convert_text('# 題\n\n> ```mermaid\n> flowchart LR\n>   A --> B\n> ```\n')
        self.assertTrue(result['needs_mermaid'])
        self.assertIn('<pre class="mermaid">\nflowchart LR\n  A --&gt; B', result['body'])
        self.assertIn('<blockquote', result['body'])

    def test_fix_preserves_quote_containers(self):
        original = '# 題\n\n> ### 指示\n> | A | B |\n> | --- | --- |\n> | 1 |\n> ```text\n>   内容\n\n## 外\n'
        fixed, _ = fix_text(original, apply_defaults=True)
        self.assertIn('> ## 指示', fixed)
        self.assertIn('> | 1 |  |', fixed)
        self.assertIn('> ```\n\n## 外', fixed)
        self.assertTrue(find_fences(split_lines(fixed))[0].closed)
        self.assertEqual(len(find_headings(split_lines(fixed))), 3)

    def test_heading_ids(self):
        result = convert_text('# 題\n\n## いま一番お得なのはどれか？\n## いま一番お得なのはどれか？\n', heading_prefix='doc-03')
        self.assertIn('id="doc-03-いま一番お得なのはどれか"', result['body'])
        self.assertIn('id="doc-03-いま一番お得なのはどれか-1"', result['body'])

    def test_layout_is_opt_in(self):
        frame = '<html><head><!-- TITLE --><!-- DESCRIPTION --></head><main><!-- CONTENT_START --><!-- CONTENT_END --></main></html>'
        default = build_page(frame, '題', '', '')
        manuscript = build_page(frame, '題', '', '', layout='manuscript')
        self.assertNotIn('data-clean-copy-layout', default)
        self.assertIn('data-clean-copy-document=""', default)
        self.assertIn('data-clean-copy-document=""', manuscript)
        self.assertIn('data-clean-copy-layout="manuscript"', manuscript)
        self.assertIn('max-width:1080px', manuscript)
        self.assertIn('rgb(var(--ads-border))', manuscript)

    def test_page_carries_look_stamp(self):
        """配信側が元の変換表を引けるよう、組んだ見た目の一式の印をページに残す。"""
        from .convert import look, look_stamp
        frame = '<html><head><!-- TITLE --><!-- DESCRIPTION --></head><main><!-- CONTENT_START --><!-- CONTENT_END --></main></html>'
        stamp = look_stamp()
        self.assertRegex(stamp, r'^[0-9a-f]{12}$')
        self.assertIn('data-clean-copy-look="%s"' % stamp, build_page(frame, '題', '', ''))
        self.assertIn('data-clean-copy-look="%s"' % stamp, build_page(frame, '題', '', '', layout='script'))
        # 本文に書くクラスは、どれも一式の中にある（一式の外の値を書くと、付け替えから漏れる）
        body = convert_text('# 題\n\n段落\n\n※ 注記\n\n- 箇条\n')['body']
        known = {value for table in look()['styles'].values() for value in table.values()}
        for value in re.findall(r'<(?:h1|p|ul|section) class="([^"]*)"', body):
            self.assertIn(value, known)

    def test_bundle_reading_marks_are_deterministic(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / 'one.md').write_text('# 最初の章\n\n## 節\n\n本文。\n', encoding='utf-8')
            (folder / 'two.md').write_text('## 次の章\n\n本文。\n', encoding='utf-8')
            frame = folder / 'frame.html'
            frame.write_text('<html><head><title><!-- TITLE --></title><!-- DESCRIPTION --></head><body><main><!-- CONTENT_START --><!-- CONTENT_END --></main></body></html>', encoding='utf-8')
            manifest = folder / 'pages.json'
            manifest.write_text(json.dumps({'version': 1, 'pages': [{'id': 'reading', 'slug': 'tests/reading', 'title': '検査', 'sources': [{'id': 'one', 'path': 'one.md'}, {'id': 'two', 'path': 'two.md', 'label': '手引き "補足"', 'collapsed': True}]}]}), encoding='utf-8')
            _, pages = load_manifest(manifest)
            layout = folder / 'reading-layout.json'
            layout.write_text(json.dumps({'chapterGap': 96, 'chapterGapNarrow': 64, 'narrowWidth': 640}), encoding='utf-8')
            with patch('cleancopy.pipeline.reading_layout_path', return_value=str(layout)):
                first = build(pages, frame_path=frame)
                self.assertEqual(first, build(pages, frame_path=frame))
            self.assertIn('data-clean-copy-document=""', first[0]['html'])
            self.assertIn('data-clean-copy-label="手引き &quot;補足&quot;"', first[0]['html'])
            self.assertEqual(first[0]['html'].count('data-clean-copy-source-id='), 2)
            self.assertIn('margin-block-start:96px', first[0]['html'])
            self.assertIn('margin-block-start:64px', first[0]['html'])

    def test_cli_only_can_still_render(self):
        frame = '<html><head><!-- TITLE --><!-- DESCRIPTION --></head><main><!-- CONTENT_START --><!-- CONTENT_END --></main></html>'
        with tempfile.TemporaryDirectory() as temporary:
            with patch('cleancopy.pipeline.reading_layout_path', return_value=str(Path(temporary) / 'absent.json')):
                result = build_page(frame, '題', '', '<p>本文</p>')
                self.assertIn('data-clean-copy-document=""', result)
                self.assertIn('<p>本文</p>', result)


if __name__ == '__main__':
    unittest.main()
