/* nlp-game-master-data.js — Assembles the MASTER course modules into the MODULES array.
   Master module files (MODULE_1_MASTER … MODULE_9_MASTER) are loaded via separate <script>
   tags BEFORE this file, on pages/nlp-game-master.html. The engine (nlp-game.js) reads the
   global `MODULES`, so on the master page MODULES IS the master set (the practitioner
   assembler nlp-game-data.js is NOT loaded there). window.GAME_COURSE='master' separates
   saves/leaderboard. */

const MODULES = [
    window.MODULE_1_MASTER,
    window.MODULE_2_MASTER,
    window.MODULE_3_MASTER,
    window.MODULE_4_MASTER,
    window.MODULE_5_MASTER,
    window.MODULE_6_MASTER,
    window.MODULE_7_MASTER,
    window.MODULE_8_MASTER,
    window.MODULE_9_MASTER,
    window.MODULE_10_MASTER
].filter(Boolean);
