import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/* global SillyTavern */

import './styles.css';

/**
 * Hacky way to import a module from an ST script file.
 * @param {string} what Name of the exported member to import
 * @returns {Promise<any>} The imported member
 */
async function importFromScript(what) {
    const module = await import(/* webpackIgnore: true */'../../../../../script.js');
    return module[what];
}

/**
 * @type {(prompt: string, api: string, instructOverride: boolean, quietToLoud: boolean, systemPrompt: string, responseLength: number) => Promise<string>}
 */
const generateRaw = await importFromScript('generateRaw');

class TicTacToeGame {
  static gamesLaunched = 0;

  static opponentMovePrompt = `You are an expert Tic-Tac-Toe AI. You are playing as '{{aiSymbol}}'.
The board is a 3x3 grid. 'X' is one player, 'O' is the other. Empty cells are '-'.

Your primary goal is to WIN. If winning is not possible, aim for a draw. Avoid losing at all costs.
Think strategically about every move.
CRITICAL: If the opponent has two symbols in a row (horizontally, vertically, or diagonally) and can win on their next move, your ABSOLUTE PRIORITY is to block that winning move. This is more important than any other consideration unless you can win in the current turn.

Current board state (rows are 0-2, columns are 0-2):
{{board_ascii}}

Available moves are provided as (row_index, column_index) pairs, listed one per line below.
Analyze the board carefully. Choose the STRATEGICALLY BEST move from the available options to achieve your goal of winning.
Consider all possibilities: can you win this turn? Can you block your opponent from winning (especially if they have two in a line)? Can you set up a future win?

Your response MUST be ONLY the chosen (row_index, column_index) pair.
For example, if you choose row 1, column 1, your response must be exactly: (1, 1)
Do NOT include any other text, explanation, or formatting.

Available moves:
{{moves_list}}
Your move:`;
  static commentPrompt = `You are {{char}}. You just played a game of Tic-Tac-Toe against {{user}}.\n
{{user}} was playing as '{{playerSymbol}}' and you were '{{aiSymbol}}'.\n
The outcome of the game was: {{outcome}}.\n
Write a short, {{random:witty,playful,sarcastic,smug,thoughtful,surprised,cheeky}} comment about the game, from your perspective as {{char}}. Keep it brief, like a quick chat message.`;

  constructor(playerSymbol) {
    if (playerSymbol === "random") {
      playerSymbol = Math.random() > 0.5 ? "X" : "O";
    }

    this.gameId = `sillytavern-tictactoe-${Math.random()
      .toString(36)
      .substring(2)}`;
    this.boardId = `tictactoe-board-${this.gameId}`;
    this.playerSymbol = playerSymbol;
    this.aiSymbol = playerSymbol === "X" ? "O" : "X";
    this.board = Array(3)
      .fill(null)
      .map(() => Array(3).fill(null));
    this.currentPlayer = "X"; // X always starts
    this.isGameOver = false;
    this.winner = null;
    this.moveHistory = []; // To store {row, col, symbol}
  }

  getOpponentSymbol() {
    return this.aiSymbol;
  }

  getOutcome() {
    if (this.winner === this.playerSymbol)
      return `${SillyTavern.getContext().name1} (Player) wins`;
    if (this.winner === this.aiSymbol)
      return `${SillyTavern.getContext().name2} (AI) wins`;
    if (this.winner === "draw") return "the game is a draw";
    return "the game was inconclusive";
  }

  async endGame() {
    this.isGameOver = true;
    const context = SillyTavern.getContext();
    const injectId = `tictactoe-${Math.random().toString(36).substring(2)}`;

    try {
      const message = context.chat[this.messageIndex];
      message.mes = `[${context.name1} (${
        this.playerSymbol
      }) played Tic-Tac-Toe against ${context.name2} (${
        this.aiSymbol
      }). Outcome: ${this.getOutcome()}]`;
      this.messageText.textContent = message.mes;
      this.chatMessage.style.order = "";

      if (this.winner) {
        // Only send comment if there's a definitive outcome
        const commentPromptText = TicTacToeGame.commentPrompt
          .replace(/{{playerSymbol}}/gi, this.playerSymbol)
          .replace(/{{aiSymbol}}/gi, this.aiSymbol)
          .replace(/{{outcome}}/gi, this.getOutcome());
        const command = `/inject id="${injectId}" position="chat" depth="0" scan="true" role="system" ephemeral="true" ${commentPromptText} | /trigger await=true`;
        await context.executeSlashCommands(command);
      }
    } finally {
      await context.executeSlashCommands(`/inject id="${injectId}"`);
    }
    this.updateStatus();
  }

  boardToAscii() {
    return this.board
      .map((row) => row.map((cell) => cell || "-").join(" "))
      .join("\n");
  }

  getValidMoves() {
    const moves = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (!this.board[r][c]) {
          moves.push({ r, c });
        }
      }
    }
    return moves;
  }

  async tryMoveOpponent() {
    if (this.isGameOver || this.currentPlayer !== this.aiSymbol) {
      return;
    }

    const validMoves = this.getValidMoves();
    if (validMoves.length === 0) {
      this.checkGameStatus(); // Should lead to draw if no winner
      return;
    }

    const systemPrompt = TicTacToeGame.opponentMovePrompt
      .replace("{{aiSymbol}}", this.aiSymbol)
      .replace("{{board_ascii}}", this.boardToAscii())
      .replace(
        "{{moves_list}}",
        validMoves.map((m) => `(${m.r}, ${m.c})`).join("\n")
      ); // Changed join character

    const maxRetries = 3;
    let moveMade = false;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const reply = await generateRaw(systemPrompt, "", false, false, "", 10); // Short response length
        const parsedMove = this.parseAIMove(reply, validMoves);

        if (parsedMove && !this.board[parsedMove.r][parsedMove.c]) {
          this.makeMove(parsedMove.r, parsedMove.c, this.aiSymbol);
          moveMade = true;
          break;
        }
      } catch (error) {
        console.error("TicTacToe: Failed to generate AI move", error);
      }
    }

    if (!moveMade) {
      console.warn("TicTacToe: Making a random AI move");
      const randomMove =
        validMoves[Math.floor(Math.random() * validMoves.length)];
      this.makeMove(randomMove.r, randomMove.c, this.aiSymbol);
    }
  }

  parseAIMove(reply, validMoves) {
    reply = String(reply).trim();
    const match = reply.match(/\(?\s*(\d)\s*,\s*(\d)\s*\)?/);
    if (match) {
      const r = parseInt(match[1], 10);
      const c = parseInt(match[2], 10);
      if (validMoves.some((m) => m.r === r && m.c === c)) {
        return { r, c };
      }
    }
    // Fallback: check if reply contains any valid move string
    for (const move of validMoves) {
      if (
        reply.includes(`(${move.r}, ${move.c})`) ||
        reply.includes(`${move.r},${move.c}`)
      ) {
        return move;
      }
    }
    return null;
  }

  makeMove(r, c, symbol) {
    if (this.isGameOver || this.board[r][c]) return false;

    this.board[r][c] = symbol;
    this.moveHistory.push({ r, c, symbol });
    document.querySelector(
      `#${this.boardId} .cell[data-r="${r}"][data-c="${c}"]`
    ).textContent = symbol;
    this.currentPlayer =
      symbol === this.playerSymbol ? this.aiSymbol : this.playerSymbol;
    this.checkGameStatus();
    this.updateStatus();
    return true;
  }

  checkGameStatus() {
    const lines = [
      // Rows
      [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      [
        [1, 0],
        [1, 1],
        [1, 2],
      ],
      [
        [2, 0],
        [2, 1],
        [2, 2],
      ],
      // Cols
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [0, 2],
        [1, 2],
        [2, 2],
      ],
      // Diagonals
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
    ];

    for (const line of lines) {
      const [a, b, c] = line;
      if (
        this.board[a[0]][a[1]] &&
        this.board[a[0]][a[1]] === this.board[b[0]][b[1]] &&
        this.board[a[0]][a[1]] === this.board[c[0]][c[1]]
      ) {
        this.winner = this.board[a[0]][a[1]];
        this.isGameOver = true;
        this.endGame();
        return;
      }
    }

    if (this.getValidMoves().length === 0) {
      this.winner = "draw";
      this.isGameOver = true;
      this.endGame();
      return;
    }
  }

  handleCellClick(r, c) {
    if (
      this.isGameOver ||
      this.currentPlayer !== this.playerSymbol ||
      this.board[r][c]
    ) {
      return;
    }
    if (this.makeMove(r, c, this.playerSymbol)) {
      if (!this.isGameOver) {
        setTimeout(() => this.tryMoveOpponent(), 500); // AI moves after a short delay
      }
    }
  }

  undoLastTwoMoves() {
    if (this.moveHistory.length < 2) return; // Need at least one player and one AI move

    // Revert AI's move
    let lastMove = this.moveHistory.pop();
    this.board[lastMove.r][lastMove.c] = null;
    document.querySelector(
      `#${this.boardId} .cell[data-r="${lastMove.r}"][data-c="${lastMove.c}"]`
    ).textContent = "";

    // Revert Player's move
    lastMove = this.moveHistory.pop();
    this.board[lastMove.r][lastMove.c] = null;
    document.querySelector(
      `#${this.boardId} .cell[data-r="${lastMove.r}"][data-c="${lastMove.c}"]`
    ).textContent = "";

    this.currentPlayer = this.playerSymbol; // Player's turn again
    this.isGameOver = false;
    this.winner = null;
    this.updateStatus();
  }

  updateStatus() {
    const context = SillyTavern.getContext();
    if (this.isGameOver) {
      this.opponentStatusText.textContent = `Game over. ${this.getOutcome()}. Press ✕ to close.`;
      this.userStatusText.textContent = "";
    } else {
      if (this.currentPlayer === this.playerSymbol) {
        this.opponentStatusText.textContent = `${context.name2} (${this.aiSymbol}) is waiting.`;
        this.userStatusText.textContent = "Your turn!";
      } else {
        this.opponentStatusText.textContent = `${context.name2} (${this.aiSymbol}) is thinking...`;
        this.userStatusText.textContent = "Waiting for AI.";
      }
    }
  }

  async launch() {
    TicTacToeGame.gamesLaunched++;
    const context = SillyTavern.getContext();
    context.sendSystemMessage("generic", this.gameId);

    if (Array.isArray(context.chat)) {
      for (const message of context.chat) {
        if (message.mes === this.gameId) {
          message.mes = `[${context.name1} plays Tic-Tac-Toe against ${context.name2}]`;
          this.messageIndex = context.chat.indexOf(message);
          break;
        }
      }
    }

    const chat = document.getElementById("chat");
    const chatMessage = chat.querySelector(".last_mes");
    const messageText = chatMessage.querySelector(".mes_text");

    if (!messageText || !messageText.textContent.includes(this.gameId)) {
      // Fallback if last_mes is not the one, search for it
      const messages = Array.from(chat.querySelectorAll(".mes_text"));
      const targetMessageText = messages.find((m) =>
        m.textContent.includes(this.gameId)
      );
      if (targetMessageText) {
        this.messageText = targetMessageText;
        this.chatMessage = targetMessageText.closest(".mes");
      } else {
        console.error(
          "TicTacToe: Could not find the chat message for gameId:",
          this.gameId
        );
        return;
      }
    } else {
      this.messageText = messageText;
      this.chatMessage = chatMessage;
    }

    const activeChar = context.characters[context.characterId];
    this.chatMessage.classList.remove("last_mes");
    this.messageText.innerHTML = "";
    const container = document.createElement("div");
    container.classList.add(
      "flex-container",
      "flexFlowColumn",
      "flexGap10",
      "tictactoe-game"
    );
    this.messageText.appendChild(container);

    // Top Row (Opponent)
    const topRowContainer = document.createElement("div");
    topRowContainer.classList.add(
      "flex-container",
      "justifyContentFlexStart",
      "flexGap10",
      "alignItemsCenter"
    );
    const opponentAvatarContainer = document.createElement("div");
    opponentAvatarContainer.classList.add("avatar");
    const opponentAvatarImg = document.createElement("img");
    opponentAvatarImg.src = activeChar
      ? context.getThumbnailUrl("avatar", activeChar?.avatar)
      : "/img/logo.png";
    opponentAvatarContainer.appendChild(opponentAvatarImg);
    topRowContainer.appendChild(opponentAvatarContainer);
    const opponentNameContainer = document.createElement("h3");
    opponentNameContainer.classList.add("margin0");
    opponentNameContainer.textContent = `${
      activeChar?.name || "SillyTavern"
    } (${this.aiSymbol})`;
    topRowContainer.appendChild(opponentNameContainer);
    this.opponentStatusText = document.createElement("q");
    topRowContainer.appendChild(this.opponentStatusText);
    const expander = document.createElement("div");
    expander.classList.add("expander");
    topRowContainer.appendChild(expander);

    const undoButton = document.createElement("button");
    undoButton.title = "Undo Last Turn";
    undoButton.classList.add(
      "menu_button",
      "menu_button_icon",
      "fa-solid",
      "fa-undo"
    );
    undoButton.addEventListener("click", () => {
      if (
        !this.isGameOver &&
        this.currentPlayer === this.playerSymbol &&
        this.moveHistory.length >= 2
      ) {
        this.undoLastTwoMoves();
      }
    });
    topRowContainer.appendChild(undoButton);

    const endGameButton = document.createElement("button");
    endGameButton.title = "End Game";
    endGameButton.classList.add(
      "menu_button",
      "menu_button_icon",
      "fa-solid",
      "fa-times"
    );
    endGameButton.addEventListener("click", () => {
      if (!this.isGameOver) {
        // Prevent multiple calls if already ended
        this.winner = this.winner || "inconclusive"; // Mark as inconclusive if ended early
        this.endGame();
      }
    });
    topRowContainer.appendChild(endGameButton);
    container.appendChild(topRowContainer);

    // TicTacToe Board
    const boardElement = document.createElement("div");
    boardElement.id = this.boardId;
    boardElement.classList.add("tictactoe-board");
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = document.createElement("div");
        cell.classList.add("cell");
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.addEventListener("click", () => this.handleCellClick(r, c));
        boardElement.appendChild(cell);
      }
    }
    container.appendChild(boardElement);

    // Bottom Row (User)
    const selectedUserAvatar = document.querySelector(
      "#user_avatar_block .selected img"
    )?.src;
    const bottomRowContainer = document.createElement("div");
    bottomRowContainer.classList.add(
      "flex-container",
      "justifyContentFlexEnd",
      "flexGap10",
      "alignItemsCenter"
    );
    this.userStatusText = document.createElement("q");
    bottomRowContainer.appendChild(this.userStatusText);
    const userNameContainer = document.createElement("h3");
    userNameContainer.classList.add("margin0");
    userNameContainer.textContent = `${context.name1} (${this.playerSymbol})`;
    bottomRowContainer.appendChild(userNameContainer);
    const userAvatarContainer = document.createElement("div");
    userAvatarContainer.classList.add("avatar");
    const userAvatarImg = document.createElement("img");
    userAvatarImg.src = selectedUserAvatar || "/img/logo.png";
    userAvatarContainer.appendChild(userAvatarImg);
    bottomRowContainer.appendChild(userAvatarContainer);
    container.appendChild(bottomRowContainer);

    const order = (30000 + TicTacToeGame.gamesLaunched).toFixed(0); // Higher order to avoid conflict with chess
    this.chatMessage.style.order = order;
    chat.scrollTop = chat.scrollHeight;

    this.updateStatus();
    if (this.currentPlayer === this.aiSymbol) {
      setTimeout(() => this.tryMoveOpponent(), 500);
    }
  }
}

async function launchTicTacToeGame() {
    const context = SillyTavern.getContext();

    const modalBody = document.createElement('div');
    modalBody.classList.add('flex-container', 'flexFlowColumn');

    const modalText1 = document.createElement('div');
    modalText1.textContent = 'Play as:';
    modalBody.appendChild(modalText1);

    const symbolSelect = document.createElement('select');
    symbolSelect.id = 'tictactoe-symbol-select';
    symbolSelect.classList.add('text_pole');
    const xOption = document.createElement('option');
    xOption.value = 'X';
    xOption.textContent = 'X (Starts First)';
    symbolSelect.appendChild(xOption);
    const oOption = document.createElement('option');
    oOption.value = 'O';
    oOption.textContent = 'O';
    symbolSelect.appendChild(oOption);
    const randomOption = document.createElement('option');
    randomOption.value = 'random';
    randomOption.textContent = 'Random';
    symbolSelect.appendChild(randomOption);
    modalBody.appendChild(symbolSelect);

    symbolSelect.value = 'random';

    const result = await context.callPopup(modalBody, 'confirm', '', { okButton: 'Play', cancelButton: 'Cancel' });

    if (!result) {
        return;
    }

    const selectedSymbol = symbolSelect.value;
    const game = new TicTacToeGame(selectedSymbol);
    return game.launch();
}

function addLaunchButton() {
    const launchButton = document.createElement('div');
    launchButton.id = 'tictactoe-launch';
    launchButton.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    launchButton.tabIndex = 0;
    launchButton.title = 'Launch Tic-Tac-Toe Game';
    const tttIcon = document.createElement('i');
    tttIcon.classList.add('fa-solid', 'fa-border-all'); // Using a generic grid icon
    launchButton.appendChild(tttIcon);
    const tttText = document.createElement('span');
    tttText.textContent = 'Play Tic-Tac-Toe';
    launchButton.appendChild(tttText);

    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) {
        console.error('TicTacToe: Could not find the extensions menu');
        // Try to find a fallback or create if necessary, though this is risky.
        // For now, just log error. A more robust solution would be to wait for menu.
        return;
    }
    
    // Ensure chess_wand_container is handled if it exists from the chess extension
    const chessWandContainer = document.getElementById('chess_wand_container');
    const targetMenu = chessWandContainer || extensionsMenu;

    targetMenu.classList.add('interactable');
    targetMenu.tabIndex = 0;
    targetMenu.appendChild(launchButton);
    launchButton.addEventListener('click', launchTicTacToeGame);
}

(function () {
    // Wait for the DOM to be fully loaded before trying to add the button
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        addLaunchButton();
    } else {
        document.addEventListener('DOMContentLoaded', addLaunchButton);
    }

    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.makeLast(event_types.CHAT_CHANGED, () => {
        const { chatMetadata } = SillyTavern.getContext();
        for (const key in chatMetadata) {
            if (/tictactoe-[a-z0-9]+$/.test(key)) {
                console.log('TicTacToe: Removing stuck inject', key);
                delete chatMetadata[key];
            }
        }
    });
})();
