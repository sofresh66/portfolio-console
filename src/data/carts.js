/* =====================================================================
   TES CARTOUCHES
   ---------------------------------------------------------------------
   C’est le seul fichier à modifier pour changer le contenu du site.
   Chaque objet du tableau = une cartouche sur l’étagère.

   id        → identifiant, sert aussi de lien profond : /#moi, /#projet-1…
   title     → nom imprimé sur l’étiquette et titre de l’écran de jeu
   subtitle  → petite ligne sous le titre sur l’écran « Appuie sur Start »
   color     → couleur du plastique de la cartouche
   motif     → décor pixel art de l’étiquette et de l’écran titre :
               "coucher" | "montagnes" | "damier" | "rayures" | "galaxie" | "vagues"
   palette   → couleurs de l’écran : fond, texte, accent, et 3 couleurs de décor
   music     → (facultatif) note de base et tempo de la musique chiptune
   blocks    → contenu de l’écran, dans l’ordre. Types disponibles :

     { type: "title",  text: "…" }                    gros titre
     { type: "text",   text: "…" }                    paragraphe (s’écrit lettre par lettre)
     { type: "hero",   text: "…" }                    avatar pixel + paragraphe
     { type: "heading", text: "…" }                   petit intertitre
     { type: "stats",  items: [["Clé", "Valeur"], …] } fiche de personnage
     { type: "bars",   items: [["Code", 0.7], …] }     jauges (0 à 1)
     { type: "tags",   items: ["HTML", "CSS"] }        étiquettes
     { type: "image",  src: "/images/capture.png", alt: "…" }  capture (rendue en pixels)
     { type: "link",   label: "Voir le projet", href: "https://…" }
     { type: "links",  items: [{ label: "…", href: "…" }, …] }
     { type: "countdown", from: 9, end: "Merci !" }   compte à rebours « Continuer ? »

   Les textes entre crochets [comme ça] sont à remplacer par les tiens.
   ===================================================================== */

export const CARTS = [
  {
    id: "moi",
    title: "Qui je suis",
    subtitle: "Profil du joueur",
    color: "#d8423a",
    motif: "coucher",
    palette: { bg: "#241b4d", fg: "#f4f0ff", accent: "#ffd23f", art: ["#4b2a8a", "#c2447a", "#ffd23f"] },
    music: { root: 57, tempo: 112 },
    blocks: [
      { type: "title", text: "Qui je suis" },
      {
        type: "hero",
        text: "Salut, moi c’est [Ton prénom]. J’habite à [ta ville] et je fabrique des sites, des petits jeux et tout ce qui me passe par la tête.",
      },
      { type: "heading", text: "Fiche du personnage" },
      {
        type: "stats",
        items: [
          ["Classe", "Créateur·rice du web"],
          ["Niveau", "[ton âge ou tes années d’expérience]"],
          ["Arme", "[ton outil préféré]"],
        ],
      },
      { type: "heading", text: "Compétences" },
      { type: "bars", items: [["Code", 0.7], ["Design", 0.6], ["Curiosité", 0.96]] },
    ],
  },
  {
    id: "projet-1",
    title: "Projet n°1",
    subtitle: "[Nom du projet 1]",
    color: "#2f6fd6",
    motif: "montagnes",
    palette: { bg: "#0e2a4a", fg: "#e6f6ff", accent: "#5ee1ff", art: ["#d7f3ff", "#2b5aa8", "#1d3b6e"] },
    music: { root: 60, tempo: 126 },
    blocks: [
      { type: "title", text: "[Nom du projet 1]" },
      {
        type: "text",
        text: "Sorti en [année]. Décris ici ton projet en deux ou trois phrases : le problème de départ, ce que tu as construit, et ce que tu en as appris.",
      },
      { type: "heading", text: "Fait avec" },
      { type: "tags", items: ["HTML", "CSS", "JavaScript"] },
      { type: "link", label: "Voir le projet", href: "https://example.com" },
    ],
  },
  {
    id: "projet-2",
    title: "Projet n°2",
    subtitle: "[Nom du projet 2]",
    color: "#2e9e62",
    motif: "damier",
    palette: { bg: "#10331f", fg: "#eaffea", accent: "#8cff7a", art: ["#8cff7a", "#1f6b3a", "#0b2615"] },
    music: { root: 55, tempo: 138 },
    blocks: [
      { type: "title", text: "[Nom du projet 2]" },
      {
        type: "text",
        text: "Sorti en [année]. Un deuxième projet dont tu es fier ou fière : raconte l’idée, montre une capture, mets le lien.",
      },
      { type: "heading", text: "Fait avec" },
      { type: "tags", items: ["[Outil]", "[Outil]"] },
      { type: "link", label: "Voir le projet", href: "https://example.com" },
    ],
  },
  {
    id: "contact",
    title: "Me contacter",
    subtitle: "Continuer ?",
    color: "#e8b830",
    motif: "rayures",
    palette: { bg: "#3a1020", fg: "#fff0ea", accent: "#ff8a5c", art: ["#ff8a5c", "#3a1020", "#ffd1a6"] },
    music: { root: 53, tempo: 100 },
    blocks: [
      { type: "title", text: "Continuer ?" },
      { type: "countdown", from: 9, end: "Merci !" },
      { type: "text", text: "Tu veux bosser avec moi ou juste dire bonjour ? Insère une pièce :" },
      {
        type: "links",
        items: [
          { label: "toi@exemple.fr", href: "mailto:toi@exemple.fr" },
          { label: "GitHub", href: "https://github.com/" },
          { label: "Instagram", href: "https://instagram.com/" },
        ],
      },
    ],
  },
];

/* Ton prénom, utilisé sur l’enseigne de l’étagère et dans l’intro. */
export const OWNER = "[Ton prénom]";
