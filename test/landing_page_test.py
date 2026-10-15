from html.parser import HTMLParser
from pathlib import Path
import json
import os
import re
import unittest

SITE_DIR = Path(os.environ.get('SITE_DIR', '/tmp/opencode/nosia-cloud-value-proposition-site'))
EXPECTED = {
    'fr': {
        'file': 'index.html',
        'hero': 'Votre assistant IA privé, adapté à votre entreprise.',
        'subtitle': "Interrogez vos documents, préparez vos contenus et simplifiez le travail de vos équipes. Dans vos locaux, en France chez Scaleway ou en Suisse chez Infomaniak : choisissez le déploiement adapté à vos exigences, avec un accompagnement défini selon votre projet.",
        'title': 'Nosia.cloud — Assistant IA privé pour les PME',
        'description': 'Un assistant IA privé pour vos équipes, déployé dans vos locaux, en France chez Scaleway ou en Suisse chez Infomaniak. Parlons de votre projet.',
        'cta': 'Parlons de votre projet',
        'language_url': '/index-en.html',
        'language_label': 'English',
        'no_external_api': "sans transmettre le contenu à une API d'IA externe",
        'notice': "Les contenus produits par l'IA doivent être vérifiés avant utilisation.",
    },
    'en': {
        'file': 'index-en.html',
        'hero': 'Your private AI assistant, tailored to your business.',
        'subtitle': "Ask questions about your documents, prepare content and simplify your team's day-to-day work. On your premises, in France with Scaleway or in Switzerland with Infomaniak: choose the deployment that fits your requirements, with support scoped to your project.",
        'title': 'Nosia.cloud — Private AI assistant for SMEs',
        'description': "A private AI assistant for your team, deployed on your premises, in France with Scaleway or in Switzerland with Infomaniak. Let's discuss your project.",
        'cta': "Let's discuss your project",
        'language_url': '/',
        'language_label': 'Français',
        'no_external_api': 'without sending content to an external AI API',
        'notice': 'AI-generated content must be checked before use.',
    },
}

class Element:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.ancestors = ()
        self.parts = []

    @property
    def text(self):
        return re.sub(r'\s+', ' ', ''.join(self.parts)).strip()

class Page(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.stack = []
        self.feed(path.read_text(encoding='utf-8'))
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        node.ancestors = tuple(parent.tag for parent in self.stack)
        self.nodes.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        for node in self.stack:
            node.parts.append(data)

    def find(self, tag, **attrs):
        return [node for node in self.nodes if node.tag == tag
                and all(node.attrs.get(key) == value for key, value in attrs.items())]

    def one(self, tag, **attrs):
        nodes = self.find(tag, **attrs)
        if len(nodes) != 1:
            raise AssertionError(f'{tag} {attrs}: attendu 1 élément, trouvé {len(nodes)}')
        return nodes[0]

class LandingPageTest(unittest.TestCase):
    def pages(self):
        for lang, expected in EXPECTED.items():
            yield lang, expected, Page(SITE_DIR / expected['file'])

    def test_hero(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                self.assertEqual(page.one('html').attrs['lang'], lang)
                self.assertEqual(page.one('h1').text, expected['hero'])
                self.assertEqual(page.one('p', id='hero-subtitle').text, expected['subtitle'])
                self.assertNotRegex(page.one('section', id='hero').text, r'RAG|MCP|GB10')

    def test_sections(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                self.assertEqual([node.attrs.get('id') for node in page.find('section')],
                                 ['hero', 'usages', 'deployments', 'accompagnement',
                                  'confiance', 'faq', 'contact'])
                self.assertEqual(len(page.find('details')), 6)
                self.assertEqual(len(page.find('summary')), 6)
                self.assertIn(expected['notice'], page.one('section', id='usages').text)

    def test_deployments(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                deployment_cards = [node for node in page.find('article')
                                    if 'data-deployment' in node.attrs]
                deployment_ids = [node.attrs['data-deployment'] for node in deployment_cards]
                self.assertEqual(len(deployment_cards), 3)
                self.assertEqual(len(deployment_ids), len(set(deployment_ids)),
                                 'Identifiants de déploiement dupliqués')
                cards = {node.attrs['data-deployment']: node.text
                         for node in deployment_cards}
                self.assertEqual(set(cards), {'on_site', 'scaleway', 'infomaniak'})
                self.assertIn('France', cards['on_site'])
                self.assertIn('GB10', cards['on_site'])
                self.assertIn('France', cards['scaleway'])
                self.assertIn('Scaleway', cards['scaleway'])
                self.assertIn(expected['no_external_api'], cards['scaleway'])
                self.assertRegex(cards['infomaniak'], r'Suisse|Switzerland')
                self.assertIn('Infomaniak', cards['infomaniak'])
                self.assertNotIn(expected['no_external_api'], cards['on_site'])
                self.assertNotIn(expected['no_external_api'], cards['infomaniak'])

    def test_main_has_no_unapproved_claims(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                text = page.one('main').text
                self.assertNotRegex(text, r'\d[\d ,.]*\s*[€$]|\$\s*\d|99[,.]9\s*%')
                self.assertNotRegex(text, r'(?i)14[- ](?:day|jours)|24/7|100\s*%\s*souverain')
                self.assertNotRegex(text, r'(?i)\b(?:essais?|trials?|SLA)\b')
                self.assertNotRegex(text, r'(?i)tout inclus')
                classes = {name for node in page.nodes
                           for name in (node.attrs.get('class') or '').split()}
                self.assertNotIn('pricing-grid', classes)
                self.assertNotIn('testimonial-grid', classes)
                self.assertFalse(page.find('form'))
                self.assertIn('OpenAI', page.one('section', id='confiance').text)
                self.assertIn('RAG', page.one('section', id='confiance').text)
                self.assertIn('MCP', page.one('section', id='confiance').text)
                self.assertIn('contact@nosia.cloud', text)

    def test_service_scope(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                scope = page.one('p', id='support-scope').text
                terms = ['Installation', 'maintenance', 'mises à jour', 'support', 'accompagnement'] if lang == 'fr' else ['Installation', 'maintenance', 'updates', 'support', 'business use cases']
                for term in terms:
                    self.assertIn(term, scope)
                qualification = 'ces prestations sont possibles' if lang == 'fr' else 'are available services'
                self.assertIn(qualification, scope)
                limit = 'ne sont pas systématiquement incluses' if lang == 'fr' else 'not automatically included'
                self.assertIn(limit, scope)

    def test_navigation_and_contact(self):
        allowed_external = {
            'https://nosia.ai/', 'https://nosia.ai/#documentation',
            'https://github.com/dilolabs/nosia',
        }
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                ids = [node.attrs['id'] for node in page.nodes if 'id' in node.attrs]
                self.assertEqual(len(ids), len(set(ids)), 'Identifiants HTML dupliqués')
                header_links = [node for node in page.find('a') if 'header' in node.ancestors]
                logos = [node for node in header_links
                         if 'logo' in (node.attrs.get('class') or '').split()]
                self.assertEqual([node.attrs.get('href') for node in logos],
                                 ['/' if lang == 'fr' else '/index-en.html'])
                self.assertEqual({node.attrs.get('href') for node in header_links
                                  if node.attrs.get('href', '').startswith('#')},
                                 {'#usages', '#deployments', '#documentation'})
                for anchor in page.find('a'):
                    href = anchor.attrs.get('href', '')
                    if href.startswith('#') and href != '#':
                        self.assertIn(href[1:], ids)
                    elif href.startswith('http'):
                        self.assertIn(href, allowed_external)
                contacts = page.find('a', href='mailto:contact@nosia.cloud')
                self.assertGreaterEqual(len(contacts), 3)
                self.assertGreaterEqual(sum(node.text == expected['cta'] for node in contacts), 3)
                self.assertTrue(any(node.text == 'contact@nosia.cloud' for node in contacts))
                self.assertFalse(any('app.nosia.cloud' in node.attrs.get('href', '')
                                     for node in page.find('a')))
                self.assertNotRegex(page.one('main').text, r'(?i)commencer gratuitement|get started free')

    def test_native_language_links(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                other_lang = 'en' if lang == 'fr' else 'fr'
                code = 'EN' if lang == 'fr' else 'FR'
                links = page.find('a', href=expected['language_url'])
                for region in ('header', 'footer'):
                    region_links = [node for node in links if region in node.ancestors
                                    and node.text == (code if region == 'header' else expected['language_label'])]
                    self.assertTrue(region_links, f'Langue accessible dans {region}')
                    for node in region_links:
                        self.assertEqual(node.attrs.get('lang'), other_lang)
                        self.assertEqual(node.attrs.get('hreflang'), other_lang)
                        accessible_name = node.attrs.get('aria-label', node.text)
                        self.assertIn(node.text, accessible_name)
                        self.assertIn(expected['language_label'], accessible_name)
                self.assertFalse(any('data-lang-toggle' in node.attrs for node in page.find('a')))
                for name in ('language-toggle.js', 'pricing-toggle.js'):
                    self.assertFalse(any(name in node.attrs.get('src', '') for node in page.find('script')))

    def test_localized_metadata(self):
        for lang, expected, page in self.pages():
            with self.subTest(lang=lang):
                self.assertEqual(page.one('title').text, expected['title'])
                self.assertEqual(page.one('meta', name='description').attrs['content'], expected['description'])
                for prefix in ('og', 'twitter'):
                    self.assertEqual(page.one('meta', property=f'{prefix}:title').attrs['content'], expected['title'])
                    self.assertEqual(page.one('meta', property=f'{prefix}:description').attrs['content'], expected['description'])
                canonical = 'https://nosia.cloud/' if lang == 'fr' else 'https://nosia.cloud/index-en.html'
                self.assertEqual(page.one('link', rel='canonical').attrs['href'], canonical)
                self.assertEqual(page.one('meta', property='og:url').attrs['content'], canonical)
                schema = json.loads(page.one('script', type='application/ld+json').text)
                self.assertEqual(schema['@type'], 'WebSite')
                self.assertEqual(schema['description'], expected['description'])
                self.assertEqual(schema['url'], canonical)
                self.assertNotRegex(json.dumps(schema), r'"(?:offers|price|priceCurrency|priceValidUntil|availability)"')

    def test_only_public_content_is_published(self):
        self.assertFalse((SITE_DIR / 'docs').exists())
        self.assertFalse((SITE_DIR / 'test').exists())
        self.assertTrue((SITE_DIR / '404.html').is_file())
        self.assertTrue((SITE_DIR / 'assets/images/nosia-logo.png').is_file())

if __name__ == '__main__':
    unittest.main()
