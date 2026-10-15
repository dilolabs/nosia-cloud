import unittest
from landing_page_test import Page, EXPECTED, SITE_DIR


class ThemeMarkupTest(unittest.TestCase):
    def test_assets_before_styles_and_404(self):
        for filename in ('index.html', 'index-en.html', '404.html'):
            with self.subTest(page=filename):
                page = Page(SITE_DIR / filename)
                script = page.one('script', src='/assets/js/theme.js')
                self.assertIn('head', script.ancestors)
                self.assertNotIn('defer', script.attrs)
                self.assertNotIn('async', script.attrs)
                self.assertNotEqual(script.attrs.get('type'), 'module')
                styles = page.find('link', rel='stylesheet')
                self.assertEqual([node.attrs['href'] for node in styles],
                                 ['/assets/css/tokens.css', '/assets/css/site.css'])
                self.assertLess(page.nodes.index(script), min(page.nodes.index(node) for node in styles))
                for node in [script, *styles]:
                    asset = node.attrs.get('src', node.attrs.get('href'))
                    self.assertTrue((SITE_DIR / asset.lstrip('/')).is_file())

    def test_localized_controls_and_hero(self):
        for lang, expected in EXPECTED.items():
            with self.subTest(lang=lang):
                page = Page(SITE_DIR / expected['file'])
                label = page.one('label', **{'class': 'theme-control'})
                self.assertIn('data-theme-control', label.attrs)
                self.assertIn('hidden', label.attrs)
                self.assertIn('Thème' if lang == 'fr' else 'Theme', label.text)
                select = page.one('select', id='theme-preference')
                self.assertEqual(label.attrs['for'], select.attrs['id'])
                self.assertEqual([node.attrs['value'] for node in page.find('option')], ['system', 'light', 'dark'])
                self.assertEqual([node.text for node in page.find('option')],
                                 ['Système', 'Clair', 'Sombre'] if lang == 'fr' else ['System', 'Light', 'Dark'])
                menu = page.one('button', id='navigation-toggle')
                self.assertIn('hidden', menu.attrs)
                self.assertEqual(menu.attrs['aria-controls'], 'section-navigation')
                self.assertEqual(menu.attrs['aria-expanded'], 'false')
                self.assertEqual(page.one('nav').attrs['id'], 'section-navigation')
                self.assertTrue(page.find('aside', **{'class': 'hero-panel'}))
                self.assertFalse([node for node in page.find('img') if 'section' in node.ancestors])
                self.assertEqual(page.one('h1').text, expected['hero'])
                self.assertEqual(page.one('p', id='hero-subtitle').text, expected['subtitle'])
                navigation = page.one('script', src='/assets/js/navigation.js')
                self.assertIn('defer', navigation.attrs)

    def test_original_404_content(self):
        page = Page(SITE_DIR / '404.html')
        self.assertEqual(page.one('h1').text, '404')
        self.assertEqual(page.one('p', **{'class': 'subtitle'}).text, 'Page Not Found')
        self.assertEqual(page.one('a', **{'class': 'btn btn-primary'}).text, 'Go Home')
