# Nosia Cloud — système de design

Source de vérité pour l’accueil FR/EN. Décisions du 7 novembre 2026, issues du brief, des styles accessibles de Dilolabs et des recherches ui-ux-pro-max (voir `docs/redesign-audit.md`). Les propositions ne sont pas présentées comme des caractéristiques historiques de la marque.

## Intention

Un assistant concret pour l’entreprise, porté par une équipe accessible. Swiss Modernism 2.0 pour la hiérarchie ; Soft UI Evolution pour la douceur, sans neumorphisme. L’action dominante est « Parlons de votre projet », vers `mailto:contact@nosia.cloud`.

## Parenté et identité

| Élément | Partagé avec Dilolabs, vérifié | Propre à Nosia.cloud / adaptation nouvelle |
|---|---|---|
| Typographie | Raleway variable locale, titres 600, boutons 700 | Titres et longueurs adaptés à l’offre IA et aux deux langues |
| Couleurs neutres | Papier `#f8f7f3`, blanc, encre `#202627`, secondaire `#545b5c` | Vert logo original `#1bd626` / `#16ab21`, accent de lecture `#216e3a`, teinte `#eaf1e6` |
| Hiérarchie | Grille 12 colonnes, labels numérotés, titres équilibrés | Usages → déploiements → accompagnement → maîtrise → FAQ → contact |
| Espacement | Unité 4/8 px, sections 64–112 px, largeur 78 rem | Gouttières dès 16 px à 320 px ; panneaux adaptés aux petites largeurs |
| Contrôles | Boutons 48 px, rayon 14 px, états sans déplacement | CTA vert, choix système/clair/sombre conservé |
| Surfaces | Cadres 20 px, cartes 24 px, panneaux 28–36 px, ombres légères | Capture de démonstration Nosia et teintes vertes, contact vert sombre |
| Iconographie | SVG linéaires, trait 1,5, flèches simples | Petite collection locale, décorative à côté des libellés, aucune dépendance |
| Ton et interactions | Direct, accessible, focus net, mouvement limité | Contexte PME, périmètre explicite, liens Nosia.ai secondaires |
| Signature | Lien vers l’équipe qui développe | « Nosia, développé par Dilolabs » et présentation de son rôle |

## Tokens et composants

Implémentation centralisée : `assets/css/tokens.css`. Mise en page et composants : `assets/css/site.css`. Pas de couleurs arbitraires par section hors tokens. Les couleurs du logo restent intactes ; son vert clair n’est pas utilisé pour du petit texte sur fond clair.

- Couleurs sémantiques : fond, surface, fond doux, teinte, encre, texte secondaire, primaire/sur-primaire, ligne, contrôle, focus ; palette spécifique au panneau de contact.
- Typographie : Raleway variable latine normale uniquement, `font-display: swap`, pile système en repli. H1 fluide 36–60 px, h2 30–46 px, texte 16–18 px, interligne 1,65–1,75, longueur courante 55–65 caractères.
- Espacement : 4, 8, 12, 16, 24, 32, 48, 64, 96, 112 px. Largeur maximale 1248 px. Pas de grille de cartes systématique.
- Rayons : 10 px petits contrôles ; 14 px boutons/champs ; 20 px captures ; 24 px cartes ; panneaux fluides 28–36 px. Les rayons imbriqués sont plus petits que leur enveloppe.
- Ombres : uniquement pour les surfaces élevées, 4–16 px de diffusion à faible opacité. Pas d’ombre épaisse ni d’effet plastique.
- Transitions : bordures et soulignements 160 ms ; couleurs de texte/fond immédiates pour préserver le contraste au changement de thème. Aucun mouvement décoratif permanent, aucun GSAP.
- Thème sombre : conserver les mécanismes de préférence et leur repli sans JavaScript, avec palette mesurée séparément. Les thèmes ne modifient ni les images originales ni la signification des couleurs.

## Contenu et composants communs

`_data/landing.yml` et `_data/translations.yml` : même structure dans les deux langues. `_includes/landing.html` : sept sections sémantiques ; `_includes/header.html`, `_includes/footer.html`, `_includes/icon.html` : éléments partagés.

- Hero : promesse existante, accent sur « assistant IA privé », brève description, deux actions, signature et vraie capture. La capture est extraite du GIF du dépôt, statique, légendée comme démonstration existante en anglais. Aucune nouvelle interface simulée.
- Usages : trois situations avec exemples de demandes explicitement illustratifs. Connexions conditionnées aux intégrations disponibles. Vérification humaine rappelée.
- Déploiements : trois panneaux comparables avec lieu, matériel ou dimensionnement connu et réserve commune sur les responsabilités. France et Suisse restent distinctes. Fournisseurs, pas partenaires certifiés.
- Accompagnement : trois étapes, prestations possibles mais non incluses par défaut, rôle de Dilolabs.
- Maîtrise : lieu, accès, modèles et connexions à convenir ; ressources techniques Nosia.ai et GitHub secondaires. Ne pas convertir le socle open source en garantie générale de sécurité.
- FAQ : six `details` natifs. Contact : e-mail fonctionnel, pas de formulaire sans serveur.

## Accessibilité et qualité

Lien d’évitement, un h1, hiérarchie des titres, footer hors main, navigation clavier, focus 3 px non rogné, contrôles ≥44 px, contraste du texte ≥4,5:1 et limites des contrôles ≥3:1. Pas de hauteur fixe sur le texte ni d’overflow global masquant les erreurs. Capture fluide sans recadrage.

Vérifier FR/EN, système/clair/sombre, sans JS, scripts indisponibles, stockage refusé, 320–1440 px, paysage et zoom navigateur réel 200 %. FAQ clavier, liens de contact et ancres testés. Sous `prefers-reduced-motion`, défilement instantané et transitions supprimées. Aucun tableau introduit : les options se réorganisent verticalement sur mobile.

## À ne pas ajouter sans source

Prix, abonnement, disponibilité, délai de réponse, clients, témoignages, certifications, chiffres de productivité, connecteurs précis, garantie générale de confidentialité ou conformité. Installation, maintenance, support et formation ne sont pas inclus implicitement. Voir les limites factuelles dans l’audit.
