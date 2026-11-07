import unittest
from landing_page_test import Page, EXPECTED, SITE_DIR


class RedesignTest(unittest.TestCase):
    def pages(self):
        for lang, expected in EXPECTED.items():
            yield lang, Page(SITE_DIR / expected['file'])

    def test_dilolabs_signature_and_role(self):
        for lang, page in self.pages():
            with self.subTest(lang=lang):
                signature = 'Nosia, développé par Dilolabs' if lang == 'fr' else 'Nosia, developed by Dilolabs'
                links = page.find('a', href='https://dilolabs.fr')
                self.assertTrue(any(link.text == signature for link in links))
                self.assertIn('Dilolabs', page.one('section', id='accompagnement').text)

    def test_real_static_product_preview(self):
        for lang, page in self.pages():
            with self.subTest(lang=lang):
                image = page.one('img', src='/assets/images/nosia-product.webp')
                self.assertEqual(image.attrs['width'], '800')
                self.assertEqual(image.attrs['height'], '500')
                self.assertTrue(image.attrs.get('alt'))
                self.assertIn('figure', image.ancestors)
                self.assertTrue((SITE_DIR / 'assets/images/nosia-product.webp').is_file())
                caption = page.one('figcaption').text.lower()
                self.assertIn('démonstration' if lang == 'fr' else 'demonstration', caption)
                self.assertIn('anglais' if lang == 'fr' else 'english', caption)
                self.assertFalse(page.find('img', src='/assets/images/nosia-demo.gif'))

    def test_examples_are_labelled_and_deployments_comparable(self):
        for lang, page in self.pages():
            with self.subTest(lang=lang):
                self.assertEqual(len(page.find('blockquote')), 3)
                uses = page.one('section', id='usages')
                self.assertIn('Exemples de demandes' if lang == 'fr' else 'Example requests', uses.text)
                cards = [node for node in page.find('article') if 'data-deployment' in node.attrs]
                for card in cards:
                    self.assertIn('Dimensionnement' if lang == 'fr' else 'Sizing', card.text)
                self.assertEqual(len(page.find('dl')), 3)

    def test_landmarks_and_local_font(self):
        for lang, page in self.pages():
            with self.subTest(lang=lang):
                main = page.one('main', id='main-content')
                self.assertEqual(main.attrs.get('tabindex'), '-1')
                self.assertNotIn('main', page.one('footer').ancestors)
                self.assertTrue(page.find('a', href='#main-content'))
                self.assertFalse([node for node in page.find('link') if 'fonts.googleapis' in node.attrs.get('href', '')])
                self.assertTrue((SITE_DIR / 'assets/fonts/raleway-latin-variable.woff2').is_file())
                self.assertFalse((SITE_DIR / 'design-system').exists())

    def test_language_alternates_and_decorative_icons(self):
        for lang, page in self.pages():
            with self.subTest(lang=lang):
                alternates = page.find('link', rel='alternate')
                self.assertEqual({link.attrs.get('hreflang') for link in alternates}, {'fr', 'en', 'x-default'})
                for icon in page.find('svg'):
                    self.assertEqual(icon.attrs.get('aria-hidden'), 'true')
                    self.assertEqual(icon.attrs.get('focusable'), 'false')


if __name__ == '__main__':
    unittest.main()
